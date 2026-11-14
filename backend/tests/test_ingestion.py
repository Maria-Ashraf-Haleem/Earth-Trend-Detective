"""Pure CSV tests plus SQL Server import integration inside rolled-back transactions."""

import csv
import json
from types import SimpleNamespace
from uuid import uuid4
from contextlib import contextmanager

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.orm import Session

from app.models import ImportJob, ImportLog, Observation, QualityReport, SpatialCell
from app.services.ingestion import ImportFailure, run_import
from app.services.ingestion import pipeline
from app.services.ingestion.validation import (
    FLAG_FIELDS, MEASUREMENT_FIELDS, REQUIRED_FIELDS, STATUS_FIELDS,
    RowValidationError, parse_row,
)


def source_row(**changes):
    row = {field: "" for field in REQUIRED_FIELDS}
    row.update(grid_id="SR-ORG:6974|926.6254331|25100.5|7500.5", longitude="33.8",
               latitude="27.2", observation_date="2003-01-01", year="2003", month="1",
               day_of_year="1", season_sin="0.017202", season_cos="0.999852", split="train",
               terra_lst_day_c="28.17", terra_lst_night_c="8.91", aqua_lst_day_c="32.91",
               aqua_lst_night_c="6.27", terra_night_qc="0", aqua_night_qc="65")
    row.update({field: "0" if "masked" in field else "1" for field in FLAG_FIELDS})
    row.update({field: "ACCEPTED" for field in STATUS_FIELDS})
    row.update(changes)
    return row


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=sorted(REQUIRED_FIELDS))
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def importer(tmp_path, monkeypatch, sql_session):
    connection = sql_session.connection()
    csv_path = tmp_path / "source.csv"
    audit_path = tmp_path / "audit.json"
    audit_path.write_text(json.dumps({"rows": 6, "status": "test_fixture"}), encoding="utf-8")
    settings = SimpleNamespace(data_file_path=csv_path, audit_file_path=audit_path, import_batch_size=2)
    monkeypatch.setattr(pipeline, "get_settings", lambda: settings)

    @contextmanager
    def locked_test_connection():
        yield connection

    monkeypatch.setattr(pipeline, "_locked_connection", locked_test_connection)

    def job():
        identifier = str(uuid4())
        with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
            session.add(ImportJob(id=identifier))
            session.commit()
        return identifier

    yield connection, settings, job


def test_preserves_zero_missing_and_original_quality_fields():
    parsed = parse_row(source_row(observation_date="2021-01-01", year="2021",
                                 ghsl_2020_built_surface_m2_sum="0", ghsl_2020_valid_pixel_count="88",
                                 terra_evi_spatial_prev_month="1.2"))
    assert parsed.measurements["ghsl_2020_built_surface_m2_sum"] == 0
    assert parsed.measurements["terra_ndvi_spatial_prev_month"] is None
    assert parsed.measurements["terra_evi_spatial_prev_month"] == 1.2
    assert parsed.source_metadata["aqua_night_qc"] == "65"
    assert not set(MEASUREMENT_FIELDS).intersection(parsed.source_metadata)


@pytest.mark.parametrize('encoded', ['0.0', '65.0', '65.000', '6.5e1'])
def test_integral_decimal_qc_is_valid_and_original_lexeme_is_preserved(encoded):
    parsed = parse_row(source_row(aqua_night_qc=encoded))
    assert parsed.source_metadata['aqua_night_qc'] == encoded


@pytest.mark.parametrize('encoded', ['0.5', 'NaN', 'Infinity', '1e999999', '1e9999999', '256.0'])
def test_fractional_nonfinite_and_out_of_range_qc_remain_invalid(encoded):
    with pytest.raises(RowValidationError):
        parse_row(source_row(aqua_night_qc=encoded))


def test_decimal_boolean_encodings_validate_semantics_and_preserve_source_strings():
    flags = {field: '0.0' if 'masked' in field else '1.0' for field in FLAG_FIELDS}
    parsed = parse_row(source_row(**flags))
    assert all(parsed.source_metadata[field] == value for field, value in flags.items())
    assert parsed.measurements['aqua_lst_day_c'] == 32.91


def test_decimal_masked_boolean_retains_missing_value_and_blank_qc():
    parsed = parse_row(source_row(aqua_night_valid='0.0', aqua_night_qa_accepted='0.0',
                                  aqua_night_qc_source_masked='1.0', aqua_night_qc='',
                                  aqua_lst_night_c=''))
    assert parsed.measurements['aqua_lst_night_c'] is None
    assert parsed.source_metadata['aqua_night_qc'] == ''
    assert parsed.source_metadata['aqua_night_valid'] == '0.0'


