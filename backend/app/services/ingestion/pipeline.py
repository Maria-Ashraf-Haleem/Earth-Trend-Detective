"""Bounded CSV ingestion with durable checkpoints and a SQL Server session lock.

``max_rows`` counts NEW source records examined by this invocation, including
duplicates/rejections. A bounded invocation pauses durably and can be resumed
using the same job ID. Restart verifies the entire SHA256 and streams past the
checkpoint; no byte offset is trusted across changed source files.
"""

from __future__ import annotations

import csv
import hashlib
import json
import logging
from contextlib import contextmanager
from datetime import datetime, timezone
from itertools import islice
from pathlib import Path

from sqlalchemy import func, insert, select, text
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_engine
from app.models import (DatasetVersion, ImportBatch, ImportJob, ImportLog, ImportQuarantine,
                        Observation, QualityReport, SpatialCell)
from app.services.catalog import DATASET_ID, REGION_ID, seed_catalog
from .validation import MEASUREMENT_FIELDS, REQUIRED_FIELDS, ParsedRow, RowValidationError, parse_row

logger = logging.getLogger(__name__)
MAX_LOGS = 1000
MAX_CACHED_CELLS = 50000


class ImportFailure(RuntimeError):
    """Stable public error code. Messages never contain source paths or SQL."""

    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _file_signature(path: Path):
    try:
        stat = path.stat()
        return stat.st_size, stat.st_mtime_ns
    except OSError:
        raise ImportFailure("SOURCE_UNAVAILABLE") from None


def fingerprint(path: Path) -> tuple[str, tuple[int, int]]:
    """Full content identity, using a constant 1 MiB buffer."""
    before = _file_signature(path)
    digest = hashlib.sha256()
    try:
        with path.open("rb") as source:
            for block in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(block)
    except OSError:
        raise ImportFailure("SOURCE_UNAVAILABLE") from None
    if _file_signature(path) != before:
        raise ImportFailure("SOURCE_CHANGED")
    return digest.hexdigest(), before


def _audit(path: Path) -> dict:
    if not path.is_file():
        return {"audit_status": "unavailable", "note": "Source audit file was unavailable at registration."}
    try:
        if path.stat().st_size > 4 * 1024 * 1024:
            raise ImportFailure("AUDIT_TOO_LARGE")
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError):
        raise ImportFailure("INVALID_AUDIT") from None
    if not isinstance(value, dict):
        raise ImportFailure("INVALID_AUDIT")
    return value


@contextmanager
def _locked_connection():
    """Pin the lock AND all batch transactions to one SQL Server connection."""
    engine = get_engine()
    with engine.connect() as connection:
        if engine.dialect.name == "mssql":
            result = connection.execute(text("""
                DECLARE @result int;
                EXEC @result = sys.sp_getapplock
                    @Resource='earthtrend:csv-ingestion', @LockMode='Exclusive',
                    @LockOwner='Session', @LockTimeout=0;
                SELECT @result;
            """)).scalar_one()
            connection.commit()
            if result < 0:
                raise ImportFailure("IMPORT_BUSY")
            try:
                yield connection
            finally:
                if connection.in_transaction():
                    connection.rollback()
                connection.execute(text("""
                    EXEC sys.sp_releaseapplock
                        @Resource='earthtrend:csv-ingestion', @LockOwner='Session';
                """))
                connection.commit()
        else:
            raise ImportFailure("UNSUPPORTED_DATABASE")


def _chunks(items, size=500):
    iterator = iter(items)
    while chunk := list(islice(iterator, size)):
        yield chunk


def _summary(job: ImportJob) -> dict:
    return {"job_id": job.id, "status": job.status, "dataset_version_id": job.dataset_version_id,
            "processed_rows": job.processed_rows, "inserted_rows": job.inserted_rows,
            "duplicate_rows": job.duplicate_rows, "rejected_rows": job.rejected_rows,
            "checkpoint_row": job.checkpoint_row, "total_rows": job.total_rows,
            "scope": job.scope_json}


