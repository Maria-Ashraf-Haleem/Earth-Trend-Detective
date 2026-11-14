"""Public producer and CLI worker run only on a guarded, rolled-back SQL connection."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
from types import SimpleNamespace
from uuid import uuid4

from pydantic import SecretStr
import pytest
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session, sessionmaker

from app import cli
from app.models import DatasetVersion, ImportJob, ImportQuarantine, Observation, QualityReport
from app.services.catalog import DATASET_ID
from app.services.ingestion import pipeline
from app.services.ingestion import ImportFailure
from app.services.ingestion.validation import parse_row
from test_ingestion import source_row


@pytest.fixture
def replay_workflow(sql_connection, sql_session, monkeypatch):
    """All API, dispatcher and worker sessions share the outer rollback fixture."""
    assert sql_connection.in_transaction()
    token = uuid4().hex
    version = DatasetVersion(dataset_id=DATASET_ID, sha256=token * 2, source_size=0,
                             audit_json={'synthetic_rollback_fixture': True})
    sql_session.add(version)
    sql_session.flush()
    historical = ImportJob(id=str(uuid4()), dataset_version_id=version.id, status='failed',
        processed_rows=2, inserted_rows=0, duplicate_rows=0, rejected_rows=2,
        checkpoint_row=2, total_rows=2, error_code='VALIDATION_POLICY_UPDATED')
    sql_session.add(historical)
    sql_session.flush()
    for number in (1, 2):
        raw = source_row(grid_id=f'workflow-{token}-{number}', aqua_day_valid='1.0')
        sql_session.add(ImportQuarantine(job_id=historical.id, dataset_version_id=version.id,
            source_row=number, row_hash=parse_row(raw).row_hash, error_code='invalid_boolean',
            error_field='aqua_day_valid', raw_payload=raw))
    sql_session.flush()

    @contextmanager
    def locked_rollback_connection():
        assert sql_connection.in_transaction()
        yield sql_connection

    factory = sessionmaker(bind=sql_connection, join_transaction_mode='create_savepoint', expire_on_commit=False)
    monkeypatch.setattr(cli, 'get_session_factory', lambda: factory)
    monkeypatch.setattr(cli, 'get_settings', lambda: SimpleNamespace(log_level='WARNING'))
    monkeypatch.setattr(pipeline, '_locked_connection', locked_rollback_connection)
    monkeypatch.setattr(pipeline, 'get_settings', lambda: SimpleNamespace(import_batch_size=1))

    def prevent_outside_writes(conn, cursor, statement, parameters, context, executemany):
        verb = statement.lstrip().split(None, 1)[0].upper()
        if verb in {'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'CREATE', 'ALTER', 'DROP', 'TRUNCATE'}:
            assert conn is sql_connection, 'A test write escaped the controlled rollback connection'
            assert verb not in {'CREATE', 'ALTER', 'DROP', 'TRUNCATE'}, 'Tests may not change schema'

    event.listen(sql_connection.engine, 'before_cursor_execute', prevent_outside_writes)
    try:
        yield {'source_job_id': historical.id, 'version_id': version.id, 'factory': factory}
    finally:
        event.remove(sql_connection.engine, 'before_cursor_execute', prevent_outside_writes)
        assert sql_connection.in_transaction()


@pytest.mark.integration
def test_public_queue_dispatches_to_worker_and_resumes_snapshot(
    sql_client, sql_session, sql_connection, replay_workflow, monkeypatch,
):
    from app.main import settings
    monkeypatch.setattr(settings, 'import_api_key', SecretStr('rollback-only-workflow-key'))
    response = sql_client.post('/api/v1/imports', json={
        'retry_quarantine_job_id': replay_workflow['source_job_id'],
    }, headers={'X-Import-Key': 'rollback-only-workflow-key'})
    assert response.status_code == 202, response.text
    queued = response.json()['job']
    assert queued['scope'] == {'kind': 'quarantine_replay', 'source_job_id': replay_workflow['source_job_id']}
    first = cli.execute_job(queued['id'], max_rows=1)
    assert first['status'] == 'paused'
    assert first['processed_rows'] == first['inserted_rows'] == 1
    boundary = first['scope']['quarantine_max_id']
    with Session(bind=sql_connection, join_transaction_mode='create_savepoint') as session:
        target = session.get(ImportJob, queued['id'])
        target.status = 'failed'
        target.error_code = 'SYNTHETIC_ROLLBACK_INTERRUPTION'
        target.finished_at = datetime.now(timezone.utc).replace(tzinfo=None)
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == target.id))
        report.report_json = {**report.report_json, 'status': 'failed', 'error_code': target.error_code}
        session.commit()
    sql_session.expire_all()
    resumed = sql_client.post('/api/v1/imports', json={'resume_job_id': queued['id']},
                              headers={'X-Import-Key': 'rollback-only-workflow-key'})
    assert resumed.status_code == 202, resumed.text
    queued_again = resumed.json()['job']
    assert queued_again['status'] == 'queued'
    assert queued_again['error_code'] is None and queued_again['finished_at'] is None
    assert queued_again['scope']['quarantine_max_id'] == boundary
    with Session(bind=sql_connection, join_transaction_mode='create_savepoint') as session:
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == queued['id']))
        assert report.report_json['status'] == 'queued'
        assert 'error_code' not in report.report_json
    final = cli.execute_job(queued['id'])
    assert final['status'] == 'completed'
    assert final['scope']['quarantine_max_id'] == boundary
    assert final['processed_rows'] == final['inserted_rows'] == final['total_rows'] == 2
    assert cli.execute_job(queued['id']) == final
    with Session(bind=sql_connection, join_transaction_mode='create_savepoint') as session:
        assert session.scalar(select(func.count()).select_from(Observation)
                              .where(Observation.dataset_version_id == replay_workflow['version_id'])) == 2
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == queued['id']))
        assert report.report_json['status'] == 'completed'
        assert 'error_code' not in report.report_json
        assert all(q.resolution == 'resolved' for q in session.scalars(select(ImportQuarantine)
                   .where(ImportQuarantine.job_id == replay_workflow['source_job_id'])))


@pytest.mark.integration
def test_cli_retry_command_initializes_prepared_scope_and_is_idempotent(
    sql_connection, replay_workflow, monkeypatch, capsys,
):
    monkeypatch.setattr('sys.argv', ['earthtrend', 'retry-quarantine',
                        '--source-job-id', replay_workflow['source_job_id']])
    assert cli.main() == 0
    output = [json.loads(line) for line in capsys.readouterr().out.splitlines() if line.strip()]
    result = output[-1]
    assert result['status'] == 'completed'
    assert result['processed_rows'] == result['inserted_rows'] == 2
    assert result['scope']['quarantine_max_id'] > 0
    assert result['scope']['source_job_id'] == replay_workflow['source_job_id']
    assert cli.execute_job(result['job_id']) == result
    with Session(bind=sql_connection, join_transaction_mode='create_savepoint') as session:
        assert session.get(ImportJob, result['job_id']).status == 'completed'


@pytest.mark.integration
def test_cli_missing_source_does_not_create_orphan_queue(replay_workflow, monkeypatch, capsys):
    missing = str(uuid4())
    monkeypatch.setattr('sys.argv', ['earthtrend', 'retry-quarantine', '--source-job-id', missing])
    assert cli.main() == 1
    result = capsys.readouterr()
    assert result.out == ''
    assert json.loads(result.err) == {'error_code': 'JOB_NOT_FOUND'}
    with replay_workflow['factory']() as session:
        assert session.scalar(select(func.count()).select_from(ImportJob).where(
            ImportJob.scope_json['source_job_id'].as_string() == missing)) == 0


@pytest.mark.integration
@pytest.mark.parametrize('scope,code', [
    (['malformed'], 'JOB_SCOPE_CONFLICT'),
    ({'kind': 'unknown'}, 'JOB_SCOPE_CONFLICT'),
    ({'kind': 'quarantine_replay'}, 'QUARANTINE_SCOPE_INVALID'),
    ({'kind': 'quarantine_replay', 'source_job_id': 17}, 'QUARANTINE_SCOPE_INVALID'),
])
def test_malformed_dispatch_is_sanitized_and_does_not_poison_queue(replay_workflow, scope, code):
    identifier = cli.new_job(scope)
    with pytest.raises(ImportFailure, match=code):
        cli.execute_job(identifier)
    with replay_workflow['factory']() as session:
        job = session.get(ImportJob, identifier)
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == identifier))
        assert job.status == report.report_json['status'] == 'failed'
        assert job.error_code == report.report_json['error_code'] == code
        assert job.scope_json == scope
        assert job.processed_rows == job.checkpoint_row == 0