@pytest.mark.parametrize('encoded', ['0.5', '2.0', 'NaN', 'Infinity', '', 'True'])
def test_non_boolean_numeric_or_text_flags_are_rejected(encoded):
    with pytest.raises(RowValidationError, match='invalid_boolean'):
        parse_row(source_row(aqua_day_valid=encoded))


def test_missing_sensor_retrieval_retains_unknown_qa_and_independent_context():
    row = source_row(observation_date='2022-04-07', year='2022', month='4', day_of_year='97', split='test',
                     aqua_lst_day_c='', aqua_lst_night_c='', aqua_night_qc='',
                     aqua_day_valid='', aqua_night_valid='', aqua_day_qa_accepted='',
                     aqua_night_qa_accepted='', aqua_day_status='', aqua_night_status='',
                     aqua_night_qc_source_masked='', aqua_ndvi_spatial_prev_month='0.09753125',
                     aqua_evi_spatial_prev_month='0.07875937499999999',
                     ghsl_2020_built_surface_m2_sum='0', ghsl_2020_valid_pixel_count='79')
    parsed = parse_row(row)
    assert parsed.measurements['aqua_lst_day_c'] is None
    assert parsed.measurements['terra_lst_day_c'] == 28.17
    assert parsed.measurements['aqua_ndvi_spatial_prev_month'] == 0.09753125
    assert parsed.measurements['ghsl_2020_built_surface_m2_sum'] == 0
    for field in FLAG_FIELDS + STATUS_FIELDS + ('aqua_night_qc',):
        if field.startswith('aqua_'):
            assert parsed.source_metadata[field] == ''


def test_nonmissing_sensor_value_cannot_claim_unknown_validity():
    with pytest.raises(RowValidationError):
        parse_row(source_row(aqua_day_valid='', aqua_day_qa_accepted='', aqua_day_status=''))


@pytest.mark.parametrize("changes,code", [
    ({"terra_lst_day_c": "NaN"}, "not_finite"),
    ({"terra_lst_day_c": "inf"}, "not_finite"),
    ({"latitude": "91"}, "out_of_bounds"),
    ({"month": "2"}, "date_mismatch"),
    ({"terra_day_valid": "true"}, "invalid_boolean"),
    ({"terra_day_valid": "0"}, "measurement_flag_mismatch"),
    ({"terra_night_qc": "256"}, "out_of_bounds"),
    ({"terra_night_qc_source_masked": "1"}, "masked_qc_present"),
    ({"ghsl_2020_built_surface_m2_sum": "10"}, "snapshot_not_yet_available"),
    ({"terra_ndvi_spatial_prev_month": "1.5"}, "out_of_bounds"),
])
def test_rejects_invalid_source_values(changes, code):
    with pytest.raises(RowValidationError) as error:
        parse_row(source_row(**changes))
    assert error.value.code == code


def test_masked_missing_qc_remains_missing():
    parsed = parse_row(source_row(terra_night_qc="", terra_night_qc_source_masked="1",
                                 terra_lst_night_c="", terra_night_valid="0",
                                 terra_night_qa_accepted="0", terra_night_status="NO_VALID_SOURCE_VALUE"))
    assert parsed.source_metadata["terra_night_qc"] == ""
    assert parsed.measurements["terra_lst_night_c"] is None


def test_pause_resume_and_new_job_idempotence(importer, monkeypatch):
    connection, settings, job = importer
    rows = [source_row(grid_id=f"cell-{i}") for i in range(6)]
    write_csv(settings.data_file_path, rows)
    observed_sizes = []
    original = pipeline._process_batch

    def bounded(*args, **kwargs):
        observed_sizes.append(len(args[2]))
        return original(*args, **kwargs)

    monkeypatch.setattr(pipeline, "_process_batch", bounded)
    identifier = job()
    paused = run_import(identifier, max_rows=3)
    assert paused["status"] == "paused"
    assert paused["checkpoint_row"] == paused["inserted_rows"] == 3
    resumed = run_import(identifier)
    assert resumed["status"] == "completed"
    assert resumed["inserted_rows"] == resumed["processed_rows"] == 6
    assert max(observed_sizes) <= 2
    again = run_import(job())
    assert again["inserted_rows"] == 0
    assert again["duplicate_rows"] == 6
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        version = session.get(ImportJob, identifier).dataset_version_id
        assert session.scalar(select(func.count()).select_from(Observation).where(Observation.dataset_version_id == version)) == 6
        assert session.scalar(select(func.count()).select_from(SpatialCell).where(SpatialCell.grid_id.in_([f"cell-{i}" for i in range(6)]))) == 6
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == identifier))
        assert report.report_json["status"] == "completed"
        assert report.report_json["measurement_present"]["terra_lst_day_c"] == 6
        assert report.report_json["measurement_missing"]["terra_ndvi_spatial_prev_month"] == 6