def _payload(raw: dict) -> dict:
    """Preserve malformed extra columns as well as normal source strings."""
    if None in raw:
        return {'__csv_fields__': {k: v for k, v in raw.items() if k is not None},
                '__extra_columns__': raw[None]}
    return dict(raw)


def _restore_payload(payload: dict) -> dict:
    if '__csv_fields__' in payload and '__extra_columns__' in payload:
        return {**payload['__csv_fields__'], None: payload['__extra_columns__']}
    return dict(payload)


def _payload_hash(payload: dict) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False,
                                     separators=(',', ':')).encode('utf-8')).hexdigest()


def _initial_report() -> dict:
    return {"measurement_present": {field: 0 for field in MEASUREMENT_FIELDS},
            "rejection_codes": {}, "start_date": None, "end_date": None,
            "longitude_min": None, "longitude_max": None, "latitude_min": None,
            "latitude_max": None,
            "coverage_basis": "Successfully inserted unique source rows; missing values are not imputed.",
            "temporal_limitations": ["Previous-month features repeat across eight-day rows.",
                                     "GHSL is a 2020 snapshot, not an urban time series."],
            "validation_scope": "CSV type, coordinate, date, source QA consistency and duplicate checks; not independent scientific validation."}


def _record_quality(report: dict, row: ParsedRow):
    for field, value in row.measurements.items():
        report["measurement_present"][field] += value is not None
    day = row.observed_on.isoformat()
    report["start_date"] = min(report["start_date"] or day, day)
    report["end_date"] = max(report["end_date"] or day, day)
    for axis, value in (("longitude", row.longitude), ("latitude", row.latitude)):
        for operation, selector in (("min", min), ("max", max)):
            key = f"{axis}_{operation}"
            report[key] = selector(value if report[key] is None else report[key], value)


