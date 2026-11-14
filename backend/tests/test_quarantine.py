"""Uncapped record-level audit and replay use real SQL Server savepoints."""
from contextlib import contextmanager
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.models import ImportBatch, ImportJob, ImportLog, ImportQuarantine, Observation, QualityReport
from app.services.ingestion import ImportFailure, backfill_quarantine, retry_quarantine, run_import
from app.services.ingestion import pipeline
from app.services.ingestion.validation import RowValidationError, parse_row
from test_ingestion import source_row, write_csv


@pytest.fixture
def audited_import(tmp_path, monkeypatch, sql_session):
    connection = sql_session.connection()
    path = tmp_path / 'source.csv'
    settings = SimpleNamespace(data_file_path=path, audit_file_path=tmp_path / 'absent-audit.json',
                               import_batch_size=2)
    monkeypatch.setattr(pipeline, 'get_settings', lambda: settings)

    @contextmanager
    def locked_test_connection():
        yield connection

    monkeypatch.setattr(pipeline, '_locked_connection', locked_test_connection)

    def new_job():
        identifier = str(uuid4())
        with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
            session.add(ImportJob(id=identifier))
            session.commit()
        return identifier

    return connection, path, new_job


def _retired_boolean_policy(raw):
    if raw['aqua_day_valid'] == '1.0':
        raise RowValidationError('invalid_boolean', 'aqua_day_valid')
    return parse_row(raw)


def _policy_rows():
    return [source_row(grid_id=f'policy-cell-{i}', aqua_day_valid='1.0' if i % 2 else '1')
            for i in range(4)]


@pytest.mark.integration
def test_every_rejection_is_quarantined_even_after_log_limit(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    rows = [source_row(grid_id=f'audit-{i}', latitude='99' if i else '27.2') for i in range(5)]
    write_csv(path, rows)
    monkeypatch.setattr(pipeline, 'MAX_LOGS', 1)
    identifier = new_job()
    result = run_import(identifier)
    assert result['processed_rows'] == 5
    assert result['inserted_rows'] == 1
    assert result['rejected_rows'] == 4
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        quarantines = list(session.scalars(select(ImportQuarantine)
                           .where(ImportQuarantine.job_id == identifier).order_by(ImportQuarantine.source_row)))
        assert [q.source_row for q in quarantines] == [2, 3, 4, 5]
        assert all(q.raw_payload == rows[q.source_row - 1] for q in quarantines)
        assert all(q.resolution == 'pending' for q in quarantines)
        assert session.scalar(select(func.count()).select_from(ImportLog)
                              .where(ImportLog.job_id == identifier)) == 1
        batches = list(session.scalars(select(ImportBatch).where(ImportBatch.job_id == identifier)))
        assert len(batches) == 3
        assert sum(b.processed_rows for b in batches) == 5
        assert all(b.processed_rows == b.inserted_rows + b.duplicate_rows + b.rejected_rows for b in batches)
        observation = session.scalar(select(Observation).where(Observation.import_job_id == identifier))
        assert observation.import_batch_id in {b.id for b in batches}


@pytest.mark.integration
def test_observation_batch_and_quarantine_rollback_together(audited_import):
    connection, path, new_job = audited_import
    write_csv(path, [source_row(grid_id=f'rollback-{i}', latitude='99' if i % 2 else '27.2')
                     for i in range(4)])
    identifier = new_job()
    calls = 0

    def fail_second_quarantine(conn, cursor, statement, parameters, context, executemany):
        nonlocal calls
        if statement.startswith('INSERT INTO import_quarantine'):
            calls += 1
            if calls == 2:
                raise RuntimeError('Synthetic rollback-only failure')

    event.listen(connection, 'before_cursor_execute', fail_second_quarantine)
    try:
        with pytest.raises(ImportFailure, match='IMPORT_FAILED'):
            run_import(identifier)
    finally:
        event.remove(connection, 'before_cursor_execute', fail_second_quarantine)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, identifier)
        assert (job.processed_rows, job.inserted_rows, job.rejected_rows, job.checkpoint_row) == (2, 1, 1, 2)
        for model in (ImportBatch, ImportQuarantine):
            assert session.scalar(select(func.count()).select_from(model).where(model.job_id == identifier)) == 1
        assert session.scalar(select(func.count()).select_from(Observation)
                              .where(Observation.import_job_id == identifier)) == 1
    result = run_import(identifier)
    assert result['processed_rows'] == 4
    assert result['inserted_rows'] == result['rejected_rows'] == 2