def test_duplicates_conflicts_and_invalid_rows_are_audited(importer):
    connection, settings, job = importer
    first = source_row()
    write_csv(settings.data_file_path, [first, first, source_row(terra_lst_day_c="29"),
                                        source_row(grid_id="bad", latitude="999"),
                                        source_row(grid_id="another")])
    identifier = job()
    result = run_import(identifier)
    assert result["inserted_rows"] == 2
    assert result["duplicate_rows"] == 1
    assert result["rejected_rows"] == 2
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        codes = set(session.scalars(select(ImportLog.code).where(ImportLog.job_id == identifier)))
        assert codes == {"observation_key_conflict", "out_of_bounds"}


def test_resume_refuses_changed_source_content(importer):
    connection, settings, job = importer
    rows = [source_row(grid_id=f"cell-{i}") for i in range(3)]
    write_csv(settings.data_file_path, rows)
    identifier = job()
    run_import(identifier, max_rows=1)
    rows[0]["terra_lst_day_c"] = "99"
    write_csv(settings.data_file_path, rows)
    with pytest.raises(ImportFailure, match="RESUME_SOURCE_CHANGED"):
        run_import(identifier)
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        persisted = session.get(ImportJob, identifier)
        assert persisted.checkpoint_row == persisted.inserted_rows == 1
        assert persisted.status == "failed"


def test_failed_batch_rolls_back_and_resumes_at_committed_checkpoint(importer):
    connection, settings, job = importer
    write_csv(settings.data_file_path, [source_row(grid_id=f"cell-{i}") for i in range(6)])
    identifier = job()
    observation_batches = 0

    def fail_second_batch(connection, cursor, statement, parameters, context, executemany):
        nonlocal observation_batches
        if statement.startswith("INSERT INTO observations"):
            observation_batches += 1
            if observation_batches == 2:
                raise RuntimeError("injected database failure")

    event.listen(connection, "before_cursor_execute", fail_second_batch)
    with pytest.raises(ImportFailure, match="IMPORT_FAILED"):
        run_import(identifier)
    event.remove(connection, "before_cursor_execute", fail_second_batch)
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        persisted = session.get(ImportJob, identifier)
        assert persisted.checkpoint_row == persisted.inserted_rows == 2
        assert session.scalar(select(func.count()).select_from(Observation).where(Observation.dataset_version_id == persisted.dataset_version_id)) == 2
        report = session.scalar(select(QualityReport).where(QualityReport.job_id == identifier))
        assert report.report_json["status"] == "failed"
    result = run_import(identifier)
    assert result["status"] == "completed"
    assert result["inserted_rows"] == result["processed_rows"] == 6


def test_schema_error_does_not_expose_source_path(importer):
    connection, settings, job = importer
    settings.data_file_path.write_text("wrong,header\n1,2\n", encoding="utf-8")
    with pytest.raises(ImportFailure) as failure:
        run_import(job())
    assert str(failure.value) == "SOURCE_SCHEMA_MISMATCH"
    assert str(settings.data_file_path) not in str(failure.value)


def test_malformed_csv_stops_at_durable_checkpoint(importer):
    connection, settings, job = importer
    write_csv(settings.data_file_path, [source_row(grid_id=f"cell-{i}") for i in range(2)])
    with settings.data_file_path.open("a", encoding="utf-8") as source:
        source.write('"unterminated')
    identifier = job()
    with pytest.raises(ImportFailure, match="INVALID_CSV"):
        run_import(identifier)
    with Session(bind=connection, join_transaction_mode="create_savepoint") as session:
        persisted = session.get(ImportJob, identifier)
        assert persisted.checkpoint_row == persisted.inserted_rows == 2


def test_retired_validation_policy_requires_replay_and_preserves_history(importer):
    connection, settings, job = importer
    identifier = job()
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        historical = session.get(ImportJob, identifier)
        historical.status = 'failed'
        historical.error_code = 'VALIDATION_POLICY_UPDATED'
        session.commit()
    with pytest.raises(ImportFailure, match='REPLAY_REQUIRED'):
        run_import(identifier)
    with Session(bind=connection, join_transaction_mode='create_savepoint') as session:
        historical = session.get(ImportJob, identifier)
        assert historical.status == 'failed'
        assert historical.error_code == 'VALIDATION_POLICY_UPDATED'
        assert historical.processed_rows == historical.checkpoint_row == 0