def _process_batch(session: Session, job: ImportJob, batch: list, quality: QualityReport,
                   log_count: int, cell_cache: dict | None = None,
                   quarantine_origins: dict[int, ImportQuarantine] | None = None) -> int:
    """All inserts, logs, cumulative quality and checkpoint commit together."""
    report = json.loads(json.dumps(quality.report_json))
    parsed = []
    pending_logs = []
    pending_quarantine = []
    raw_by_number = dict(batch)
    successful = {}
    rejected = duplicate = 0

    def reject(number, code, field="row"):
        nonlocal rejected
        rejected += 1
        report["rejection_codes"][code] = report["rejection_codes"].get(code, 0) + 1
        payload = _payload(raw_by_number[number])
        pending_quarantine.append({'job_id': job.id, 'dataset_version_id': job.dataset_version_id,
                                   'source_row': number, 'row_hash': _payload_hash(payload),
                                   'error_code': code, 'error_field': field,
                                   'raw_payload': payload, 'resolution': 'pending'})
        if log_count + len(pending_logs) < MAX_LOGS:
            pending_logs.append({"job_id": job.id, "row_number": number, "level": "warning",
                                 "code": code, "message": f"Rejected source record: {field}."})

    for number, raw in batch:
        try:
            parsed.append((number, parse_row(raw)))
        except RowValidationError as exc:
            reject(number, exc.code, exc.field)
    grids = {row.grid_id for _, row in parsed}
    # Geographic metadata is small (7,231 inspected source cells), independent
    # of observation count. Cache it for this invocation to avoid repeatedly
    # materializing the same cells across millions of source records.
    cells = cell_cache if cell_cache is not None else {}
    for group in _chunks(grids.difference(cells)):
        for cell in session.scalars(select(SpatialCell).where(SpatialCell.grid_id.in_(group))):
            cells[cell.grid_id] = cell
    missing = {}
    for number, row in parsed:
        existing = cells.get(row.grid_id) or missing.get(row.grid_id)
        if existing is None:
            missing[row.grid_id] = SpatialCell(grid_id=row.grid_id, region_id=REGION_ID,
                                             longitude=row.longitude, latitude=row.latitude)
    if missing:
        session.add_all(missing.values())
        session.flush()
        cells.update(missing)
    existing_hashes = {}
    keys = {(cells[row.grid_id].id, row.observed_on.isoformat()) for _, row in parsed}
    if keys:
        # One bound JSON parameter avoids both SQL Server's 2,100 parameter
        # ceiling and dozens of per-date/per-cell round trips. The key list is
        # bounded by this batch; no full-date observation set is materialized.
        batch_keys = json.dumps([{"c": cell_id, "d": day} for cell_id, day in keys],
                                separators=(",", ":"))
        query = text("""
            SELECT o.cell_id, o.observed_on, o.row_hash
            FROM observations AS o
            INNER JOIN OPENJSON(:batch_keys)
                WITH (cell_id int '$.c', observed_on date '$.d') AS k
                ON o.cell_id = k.cell_id AND o.observed_on = k.observed_on
            WHERE o.dataset_version_id = :version_id
        """)
        for cell_id, observed_on, row_hash in session.execute(query, {
                "batch_keys": batch_keys, "version_id": job.dataset_version_id}):
            existing_hashes[(cell_id, observed_on)] = row_hash
    inserts = []
    for number, row in parsed:
        cell = cells[row.grid_id]
        if abs(cell.longitude - row.longitude) > 0.000001 or abs(cell.latitude - row.latitude) > 0.000001:
            reject(number, "cell_coordinate_conflict", "grid_id")
            continue
        key = (cell.id, row.observed_on)
        if key in existing_hashes:
            if existing_hashes[key] == row.row_hash:
                duplicate += 1
                successful[number] = (key, 'duplicate')
            else:
                reject(number, "observation_key_conflict", "grid_id/observation_date")
            continue
        existing_hashes[key] = row.row_hash
        inserts.append({"dataset_version_id": job.dataset_version_id, "cell_id": cell.id,
                        "observed_on": row.observed_on, "source_row": number,
                        "row_hash": row.row_hash, "source_metadata": row.source_metadata,
                        **row.measurements})
        _record_quality(report, row)
        successful[number] = (key, 'resolved')
    audited_batch = ImportBatch(
        job_id=job.id,
        batch_number=(session.scalar(select(func.max(ImportBatch.batch_number))
                                     .where(ImportBatch.job_id == job.id)) or 0) + 1,
        source_start_row=min(raw_by_number), source_end_row=max(raw_by_number),
        processed_rows=len(batch), inserted_rows=len(inserts), duplicate_rows=duplicate,
        rejected_rows=rejected,
    )
    session.add(audited_batch)
    session.flush()
    if inserts:
        # SQLAlchemy's engine is configured with pyodbc fast_executemany=True,
        # use_insertmanyvalues=False. Batches omit RETURNING/OUTPUT.
        for record in inserts:
            record.update(import_job_id=job.id, import_batch_id=audited_batch.id)
        session.execute(insert(Observation).execution_options(render_nulls=True), inserts)
        version = session.get(DatasetVersion, job.dataset_version_id)
        if version.validated_at is not None or version.validation_json:
            # A validation manifest describes a particular persisted row set.
            # New rows require a fresh independent reconciliation.
            version.validation_json = {}
            version.validated_at = None
    if pending_quarantine:
        session.execute(insert(ImportQuarantine).execution_options(render_nulls=True), pending_quarantine)
    if pending_logs:
        session.execute(insert(ImportLog), pending_logs)
    if quarantine_origins and successful:
        success_keys = json.dumps([{'c': key[0], 'd': key[1].isoformat()}
                                   for key, _ in successful.values()], separators=(',', ':'))
        persisted = session.execute(text('''
            SELECT o.id, o.cell_id, o.observed_on FROM observations AS o
            INNER JOIN OPENJSON(:keys) WITH (cell_id int '$.c', observed_on date '$.d') AS k
                ON o.cell_id=k.cell_id AND o.observed_on=k.observed_on
            WHERE o.dataset_version_id=:version
        '''), {'keys': success_keys, 'version': job.dataset_version_id})
        observation_ids = {(cell, day): identifier for identifier, cell, day in persisted}
        for number, (key, resolution) in successful.items():
            if number not in quarantine_origins:
                continue
            origin = quarantine_origins[number]
            origin.resolution = resolution
            origin.resolved_by_job_id = job.id
            origin.resolved_observation_id = observation_ids[key]
            origin.resolved_at = _now()
        session.flush()
    if successful:
        hashes = {number: row.row_hash for number, row in parsed}
        successes = json.dumps([
            {'n': number, 'h': hashes[number], 'c': key[0], 'd': key[1].isoformat(), 'r': outcome}
            for number, (key, outcome) in successful.items()
        ], separators=(',', ':'))
        # A normal idempotent CSV replay can also recover a prior rejection.
        # Match the immutable version, source ordinal AND raw payload hash;
        # keep every historical row and its first successful resolution actor.
        session.execute(text('''
            UPDATE q SET resolution=k.outcome, resolved_by_job_id=:job_id,
                resolved_observation_id=o.id, resolved_at=:resolved_at
            FROM import_quarantine AS q
            INNER JOIN OPENJSON(:items) WITH (
                source_row bigint '$.n', row_hash varchar(64) '$.h',
                cell_id int '$.c', observed_on date '$.d', outcome varchar(20) '$.r'
            ) AS k ON q.dataset_version_id=:version
                AND q.source_row=k.source_row AND q.row_hash=k.row_hash
            INNER JOIN observations AS o ON o.dataset_version_id=:version
                AND o.cell_id=k.cell_id AND o.observed_on=k.observed_on AND o.row_hash=k.row_hash
            WHERE q.resolution='pending'
        '''), {'items': successes, 'version': job.dataset_version_id, 'job_id': job.id,
               'resolved_at': _now()})
    job.processed_rows += len(batch)
    job.inserted_rows += len(inserts)
    job.duplicate_rows += duplicate
    job.rejected_rows += rejected
    job.checkpoint_row = batch[-1][0]
    report.update({"processed_rows": job.processed_rows, "inserted_rows": job.inserted_rows,
                   "duplicate_rows": job.duplicate_rows, "rejected_rows": job.rejected_rows,
                   "checkpoint_row": job.checkpoint_row, "detailed_logs_capped_at": MAX_LOGS})
    report['scope'] = job.scope_json
    report['accounting_reconciled'] = (job.processed_rows == job.inserted_rows +
                                       job.duplicate_rows + job.rejected_rows)
    report["measurement_missing"] = {
        field: job.inserted_rows - count for field, count in report["measurement_present"].items()}
    quality.report_json = report
    session.commit()
    logger.info(json.dumps({"event": "ingestion_batch", "job_id": job.id,
                           "checkpoint_row": job.checkpoint_row, "inserted_rows": job.inserted_rows,
                           "rejected_rows": job.rejected_rows}, separators=(",", ":")))
    return log_count + len(pending_logs)