@pytest.mark.integration
def test_quarantine_replay_pause_resume_and_duplicate_retry(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    write_csv(path, _policy_rows())
    historical = new_job()
    monkeypatch.setattr(pipeline, 'parse_row', _retired_boolean_policy)
    assert run_import(historical)['rejected_rows'] == 2
    monkeypatch.setattr(pipeline, 'parse_row', parse_row)
    recovery = new_job()
    first = retry_quarantine(recovery, historical, max_rows=1)
    assert first['status'] == 'paused'
    assert (first['processed_rows'], first['inserted_rows'], first['checkpoint_row']) == (1, 1, 2)
    assert first['scope']['kind'] == 'quarantine_replay'
    final = retry_quarantine(recovery, historical)
    assert final['status'] == 'completed'
    assert final['processed_rows'] == final['inserted_rows'] == 2
    assert final['total_rows'] == 2
    assert final['checkpoint_row'] == 4
    assert retry_quarantine(recovery, historical) == final
    duplicate = retry_quarantine(new_job(), historical)
    assert duplicate['processed_rows'] == duplicate['duplicate_rows'] == 2
    assert duplicate['inserted_rows'] == duplicate['rejected_rows'] == 0
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        originals = list(session.scalars(select(ImportQuarantine).where(ImportQuarantine.job_id == historical)))
        assert all(q.resolution == 'resolved' and q.resolved_by_job_id == recovery for q in originals)
        assert all(q.resolved_observation_id is not None for q in originals)
        assert session.scalar(select(func.count()).select_from(Observation)
                              .where(Observation.dataset_version_id == final['dataset_version_id'])) == 4


@pytest.mark.integration
def test_replay_refuses_changed_quarantine_payload(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    write_csv(path, _policy_rows())
    historical = new_job()
    monkeypatch.setattr(pipeline, 'parse_row', _retired_boolean_policy)
    run_import(historical)
    monkeypatch.setattr(pipeline, 'parse_row', parse_row)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        original = session.scalar(select(ImportQuarantine).where(ImportQuarantine.job_id == historical))
        original.raw_payload = {**original.raw_payload, 'terra_lst_day_c': '999'}
        session.commit()
    recovery = new_job()
    with pytest.raises(ImportFailure, match='QUARANTINE_PAYLOAD_CHANGED'):
        retry_quarantine(recovery, historical)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, recovery)
        assert job.status == 'failed'
        assert job.processed_rows == job.checkpoint_row == 0


@pytest.mark.integration
def test_legacy_backfill_is_idempotent_and_retains_original_counters(audited_import):
    connection, path, new_job = audited_import
    rows = _policy_rows()
    write_csv(path, rows)
    completed = run_import(new_job())
    historical = new_job()
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, historical)
        job.dataset_version_id = completed['dataset_version_id']
        job.status = 'failed'
        job.error_code = 'VALIDATION_POLICY_UPDATED'
        job.processed_rows = job.checkpoint_row = 4
        job.inserted_rows = job.rejected_rows = 2
        session.commit()
    with pytest.raises(ImportFailure, match='JOB_SCOPE_CONFLICT'):
        retry_quarantine(completed['job_id'], historical)
    records = [(n, rows[n-1], 'invalid_boolean', 'aqua_day_valid') for n in (2, 4)]
    result = backfill_quarantine(historical, iter(records), batch_size=1)
    assert result == {'job_id': historical, 'stored': 2, 'already_present': 0, 'already_resolved': 2}
    result = backfill_quarantine(historical, iter(records))
    assert result['stored'] == 0 and result['already_present'] == 2
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, historical)
        assert (job.processed_rows, job.inserted_rows, job.rejected_rows) == (4, 2, 2)
        quarantines = list(session.scalars(select(ImportQuarantine).where(ImportQuarantine.job_id == historical)))
        assert len(quarantines) == 2
        assert all(q.resolution == 'resolved' and q.resolved_observation_id for q in quarantines)


@pytest.mark.integration
def test_quarantine_replay_failures_remain_audited(audited_import):
    connection, path, new_job = audited_import
    write_csv(path, [source_row(grid_id='still-invalid', latitude='99')])
    historical = new_job()
    run_import(historical)
    recovery = new_job()
    result = retry_quarantine(recovery, historical)
    assert result['processed_rows'] == result['rejected_rows'] == 1
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        originals = list(session.scalars(select(ImportQuarantine).where(ImportQuarantine.job_id == historical)))
        attempts = list(session.scalars(select(ImportQuarantine).where(ImportQuarantine.job_id == recovery)))
        assert len(originals) == len(attempts) == 1
        assert originals[0].resolution == attempts[0].resolution == 'pending'
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == recovery))
        assert report.report_json['accounting_reconciled'] is True


