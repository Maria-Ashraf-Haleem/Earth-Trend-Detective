"""Bounded, read-only live HTTP verification; never submits imports or analysis writes.

Run from backend: python scripts/verify_api.py
Local SQL metadata and the persisted certificate supply independent expectations.
The evidence artifact contains assertions and timings, not raw data or secrets.
"""
import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi.routing import APIRoute  # noqa: E402
from pydantic import TypeAdapter  # noqa: E402
from sqlalchemy import select, text  # noqa: E402

from app.core.config import get_settings  # noqa: E402
from app.core.database import get_session_factory  # noqa: E402
from app.main import api, app  # noqa: E402
from app.models import DatasetVersion, ImportJob, Observation, SpatialCell  # noqa: E402
from app.repositories import active_version  # noqa: E402
from app.schemas import ErrorResponse  # noqa: E402
from app.services.catalog import DATASET_ID  # noqa: E402


def protected_state(session, version_id):
    rows = dict(session.execute(text('''
        SELECT t.name, SUM(p.row_count) FROM sys.tables AS t
        JOIN sys.dm_db_partition_stats AS p ON p.object_id=t.object_id AND p.index_id IN (0,1)
        GROUP BY t.name ORDER BY t.name
    ''')).all())
    version = session.get(DatasetVersion, version_id)
    return {
        'migration_revision': session.scalar(text('SELECT version_num FROM alembic_version')),
        'table_row_counts': rows,
        'validation_sha256': hashlib.sha256(json.dumps(version.validation_json, sort_keys=True).encode()).hexdigest(),
        'validated_at': version.validated_at.isoformat(),
        'source_sha256': version.sha256, 'source_size_bytes': version.source_size,
        'view_columns': session.scalar(text("SELECT COUNT(*) FROM sys.columns WHERE object_id=OBJECT_ID('dbo.ml_features_v1')")),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://127.0.0.1:8000')
    parser.add_argument('--output', type=Path, default=Path('docs/API_VERIFICATION.json'))
    args = parser.parse_args()
    evidence = {'executed_at_utc': datetime.now(timezone.utc).isoformat(),
                'method': 'GET only, response-model validation, independent SQL/certificate assertions',
                'checks': [], 'passed': False}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with get_session_factory()() as session:
        version_id = active_version(session)
        before = protected_state(session, version_id)
        version = session.get(DatasetVersion, version_id)
        proof = version.validation_json
        cell_id = session.scalar(select(Observation.cell_id).where(
            Observation.dataset_version_id == version_id, Observation.observed_on == date(2022, 4, 7))
            .order_by(Observation.cell_id).limit(1))
        cell = session.get(SpatialCell, cell_id)
        obs = session.scalar(select(Observation).where(Observation.dataset_version_id == version_id,
            Observation.cell_id == cell_id, Observation.observed_on == date(2022, 4, 7)))
        jobs = list(session.scalars(select(ImportJob).where(ImportJob.dataset_version_id == version_id)
                                   .order_by(ImportJob.created_at)))
        job = next(j for j in jobs if j.scope_json.get('kind') == 'quarantine_replay')
        assert get_settings().data_file_path.stat().st_size == version.source_size
        context = {'version_id': version_id, 'region_id': cell.region_id, 'cell_id': cell_id,
                   'certificate_reconciled': proof['reconciled'], 'validation_policy': proof['validation_policy']}
    evidence['context'] = context
    evidence['before'] = before

    def check(path, params=None, status=200, assertion=None, note=''):
        started = time.perf_counter()
        try:
            with urlopen(args.base_url.rstrip('/') + path + ('?' + urlencode(params) if params else ''), timeout=60) as response:
                actual, headers, payload = response.status, response.headers, response.read()
        except HTTPError as response:
            actual, headers, payload = response.code, response.headers, response.read()
        result = json.loads(payload)
        elapsed = round((time.perf_counter() - started) * 1000, 2)
        assert actual == status, f'{path}: expected {status}, got {actual}'
        route = next(r for r in (*app.routes, *api.routes) if isinstance(r, APIRoute)
                     and r.path_regex.fullmatch(path) and 'GET' in r.methods)
        TypeAdapter(route.response_model if actual == 200 else ErrorResponse).validate_python(result)
        assert headers['X-Request-ID']
        if actual == 200 and params and 'page_size' in params:
            items = result if isinstance(result, list) else result['items']
            assert len(items) <= params['page_size']
        if assertion:
            assert assertion(result, headers), f'{path}: independent content assertion failed'
        evidence['checks'].append({'method': 'GET', 'route': route.path, 'parameters': params or {},
                                   'status': actual, 'duration_ms': elapsed, 'response_bytes': len(payload),
                                   'schema_valid': True, 'content_assertion': note, 'passed': True})
        args.output.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
        print(json.dumps({'route': route.path, 'status': actual, 'duration_ms': elapsed}), flush=True)
        return result

    bounded = {'page_size': 2}
    for path in ['/health', '/api/v1/health', '/health/database', '/api/v1/health/database']:
        check(path)
    check('/api/v1/health/readiness', assertion=lambda b, _: b['dataset_version_id'] == version_id and all(b['checks'].values()),
          note='Current schema, selected certified version and database connection')
    check('/api/v1/regions', bounded, assertion=lambda b, _: any(r['id'] == cell.region_id for r in b), note='Known source region')
    check(f'/api/v1/regions/{cell.region_id}', assertion=lambda b, _: b['bounds'] is not None, note='Actual centroid extent')
    check(f'/api/v1/regions/{cell.region_id}/cells', bounded,
          assertion=lambda b, _: b['total'] == proof['spatial_cells'], note='Certificate cell count; at most two items')
    check('/api/v1/locations', bounded, assertion=lambda b, _: b['items'] == [] and b['availability'] == 'unavailable',
          note='No invented named locations')
    check('/api/v1/datasets', bounded, assertion=lambda b, _: b[0]['datasetVersionId'] == version_id and b[0]['dataVerified'],
          note='Catalog publishes the certified version')
    check(f'/api/v1/datasets/{DATASET_ID}', assertion=lambda b, _: b['datasetVersionId'] == version_id and b['dataVerified'],
          note='Certified selection and source provenance')
    check('/api/v1/indicators', assertion=lambda b, _: len(b) == 14, note='Fourteen actual measurement columns')
    check('/api/v1/variables', assertion=lambda b, _: len(b) == 8 and all(i['unit'] == 'degC' for i in b),
          note='Eight LST compatibility variables; no air-temperature claim')
    raw = {'cell_id': cell_id, 'start_date': '2022-04-07', 'end_date': '2022-04-07', 'page_size': 2}
    check('/api/v1/observations', raw, assertion=lambda b, _: b['total'] == 1 and b['items'][0]['id'] == obs.id
          and b['items'][0]['values']['aqua_lst_day_c'] is None, note='SQL-selected ID; missing Aqua remains null')
    check(f'/api/v1/observations/{obs.id}', assertion=lambda b, _: b['values']['terra_lst_day_c'] == obs.terra_lst_day_c
          and b['values']['aqua_lst_day_c'] is None, note='Independent SQL measurement/null equality')
    check('/api/v1/observations', {**raw, 'page': 2}, assertion=lambda b, _: b['total'] == 1 and not b['items'],
          note='Next page empty; exact filtered count stable')
    check('/api/v1/observations', {**raw, 'west': cell.longitude - 0.001, 'east': cell.longitude + 0.001,
          'south': cell.latitude - 0.001, 'north': cell.latitude + 0.001},
          assertion=lambda b, _: b['total'] == 1, note='Bounding box and cell/date filters intersect')
    check('/api/v1/dashboard/summary', assertion=lambda b, _: b['observation_rows'] == proof['imported_valid_records']
          and b['spatial_cells'] == proof['spatial_cells'] and b['data_verified'], note='Independent certificate row/cell totals')
    check('/api/v1/dashboard/environmental-overview', assertion=lambda b, _: len(b['items']) == 14 and b['data_verified'],
          note='All actual indicators; documented row-weighted source attachments')
    check('/api/v1/dashboard/data-coverage', assertion=lambda b, _: b['source_rows'] == proof['imported_valid_records'] and all(
          item['present_rows'] == proof['measurement_present'][item['indicator']] for item in b['items']),
          note='All fourteen counts match the persisted independent certificate')
    trend = {'indicator': 'terra_lst_day_c', 'cell_id': cell_id, 'start_date': '2022-01-01', 'end_date': '2022-12-31'}
    check('/api/v1/analysis/trends', trend, assertion=lambda b, _: len(b['series']) == 12 and b['dataset_version_id'] == version_id,
          note='Twelve bounded calendar slots, certified version')
    check('/api/v1/analysis/trends', {**trend, 'indicator': 'terra_ndvi_spatial_prev_month'},
          assertion=lambda b, _: len(b['series']) == 12 and b['series'][0]['date'] == '2022-01-01', note='Lagged context uses source months')
    check(f'/api/v1/analysis/trends/{cell.region_id}', {k: v for k, v in trend.items() if k != 'cell_id'},
          assertion=lambda b, _: len(b['series']) == 12, note='Region aggregation; fixed twelve-month result')
    compare = {'indicator': 'terra_lst_day_c', 'region_id': cell.region_id, 'period_a_start': '2021-01-01',
               'period_a_end': '2021-01-31', 'period_b_start': '2022-01-01', 'period_b_end': '2022-01-31'}
    check('/api/v1/analysis/compare', compare, assertion=lambda b, _: b['dataset_version_id'] == version_id
          and b['percentage_change'] is None, note='Pinned certified version; Celsius percentage remains null')
    check('/api/v1/imports', bounded, assertion=lambda b, _: b['total'] == len(jobs), note='Preserved import-attempt count')
    check(f'/api/v1/imports/{job.id}', assertion=lambda b, _: b['processed_rows'] == b['inserted_rows'] == 120000
          and b['status'] == 'completed', note='Historical scoped recovery remains complete with original counters')
    check(f'/api/v1/imports/{job.id}/batches', bounded, assertion=lambda b, _: b['total'] == 12, note='Historical twelve committed batches')
    check(f'/api/v1/imports/{jobs[0].id}/quarantine', {**bounded, 'resolution': 'resolved'},
          assertion=lambda b, _: b['total'] == 112769 and all(q['resolution'] == 'resolved' for q in b['items']),
          note='Resolved historical quarantine, bounded safe metadata without payload')
    check('/api/v1/quality/reports', {**bounded, 'job_id': job.id},
          assertion=lambda b, _: b['total'] == 1 and b['items'][0]['report']['status'] == 'completed', note='Historical job/report status agrees')
    check('/api/v1/observations', {'page_size': 501}, status=422, note='Pagination limit enforced')
    check('/api/v1/observations', {'dataset_version_id': 2147483647}, status=404, note='Unknown version does not fall back')
    check('/api/v1/observations', {'allow_uncertified': True}, status=422, note='Preview requires explicit version')
    check('/api/v1/analysis/trends', {**trend, 'indicator': 'ghsl_2020_built_surface_m2_sum'}, status=422,
          note='Static GHSL cannot become a time trend')
    check('/api/v1/analysis/compare', {**compare, 'period_b_start': '2021-01-15'}, status=422, note='Overlapping periods rejected')
    for path in ['/api/v1/experiments/example', '/api/v1/experiments/example/status', '/api/v1/experiments/example/results',
                 '/api/v1/experiments/example/map', '/api/v1/experiments/example/export', '/api/v1/sessions']:
        check(path, status=501, note='Explicitly unavailable; no fabricated analysis')
    with get_session_factory()() as session:
        after = protected_state(session, version_id)
    evidence['after'] = after
    evidence['protected_state_unchanged'] = before == after
    assert before == after, 'Protected metadata, certificate, counts or history changed during live reads'
    evidence['passed'] = True
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'http_checks': len(evidence['checks']), 'protected_state_unchanged': True}))


if __name__ == '__main__':
    main()