def run_import(job_id: str, max_rows: int | None = None) -> dict:
    """Import only the configured source; callers cannot supply filesystem paths."""
    if max_rows is not None and max_rows <= 0:
        raise ValueError("max_rows must be positive")
    settings = get_settings()
    with _locked_connection() as connection, Session(bind=connection, expire_on_commit=False,
                                                     join_transaction_mode="create_savepoint") as session:
        job = session.get(ImportJob, job_id)
        if job is None:
            raise ImportFailure("JOB_NOT_FOUND")
        if job.error_code == "VALIDATION_POLICY_UPDATED":
            # Rejected rows before this checkpoint require a fresh idempotent
            # replay; resuming after it would leave those records unexamined.
            raise ImportFailure("REPLAY_REQUIRED")
        if job.scope_json.get('kind', 'full_csv') != 'full_csv':
            raise ImportFailure('QUARANTINE_REPLAY_REQUIRED')
        if job.status == "completed":
            return _summary(job)
        try:
            job.status = "running"
            job.started_at = job.started_at or _now()
            job.finished_at = None
            job.error_code = None
            session.commit()
            sha256, signature = fingerprint(settings.data_file_path)
            seed_catalog(session)
            version = session.scalar(select(DatasetVersion).where(DatasetVersion.sha256 == sha256))
            if job.dataset_version_id is not None and (version is None or job.dataset_version_id != version.id):
                raise ImportFailure("RESUME_SOURCE_CHANGED")
            if version is None:
                version = DatasetVersion(dataset_id=DATASET_ID, sha256=sha256,
                                         source_size=signature[0], audit_json=_audit(settings.audit_file_path))
                session.add(version)
                session.flush()
            job.dataset_version_id = version.id
            audit_rows = version.audit_json.get("rows")
            job.total_rows = audit_rows if isinstance(audit_rows, int) and audit_rows >= 0 else None
            quality = session.scalar(select(QualityReport).where(QualityReport.job_id == job.id)
                                     .order_by(QualityReport.id.desc()).limit(1))
            if quality is None:
                quality = QualityReport(job_id=job.id, report_json=_initial_report())
                session.add(quality)
            running_report = dict(quality.report_json)
            running_report["status"] = "running"
            running_report.pop("error_code", None)
            quality.report_json = running_report
            session.commit()
            log_count = session.scalar(select(func.count()).select_from(ImportLog).where(ImportLog.job_id == job.id))
            try:
                source = settings.data_file_path.open("r", encoding="utf-8-sig", newline="")
            except OSError:
                raise ImportFailure("SOURCE_UNAVAILABLE") from None
            with source:
                reader = csv.DictReader(source, strict=True)
                if reader.fieldnames is None or len(reader.fieldnames) != len(REQUIRED_FIELDS) or set(reader.fieldnames) != REQUIRED_FIELDS:
                    raise ImportFailure("SOURCE_SCHEMA_MISMATCH")
                # Source row is a one-based CSV record index, not a physical line
                # number (CSV records can contain quoted newlines).
                rows = enumerate(reader, start=1)
                skipped = sum(1 for _ in islice(rows, job.checkpoint_row))
                if skipped != job.checkpoint_row:
                    raise ImportFailure("CHECKPOINT_OUT_OF_RANGE")
                consumed = 0
                cell_cache = {}
                while True:
                    size = settings.import_batch_size
                    if max_rows is not None:
                        size = min(size, max_rows - consumed)
                    if size == 0:
                        # A look-ahead distinguishes exact EOF from a true pause.
                        completed = next(rows, None) is None
                        break
                    batch = list(islice(rows, size))
                    if not batch:
                        completed = True
                        break
                    if _file_signature(settings.data_file_path) != signature:
                        raise ImportFailure("SOURCE_CHANGED")
                    log_count = _process_batch(session, job, batch, quality, log_count, cell_cache=cell_cache)
                    if len(cell_cache) > MAX_CACHED_CELLS:
                        # The inspected footprint has only 7,231 cells. Keep a
                        # hard memory bound if a future source expands it.
                        cell_cache.clear()
                    consumed += len(batch)
            if _file_signature(settings.data_file_path) != signature:
                raise ImportFailure("SOURCE_CHANGED")
            job.status = "completed" if completed else "paused"
            if completed:
                job.finished_at = _now()
                job.total_rows = job.processed_rows
            report = dict(quality.report_json)
            report["status"] = job.status
            report["audit_reported_rows"] = audit_rows
            report["audit_row_count_matches"] = (audit_rows == job.processed_rows) if completed and audit_rows is not None else None
            quality.report_json = report
            session.commit()
            return _summary(job)
        except Exception as exc:
            session.rollback()
            code = exc.code if isinstance(exc, ImportFailure) else (
                "INVALID_CSV" if isinstance(exc, (csv.Error, UnicodeError)) else "IMPORT_FAILED")
            job = session.get(ImportJob, job_id)
            job.status = "failed"
            job.error_code = code
            job.finished_at = _now()
            quality = session.scalar(select(QualityReport).where(QualityReport.job_id == job_id)
                                     .order_by(QualityReport.id.desc()).limit(1))
            if quality is not None:
                failed_report = dict(quality.report_json)
                failed_report.update({"status": "failed", "error_code": code})
                quality.report_json = failed_report
            session.add(ImportLog(job_id=job.id, level="error", code=code,
                                  message="Import stopped; committed checkpoint is retained."))
            session.commit()
            logger.error(json.dumps({"event": "ingestion_failed", "job_id": job_id,
                                     "error_code": code}, separators=(",", ":")))
            raise ImportFailure(code) from None