@pytest.mark.integration
def test_ordinary_idempotent_import_resolves_matching_old_quarantine(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    write_csv(path, _policy_rows())
    historical = new_job()
    monkeypatch.setattr(pipeline, 'parse_row', _retired_boolean_policy)
    run_import(historical)
    monkeypatch.setattr(pipeline, 'parse_row', parse_row)
    recovery = new_job()
    result = run_import(recovery)
    assert result['inserted_rows'] == result['duplicate_rows'] == 2
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        originals = list(session.scalars(select(ImportQuarantine).where(ImportQuarantine.job_id == historical)))
        assert all(q.resolution == 'resolved' and q.resolved_by_job_id == recovery for q in originals)
        assert all(q.resolved_observation_id is not None for q in originals)


def _historical_policy_job(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    write_csv(path, _policy_rows())
    historical = new_job()
    with monkeypatch.context() as retired:
        retired.setattr(pipeline, 'parse_row', _retired_boolean_policy)
        assert run_import(historical)['rejected_rows'] == 2
    return connection, new_job, historical


def _prepare_queued_replay(connection, new_job, historical):
    target = new_job()
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, target)
        job.dataset_version_id = session.get(ImportJob, historical).dataset_version_id
        job.scope_json = {'kind': 'quarantine_replay', 'source_job_id': historical}
        session.commit()
    return target


@pytest.mark.integration
def test_api_style_prepared_scope_initializes_snapshot(audited_import, monkeypatch):
    connection, new_job, historical = _historical_policy_job(audited_import, monkeypatch)
    target = _prepare_queued_replay(connection, new_job, historical)
    result = retry_quarantine(target, historical)
    assert result['status'] == 'completed'
    assert result['processed_rows'] == result['inserted_rows'] == result['total_rows'] == 2
    assert result['scope']['quarantine_max_id'] > 0
    assert result['scope']['source_job_id'] == historical
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target))
        assert report.report_json['status'] == 'completed'
        assert report.report_json['scope'] == result['scope']


@pytest.mark.integration
def test_running_resume_preserves_snapshot_when_source_gets_new_rejections(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    rows = [*_policy_rows(), source_row(grid_id='later-policy-cell', aqua_day_valid='1.0')]
    write_csv(path, rows)
    historical = new_job()
    with monkeypatch.context() as retired:
        retired.setattr(pipeline, 'parse_row', _retired_boolean_policy)
        assert run_import(historical, max_rows=4)['status'] == 'paused'
    target = _prepare_queued_replay(connection, new_job, historical)
    first = retry_quarantine(target, historical, max_rows=1)
    boundary = first['scope']['quarantine_max_id']
    with monkeypatch.context() as retired:
        retired.setattr(pipeline, 'parse_row', _retired_boolean_policy)
        assert run_import(historical)['rejected_rows'] == 3
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, target)
        job.status = 'running'  # Simulate interruption after the last committed checkpoint.
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target))
        report.report_json = {**report.report_json, 'status': 'running'}
        session.commit()
    final = retry_quarantine(target, historical)
    assert final['scope']['quarantine_max_id'] == boundary
    assert final['total_rows'] == final['processed_rows'] == final['inserted_rows'] == 2
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        late = session.scalar(select(ImportQuarantine).where(
            ImportQuarantine.job_id == historical, ImportQuarantine.source_row == 5))
        assert late.id > boundary and late.resolution == 'pending'


@pytest.mark.integration
def test_failed_replay_quality_state_and_resume_are_consistent(audited_import, monkeypatch):
    connection, new_job, historical = _historical_policy_job(audited_import, monkeypatch)
    target = _prepare_queued_replay(connection, new_job, historical)
    inserts = 0

    def fail_second_insert(conn, cursor, statement, parameters, context, executemany):
        nonlocal inserts
        if statement.startswith('INSERT INTO observations'):
            inserts += 1
            if inserts == 2:
                raise RuntimeError('C:/private/never-expose-fixture.csv')

    settings = pipeline.get_settings()
    settings.import_batch_size = 1
    event.listen(connection, 'before_cursor_execute', fail_second_insert)
    try:
        with pytest.raises(ImportFailure, match='QUARANTINE_REPLAY_FAILED') as failure:
            retry_quarantine(target, historical)
        assert 'private' not in str(failure.value)
    finally:
        event.remove(connection, 'before_cursor_execute', fail_second_insert)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, target)
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target))
        boundary = job.scope_json['quarantine_max_id']
        assert job.status == report.report_json['status'] == 'failed'
        assert job.error_code == report.report_json['error_code'] == 'QUARANTINE_REPLAY_FAILED'
        assert job.processed_rows == report.report_json['processed_rows'] == 1
        assert job.checkpoint_row == report.report_json['checkpoint_row'] == 2
    final = retry_quarantine(target, historical)
    assert final['status'] == 'completed'
    assert final['scope']['quarantine_max_id'] == boundary
    assert final['processed_rows'] == final['inserted_rows'] == 2
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, target)
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target))
        assert job.error_code is None
        assert report.report_json['status'] == 'completed'
        assert 'error_code' not in report.report_json


