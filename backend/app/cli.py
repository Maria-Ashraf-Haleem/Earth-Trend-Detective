"""Windows-friendly operational entry points. No arbitrary paths via HTTP."""
import argparse
import json
import logging
import sys
import time
from pathlib import Path
from uuid import uuid4

from sqlalchemy import create_engine, inspect, select, text

from app.core.config import get_settings
from app.core.database import database_url, get_engine, get_session_factory
from app.models import ImportJob
from app.services.catalog import seed_catalog
from app.services.ingestion import ImportFailure, retry_quarantine, run_import
from app.services.ingestion.pipeline import _fail_quarantine_replay
from app.services.verification import VerificationFailure, export_clean, validate_dataset


def bootstrap():
    settings = get_settings()
    engine = create_engine(database_url('master'), isolation_level='AUTOCOMMIT', hide_parameters=True)
    try:
        with engine.connect() as connection:
            exists = connection.scalar(text('SELECT DB_ID(:name)'), {'name': settings.sql_database})
            if exists is None:
                # Validated identifier; creation only, no alteration of existing databases.
                connection.execute(text(f'CREATE DATABASE [{settings.sql_database}]'))
            print(json.dumps({'database': settings.sql_database, 'created': exists is None}))
    finally:
        engine.dispose()


def new_job(scope=None):
    with get_session_factory()() as session:
        job = ImportJob(id=str(uuid4()), status='queued', scope_json=scope or {'kind': 'full_csv'})
        session.add(job)
        session.commit()
        return job.id


def execute_job(job_id, max_rows=None):
    with get_session_factory()() as session:
        job = session.get(ImportJob, job_id)
        if job is None:
            raise ImportFailure('JOB_NOT_FOUND')
        scope = job.scope_json
        code = None
        if not isinstance(scope, dict) or scope.get('kind') not in ('full_csv', 'quarantine_replay'):
            code = 'JOB_SCOPE_CONFLICT'
        elif scope['kind'] == 'quarantine_replay' and (
                not isinstance(scope.get('source_job_id'), str) or not scope['source_job_id']):
            code = 'QUARANTINE_SCOPE_INVALID'
        if code:
            # A malformed queued job must not poison every subsequent poll.
            # Preserve its scope/checkpoint, but record a sanitized terminal
            # failure instead of leaking KeyError/ValueError or retrying forever.
            _fail_quarantine_replay(session, job_id, code)
            raise ImportFailure(code)
        scope = dict(scope)
    if scope.get('kind') == 'quarantine_replay':
        return retry_quarantine(job_id, scope['source_job_id'], max_rows=max_rows)
    return run_import(job_id, max_rows=max_rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('init-db', help='Safely create configured database if absent; migrations are separate')
    sub.add_parser('check-db')
    sub.add_parser('seed', help='Idempotent source/indicator/region catalog, no observation data')
    ingest = sub.add_parser('import', help='Stream configured CSV or resume an existing job')
    ingest.add_argument('--job-id')
    ingest.add_argument('--max-rows', type=int, help='Limit newly examined rows, then pause durably')
    retry = sub.add_parser('retry-quarantine', help='Append-only retry of stored original quarantine payloads')
    retry.add_argument('--source-job-id', required=True)
    retry.add_argument('--job-id', help='Resume an existing scoped replay job')
    retry.add_argument('--max-rows', type=int)
    validation = sub.add_parser('validate-dataset', help='Reconcile full source profile and independent SQL counts')
    validation.add_argument('--version-id', type=int, required=True)
    validation.add_argument('--profile', type=Path, default=Path('docs/SOURCE_PROFILE.json'))
    validation.add_argument('--output', type=Path, default=Path('docs/INGESTION_VALIDATION.json'))
    export = sub.add_parser('export-clean', help='Export a certified dataset without changing decimal lexemes')
    export.add_argument('--version-id', type=int, required=True)
    export.add_argument('--output', type=Path, required=True)
    worker = sub.add_parser('worker', help='Process durable queued imports; restart a crashed job via import --job-id')
    worker.add_argument('--once', action='store_true')
    worker.add_argument('--poll-seconds', type=int, default=5)
    args = parser.parse_args()
    logging.basicConfig(level=get_settings().log_level, format='%(message)s')
    try:
        if args.command == 'init-db':
            bootstrap()
        elif args.command == 'check-db':
            with get_engine().connect() as connection:
                connection.execute(text('SELECT 1'))
            print(json.dumps({'status': 'ok', 'tables': inspect(get_engine()).get_table_names()}))
        elif args.command == 'seed':
            with get_session_factory()() as session:
                seed_catalog(session)
                session.commit()
            print(json.dumps({'catalog': 'ready'}))
        elif args.command == 'import':
            if args.max_rows is not None and args.max_rows < 1:
                parser.error('--max-rows must be positive')
            job_id = args.job_id or new_job()
            print(json.dumps({'job_id': job_id}), flush=True)
            print(json.dumps(execute_job(job_id, max_rows=args.max_rows)), flush=True)
        elif args.command == 'retry-quarantine':
            if args.max_rows is not None and args.max_rows < 1:
                parser.error('--max-rows must be positive')
            if not args.job_id:
                # Do not leave a permanently queued orphan if the operator
                # mistypes a source ID before a new replay job is created.
                with get_session_factory()() as session:
                    source = session.get(ImportJob, args.source_job_id)
                    if source is None:
                        raise ImportFailure('JOB_NOT_FOUND')
                    if source.dataset_version_id is None:
                        raise ImportFailure('JOB_VERSION_REQUIRED')
            job_id = args.job_id or new_job({'kind': 'quarantine_replay', 'source_job_id': args.source_job_id})
            print(json.dumps({'job_id': job_id}), flush=True)
            print(json.dumps(retry_quarantine(job_id, args.source_job_id, max_rows=args.max_rows)), flush=True)
        elif args.command == 'validate-dataset':
            report = validate_dataset(args.version_id, args.profile)
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
            print(json.dumps({'reconciled': report['reconciled'], 'input_records': report['input_records'],
                              'imported_valid_records': report['imported_valid_records']}))
            if not report['reconciled']:
                return 1
        elif args.command == 'export-clean':
            print(json.dumps(export_clean(args.version_id, args.output)), flush=True)
        elif args.command == 'worker':
            if not 1 <= args.poll_seconds <= 60:
                parser.error('--poll-seconds must be 1..60')
            while True:
                with get_session_factory()() as session:
                    job_id = session.scalar(select(ImportJob.id).where(ImportJob.status == 'queued')
                                             .order_by(ImportJob.created_at, ImportJob.id).limit(1))
                if job_id:
                    try:
                        print(json.dumps(execute_job(job_id)), flush=True)
                    except ImportFailure as exc:
                        print(json.dumps({'job_id': job_id, 'error_code': exc.code}), flush=True)
                if args.once:
                    break
                time.sleep(args.poll_seconds)
    except ImportFailure as exc:
        print(json.dumps({'error_code': exc.code}), file=sys.stderr)
        return 1
    except VerificationFailure as exc:
        print(json.dumps({'error_code': str(exc)}), file=sys.stderr)
        return 1
    except Exception as exc:
        # Do not echo ODBC connection strings or source paths, even in CLI failures.
        print(json.dumps({'error_code': 'OPERATION_FAILED', 'exception_type': type(exc).__name__,
                          'help': 'Check configuration and permissions; sql/create_database.sql is the bootstrap fallback.'}),
              file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