def backfill_quarantine(job_id: str, records, batch_size: int | None = None) -> dict:
    """Audit historical rejections from a trusted, streaming source-row iterator.

    ``records`` yields ``(source_row, raw_dict, error_code, error_field)`` from the
    immutable configured CSV. The full source fingerprint must match the job's
    version. This does not change historical counters, observations, or logs.
    Repeating the same backfill is idempotent; differing payloads fail safely.
    """
    settings = get_settings()
    size = min(batch_size or settings.import_batch_size, 1000)
    if size < 1:
        raise ValueError('batch_size must be positive')
    stored = skipped = resolved = 0
    with _locked_connection() as connection, Session(bind=connection, expire_on_commit=False,
                                                     join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, job_id)
        if job is None or job.dataset_version_id is None:
            raise ImportFailure('JOB_VERSION_REQUIRED')
        version = session.get(DatasetVersion, job.dataset_version_id)
        sha, signature = fingerprint(settings.data_file_path)
        if sha != version.sha256:
            raise ImportFailure('BACKFILL_SOURCE_CHANGED')
        for chunk in _chunks(records, size):
            if _file_signature(settings.data_file_path) != signature:
                raise ImportFailure('SOURCE_CHANGED')
            numbers = [number for number, _, _, _ in chunk]
            if any(number < 1 or number > job.checkpoint_row for number in numbers):
                raise ImportFailure('BACKFILL_ROW_OUT_OF_RANGE')
            existing = dict(session.execute(select(ImportQuarantine.source_row, ImportQuarantine.row_hash)
                .where(ImportQuarantine.job_id == job.id, ImportQuarantine.source_row.in_(numbers))).all())
            observations = dict(session.execute(select(Observation.source_row, Observation.id)
                .where(Observation.dataset_version_id == version.id, Observation.source_row.in_(numbers))).all())
            inserts = []
            for number, raw, code, field in chunk:
                payload = _payload(raw)
                digest = _payload_hash(payload)
                if number in existing:
                    if existing[number] != digest:
                        raise ImportFailure('QUARANTINE_BACKFILL_CONFLICT')
                    skipped += 1
                    continue
                existing[number] = digest
                observation_id = observations.get(number)
                inserts.append({'job_id': job.id, 'dataset_version_id': version.id,
                    'source_row': number, 'row_hash': digest, 'error_code': code,
                    'error_field': field, 'raw_payload': payload,
                    'resolution': 'resolved' if observation_id else 'pending',
                    'resolved_observation_id': observation_id,
                    'resolved_by_job_id': None, 'resolved_at': _now() if observation_id else None})
                resolved += observation_id is not None
            if inserts:
                session.execute(insert(ImportQuarantine).execution_options(render_nulls=True), inserts)
                if any(record['resolution'] == 'pending' for record in inserts):
                    version.validation_json = {}
                    version.validated_at = None
            session.commit()
            stored += len(inserts)
        if _file_signature(settings.data_file_path) != signature:
            raise ImportFailure('SOURCE_CHANGED')
    return {'job_id': job_id, 'stored': stored, 'already_present': skipped, 'already_resolved': resolved}