@pytest.mark.integration
@pytest.mark.parametrize('invalid,code', [
    ('missing', 'QUARANTINE_SNAPSHOT_REQUIRED'),
    ('negative', 'QUARANTINE_SCOPE_INVALID'),
    ('boolean', 'QUARANTINE_SCOPE_INVALID'),
    ('unknown_boundary', 'QUARANTINE_SNAPSHOT_INVALID'),
    ('wrong_count', 'QUARANTINE_SNAPSHOT_COUNT_CHANGED'),
    ('checkpoint_gap', 'QUARANTINE_CHECKPOINT_INVALID'),
])
def test_invalid_processed_replay_is_rejected_without_reset(audited_import, monkeypatch, invalid, code):
    connection, new_job, historical = _historical_policy_job(audited_import, monkeypatch)
    target = _prepare_queued_replay(connection, new_job, historical)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        boundary = session.scalar(select(func.max(ImportQuarantine.id))
                                  .where(ImportQuarantine.job_id == historical))
        scope = {'kind': 'quarantine_replay', 'source_job_id': historical}
        if invalid != 'missing':
            maximum = {'negative': -1, 'boolean': True, 'unknown_boundary': boundary + 100000}.get(invalid, boundary)
            scope.update(quarantine_max_id=maximum, selection='all_source_job_quarantine_records_at_start')
        job = session.get(ImportJob, target)
        job.scope_json = scope
        job.status = 'paused'
        job.processed_rows = job.duplicate_rows = 1
        job.checkpoint_row = 3 if invalid == 'checkpoint_gap' else 2
        job.total_rows = 3 if invalid == 'wrong_count' else 2
        expected = (job.processed_rows, job.duplicate_rows, job.checkpoint_row, job.total_rows)
        session.commit()
    with pytest.raises(ImportFailure, match=code):
        retry_quarantine(target, historical)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, target)
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target))
        assert (job.processed_rows, job.duplicate_rows, job.checkpoint_row, job.total_rows) == expected
        assert job.scope_json == scope
        assert job.status == report.report_json['status'] == 'failed'
        assert job.error_code == report.report_json['error_code'] == code


@pytest.mark.integration
def test_conflicting_source_does_not_relabel_a_valid_paused_job(audited_import, monkeypatch):
    connection, new_job, historical = _historical_policy_job(audited_import, monkeypatch)
    target = _prepare_queued_replay(connection, new_job, historical)
    first = retry_quarantine(target, historical, max_rows=1)
    other = new_job()
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        session.get(ImportJob, other).dataset_version_id = first['dataset_version_id']
        session.commit()
    with pytest.raises(ImportFailure, match='JOB_SCOPE_CONFLICT'):
        retry_quarantine(target, other)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, target)
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target))
        assert job.status == report.report_json['status'] == 'paused'
        assert job.scope_json == first['scope']
        assert job.processed_rows == first['processed_rows']


@pytest.mark.integration
def test_empty_initialized_snapshot_stays_empty_and_is_idempotent(audited_import, monkeypatch):
    connection, path, new_job = audited_import
    write_csv(path, [source_row(grid_id='empty-snapshot-source'),
                     source_row(grid_id='later-empty-snapshot-row', aqua_day_valid='1.0')])
    historical = new_job()
    assert run_import(historical, max_rows=1)['status'] == 'paused'
    target = _prepare_queued_replay(connection, new_job, historical)
    first = retry_quarantine(target, historical)
    assert first['status'] == 'completed'
    assert first['scope']['quarantine_max_id'] == first['total_rows'] == first['processed_rows'] == 0
    with monkeypatch.context() as retired:
        retired.setattr(pipeline, 'parse_row', _retired_boolean_policy)
        assert run_import(historical)['rejected_rows'] == 1
    assert retry_quarantine(target, historical) == first