def _prepare_replay_scope(session: Session, job: ImportJob, source_job_id: str) -> tuple[dict, int]:
    """Initialize a pristine request or validate an immutable replay checkpoint.

    Producers intentionally queue only kind/source ID. Snapshot boundaries are
    captured by the worker, in the same transaction as the running job/report.
    Once captured they are never refreshed, including after process interruption.
    """
    counts = (job.processed_rows, job.inserted_rows, job.duplicate_rows, job.rejected_rows,
              job.checkpoint_row)
    if any(type(value) is not int or value < 0 for value in counts):
        raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
    if job.processed_rows != job.inserted_rows + job.duplicate_rows + job.rejected_rows:
        raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
    if (job.processed_rows == 0) != (job.checkpoint_row == 0):
        raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
    scope = job.scope_json
    if not isinstance(scope, dict):
        raise ImportFailure('QUARANTINE_SCOPE_INVALID')
    if scope.get('selection') not in (None, 'all_source_job_quarantine_records_at_start'):
        raise ImportFailure('QUARANTINE_SCOPE_INVALID')
    if 'quarantine_max_id' not in scope:
        if job.processed_rows or job.checkpoint_row:
            raise ImportFailure('QUARANTINE_SNAPSHOT_REQUIRED')
        maximum = session.scalar(select(func.max(ImportQuarantine.id))
                                 .where(ImportQuarantine.job_id == source_job_id)) or 0
        scope = {**scope, 'kind': 'quarantine_replay', 'source_job_id': source_job_id,
                 'quarantine_max_id': maximum,
                 'selection': 'all_source_job_quarantine_records_at_start'}
    else:
        maximum = scope['quarantine_max_id']
        if type(maximum) is not int or maximum < 0:
            raise ImportFailure('QUARANTINE_SCOPE_INVALID')
        if maximum and session.scalar(select(ImportQuarantine.id).where(
                ImportQuarantine.job_id == source_job_id, ImportQuarantine.id == maximum)) is None:
            raise ImportFailure('QUARANTINE_SNAPSHOT_INVALID')
        if scope.get('selection') is None:
            if job.processed_rows:
                raise ImportFailure('QUARANTINE_SCOPE_INVALID')
            scope = {**scope, 'selection': 'all_source_job_quarantine_records_at_start'}
    selection = (ImportQuarantine.job_id == source_job_id, ImportQuarantine.id <= maximum)
    total = session.scalar(select(func.count()).select_from(ImportQuarantine).where(*selection))
    if job.total_rows is not None and (type(job.total_rows) is not int or job.total_rows < 0
                                      or job.total_rows != total):
        raise ImportFailure('QUARANTINE_SNAPSHOT_COUNT_CHANGED')
    if job.processed_rows and job.total_rows is None:
        raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
    if job.processed_rows > total:
        raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
    if job.processed_rows:
        processed, last_row = session.execute(select(func.count(ImportQuarantine.id),
                func.max(ImportQuarantine.source_row)).where(
                    *selection, ImportQuarantine.source_row <= job.checkpoint_row)).one()
        if processed != job.processed_rows or last_row != job.checkpoint_row:
            raise ImportFailure('QUARANTINE_CHECKPOINT_INVALID')
    return scope, total


def _fail_quarantine_replay(session: Session, job_id: str, code: str):
    """Keep failure state and progress aligned without echoing the exception."""
    job = session.get(ImportJob, job_id)
    job.status = 'failed'
    job.error_code = code
    job.finished_at = _now()
    quality = session.scalar(select(QualityReport).where(QualityReport.job_id == job_id)
                             .order_by(QualityReport.id.desc()).limit(1))
    if quality is None:
        quality = QualityReport(job_id=job_id, report_json=_initial_report())
        session.add(quality)
    quality.report_json = {**quality.report_json, 'status': 'failed', 'error_code': code,
        'scope': job.scope_json, 'processed_rows': job.processed_rows,
        'inserted_rows': job.inserted_rows, 'duplicate_rows': job.duplicate_rows,
        'rejected_rows': job.rejected_rows, 'checkpoint_row': job.checkpoint_row}
    session.add(ImportLog(job_id=job_id, level='error', code=code,
                          message='Quarantine replay stopped; committed checkpoint is retained.'))
    session.commit()


def retry_quarantine(job_id: str, source_job_id: str, max_rows: int | None = None) -> dict:
    """Replay a stable snapshot of an earlier job's quarantined source records.

    Raw strings and hashes are retained. Existing resolved records are harmless
    exact duplicates; new retries never overwrite their original resolution.
    Checkpoints are source ordinals, while counters refer to selected records.
    A completed scoped replay alone does not validate an entire dataset version.
    """
    if max_rows is not None and (type(max_rows) is not int or max_rows < 1):
        raise ValueError('max_rows must be positive')
    if job_id == source_job_id:
        raise ImportFailure('QUARANTINE_SOURCE_EQUALS_TARGET')
    settings = get_settings()
    with _locked_connection() as connection, Session(bind=connection, expire_on_commit=False,
                                                     join_transaction_mode='create_savepoint') as session:
        job = session.get(ImportJob, job_id)
        source = session.get(ImportJob, source_job_id)
        if job is None or source is None:
            raise ImportFailure('JOB_NOT_FOUND')
        if source.dataset_version_id is None:
            raise ImportFailure('JOB_VERSION_REQUIRED')
        scope = job.scope_json
        if job.error_code == 'VALIDATION_POLICY_UPDATED':
            raise ImportFailure('REPLAY_REQUIRED')
        if isinstance(scope, dict) and scope.get('kind') == 'quarantine_replay' and scope.get('source_job_id') != source_job_id:
            raise ImportFailure('JOB_SCOPE_CONFLICT')
        if isinstance(scope, dict) and scope.get('kind') not in ('full_csv', 'quarantine_replay'):
            raise ImportFailure('JOB_SCOPE_CONFLICT')
        if isinstance(scope, dict) and scope.get('kind') == 'full_csv' and (
                job.processed_rows or job.checkpoint_row or job.started_at or job.status == 'completed'):
            raise ImportFailure('JOB_SCOPE_CONFLICT')
        if job.dataset_version_id not in (None, source.dataset_version_id):
            raise ImportFailure('JOB_VERSION_CONFLICT')
        try:
            scope, total = _prepare_replay_scope(session, job, source_job_id)
            if job.status == 'completed':
                if job.processed_rows != total:
                    raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
                return _summary(job)
            job.dataset_version_id = source.dataset_version_id
            job.scope_json = scope
            job.total_rows = total
            job.status = 'running'
            job.started_at = job.started_at or _now()
            job.finished_at = None
            job.error_code = None
            quality = session.scalar(select(QualityReport).where(QualityReport.job_id == job.id)
                                     .order_by(QualityReport.id.desc()).limit(1))
            if quality is None:
                quality = QualityReport(job_id=job.id, report_json={**_initial_report(), 'scope': scope})
                session.add(quality)
            running_report = {**quality.report_json, 'status': 'running', 'scope': scope}
            running_report.pop('error_code', None)
            quality.report_json = running_report
            session.commit()
            logs = session.scalar(select(func.count()).select_from(ImportLog).where(ImportLog.job_id == job.id))
            consumed = 0
            cells = {}
            while True:
                size = settings.import_batch_size if max_rows is None else min(settings.import_batch_size,
                                                                               max_rows - consumed)
                selection = select(ImportQuarantine).where(
                    ImportQuarantine.job_id == source_job_id,
                    ImportQuarantine.id <= scope['quarantine_max_id'],
                    ImportQuarantine.source_row > job.checkpoint_row,
                ).order_by(ImportQuarantine.source_row)
                if size == 0:
                    completed = session.scalar(select(ImportQuarantine.id).where(
                        ImportQuarantine.job_id == source_job_id,
                        ImportQuarantine.id <= scope['quarantine_max_id'],
                        ImportQuarantine.source_row > job.checkpoint_row).limit(1)) is None
                    break
                originals = list(session.scalars(selection.limit(size)))
                if not originals:
                    completed = True
                    break
                batch = []
                for original in originals:
                    if _payload_hash(original.raw_payload) != original.row_hash:
                        raise ImportFailure('QUARANTINE_PAYLOAD_CHANGED')
                    batch.append((original.source_row, _restore_payload(original.raw_payload)))
                origins = {q.source_row: q for q in originals if q.resolution == 'pending'}
                logs = _process_batch(session, job, batch, quality, logs, cell_cache=cells,
                                      quarantine_origins=origins)
                if len(cells) > MAX_CACHED_CELLS:
                    cells.clear()
                consumed += len(batch)
            if completed and job.processed_rows != job.total_rows:
                raise ImportFailure('QUARANTINE_REPLAY_STATE_INVALID')
            job.status = 'completed' if completed else 'paused'
            job.finished_at = _now() if completed else None
            quality.report_json = {**quality.report_json, 'status': job.status, 'scope': scope}
            session.commit()
            return _summary(job)
        except Exception as exc:
            session.rollback()
            code = exc.code if isinstance(exc, ImportFailure) else 'QUARANTINE_REPLAY_FAILED'
            _fail_quarantine_replay(session, job_id, code)
            raise ImportFailure(code) from None
