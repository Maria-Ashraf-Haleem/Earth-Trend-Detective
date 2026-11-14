"""HTTP contract tests plus opt-in, transactional SQL Server integration tests."""

from uuid import uuid4

from fastapi.testclient import TestClient
from pydantic import SecretStr
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import OperationalError

from app.core.database import get_db
from app.models import AnalysisRun, Observation, PeriodComparison, TrendResult
from app.services.catalog import DATASET_ID


def assert_public_error(response, status):
    assert response.status_code == status, response.text
    body = response.json()
    assert body['status'] == status
    assert isinstance(body['code'], str)
    assert isinstance(body['message'], str)
    assert body['request_id'] == response.headers['X-Request-ID']
    return body


@pytest.mark.parametrize('path', ['/health', '/api/v1/health'])
def test_liveness_does_not_require_database(client, path):
    response = client.get(path)
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'
    assert response.headers['X-Request-ID']


def test_openapi_exposes_observed_data_contract(client):
    response = client.get('/openapi.json')
    assert response.status_code == 200
    paths = response.json()['paths']
    for path in ['/api/v1/observations', '/api/v1/indicators', '/api/v1/analysis/trends',
                 '/api/v1/analysis/compare', '/api/v1/imports', '/health/database']:
        assert path in paths
    assert client.get('/docs').status_code == 200


def test_cors_preflight_allows_configured_frontend_origin(client):
    from app.main import settings

    origin = settings.cors_origins[0]
    response = client.options('/api/v1/observations', headers={
        'Origin': origin, 'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'Content-Type',
    })
    assert response.status_code == 200
    assert response.headers['Access-Control-Allow-Origin'] == origin


@pytest.mark.parametrize(('method', 'path'), [
    ('POST', '/api/v1/experiments'),
    ('GET', '/api/v1/experiments/example'),
    ('POST', '/api/v1/experiments/example/run'),
    ('GET', '/api/v1/experiments/example/status'),
    ('GET', '/api/v1/experiments/example/results'),
    ('GET', '/api/v1/experiments/example/map'),
    ('POST', '/api/v1/experiments/example/insights'),
    ('GET', '/api/v1/experiments/example/export?format=csv'),
    ('GET', '/api/v1/sessions'),
    ('POST', '/api/v1/sessions'),
])
def test_legacy_workflows_are_explicitly_unavailable(client, method, path):
    body = assert_public_error(client.request(method, path), 501)
    assert 'unavailable' in body['message']


def test_unknown_route_uses_consistent_error(client):
    assert_public_error(client.get('/api/v1/does-not-exist'), 404)


@pytest.mark.parametrize('params', [
    {'start_date': '2022-12-31', 'end_date': '2021-01-01'},
    {'start_date': '2021-02-30'},
    {'month': 13},
    {'year': 0},
    {'page': 0},
    {'page_size': 501},
    {'sort': 'terra_lst_day_c; DROP TABLE observations'},
    {'order': 'sideways'},
    {'data_source': 'unverified'},
])
def test_observation_query_validation_is_public_and_safe(client, params):
    response = client.get('/api/v1/observations', params=params)
    assert_public_error(response, 422)
    assert 'DROP TABLE' not in response.text


def test_validation_does_not_echo_supplied_filesystem_path(client):
    marker = r'C:\private-test-directory\credentials.json'
    response = client.get('/api/v1/observations', params={'start_date': marker})
    assert_public_error(response, 422)
    assert 'private-test-directory' not in response.text


def test_database_exception_is_sanitized():
    from app.main import app

    def unavailable_db():
        raise OperationalError('SELECT secret FROM C:\\private-test-directory', {}, Exception('secret-password'))
        yield  # pragma: no cover -- dependency must have generator lifetime semantics

    previous_override = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = unavailable_db
    try:
        with TestClient(app) as client:
            response = client.get('/health/database')
        assert_public_error(response, 503)
        assert response.json()['code'] == 'database_unavailable'
        assert 'private-test-directory' not in response.text
        assert 'secret-password' not in response.text
    finally:
        if previous_override is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous_override


def test_import_submission_disabled_without_key(client, monkeypatch):
    from app.main import settings

    monkeypatch.setattr(settings, 'import_api_key', None)
    assert_public_error(client.post('/api/v1/imports', json={}), 503)


@pytest.mark.parametrize('headers', [{}, {'X-Import-Key': 'incorrect-test-key'}])
def test_import_submission_requires_correct_key(client, monkeypatch, headers):
    from app.main import settings

    monkeypatch.setattr(settings, 'import_api_key', SecretStr('correct-test-key'))
    response = client.post('/api/v1/imports', json={}, headers=headers)
    assert_public_error(response, 401)
    assert 'correct-test-key' not in response.text


def test_import_api_rejects_arbitrary_source_path(client, monkeypatch):
    from app.main import settings

    monkeypatch.setattr(settings, 'import_api_key', SecretStr('correct-test-key'))
    response = client.post('/api/v1/imports', json={'data_file_path': 'C:/private-test-directory/data.csv'},
                           headers={'X-Import-Key': 'correct-test-key'})
    assert_public_error(response, 422)
    assert 'private-test-directory' not in response.text


@pytest.mark.integration
def test_database_health_uses_real_sql_server(sql_client):
    for path in ['/health/database', '/api/v1/health/database']:
        response = sql_client.get(path)
        assert response.status_code == 200
        assert response.json() == {'status': 'ok', 'database': 'connected'}


@pytest.mark.integration
def test_catalog_arrays_and_camelcase_metadata(sql_client, sample_observations):
    for endpoint in ['regions', 'datasets']:
        response = sql_client.get(f'/api/v1/{endpoint}', params={'page_size': 100})
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        assert int(response.headers['X-Total-Count']) >= 1
        assert response.headers['X-Page'] == '1'
        assert response.headers['X-Page-Size'] == '100'
    dataset = next(item for item in sql_client.get('/api/v1/datasets').json() if item['id'] == DATASET_ID)
    for field in ['shortName', 'spatialResolution', 'temporalResolution', 'availableBands',
                  'studyPeriod', 'documentationUrl']:
        assert field in dataset
    variables = sql_client.get('/api/v1/variables')
    assert variables.status_code == 200
    assert isinstance(variables.json(), list)
    daytime = next(item for item in variables.json() if item['id'] == 'terra_lst_day_c')
    assert daytime['datasetId'] == DATASET_ID
    assert daytime['scaleFactor'] == 1
    assert daytime['observationWindow'] == 'daytime'


@pytest.mark.integration
def test_region_coordinates_and_paginated_cells(sql_client, sample_observations):
    fixture = sample_observations
    response = sql_client.get(f"/api/v1/regions/{fixture['region'].id}")
    assert response.status_code == 200
    region = response.json()
    assert region['centroid'] == pytest.approx([27.2, 33.755])
    assert region['bounds']['west'] == pytest.approx(33.75)
    assert region['boundaryKind'] == 'source_centroid_bounding_box'
    assert region['boundary']['coordinates'][0][0] == pytest.approx([33.75, 27.2])
    response = sql_client.get(f"/api/v1/regions/{fixture['region'].id}/cells", params={'page_size': 1})
    assert response.status_code == 200
    assert response.json()['total'] == 2
    assert len(response.json()['items']) == 1


@pytest.mark.integration
def test_observation_filters_pagination_and_sorting(sql_client, sample_observations):
    fixture = sample_observations
    params = {'dataset_version_id': fixture['version'].id, 'region_id': fixture['region'].id,
              'indicator': 'terra_lst_day_c', 'page_size': 2, 'sort': 'date', 'order': 'desc'}
    response = sql_client.get('/api/v1/observations', params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['total'] == 5
    assert body['dataset_version_id'] == fixture['version'].id
    assert body['availability'] == 'available'
    assert [item['date'] for item in body['items']] == ['2021-04-01', '2021-03-01']
    assert list(body['items'][0]['values']) == ['terra_lst_day_c']
    assert body['items'][0]['values']['terra_lst_day_c'] == 50.0
    second = sql_client.get('/api/v1/observations', params={**params, 'page': 2}).json()
    assert not ({item['id'] for item in body['items']} & {item['id'] for item in second['items']})

    params.update({'cell_id': fixture['cells'][0].id, 'year': 2021, 'month': 1,
                   'start_date': '2021-01-05', 'end_date': '2021-01-31'})
    response = sql_client.get('/api/v1/observations', params=params)
    assert response.status_code == 200
    assert response.json()['total'] == 1
    assert response.json()['items'][0]['date'] == '2021-01-09'


@pytest.mark.integration
def test_temperature_compatibility_catalog_has_no_invented_vegetation_or_snapshot_window(sql_client):
    indicators = sql_client.get('/api/v1/indicators').json()
    variables = sql_client.get('/api/v1/variables').json()
    assert len(indicators) == 14
    assert len(variables) == 8
    assert {v['id'] for v in variables} == {i['id'] for i in indicators if i['unit'] == 'degC'}
    assert all(v['scaleFactor'] == 1 for v in variables)
    assert not any(v['id'].startswith('ghsl_') or 'ndvi' in v['id'] for v in variables)


@pytest.mark.integration
def test_data_source_filters_measurement_columns(sql_client, sample_observations):
    params = {'dataset_version_id': sample_observations['version'].id, 'data_source': 'aqua'}
    response = sql_client.get('/api/v1/observations', params=params)
    assert response.status_code == 200
    assert response.json()['total'] == 2
    assert all(key.startswith('aqua_') for item in response.json()['items'] for key in item['values'])
    response = sql_client.get('/api/v1/observations', params={**params, 'indicator': 'terra_lst_day_c'})
    assert_public_error(response, 422)


@pytest.mark.integration
def test_observation_detail_preserves_measurement_and_quality(sql_client, sample_observations):
    observation = sample_observations['observations'][0]
    response = sql_client.get(f'/api/v1/observations/{observation.id}')
    assert response.status_code == 200
    body = response.json()
    assert body['values']['terra_lst_day_c'] == 10.0
    assert body['values']['aqua_lst_day_c'] == 14.0
    assert body['quality']['terra_lst_day_valid'] == 'True'
    assert 'source_metadata' not in body


@pytest.mark.integration
def test_trend_uses_equal_cell_months_without_writing_history(sql_client, sql_session, sample_observations):
    params = {'dataset_version_id': sample_observations['version'].id,
              'region_id': sample_observations['region'].id, 'indicator': 'terra_lst_day_c',
              'start_date': '2021-01-01', 'end_date': '2021-04-30'}
    response = sql_client.get('/api/v1/analysis/trends', params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert [{'date': point['date'], 'value': point['value']} for point in body['series']] == [
        {'date': '2021-01-01', 'value': 35.0},
        {'date': '2021-02-01', 'value': None},
        {'date': '2021-03-01', 'value': 40.0},
        {'date': '2021-04-01', 'value': 50.0},
    ]
    assert body['series'][0]['observed_cells'] == 2
    assert body['series'][0]['contributing_cells'] == 2
    assert body['series'][0]['source_rows'] == 3
    assert body['series'][1]['observed_cells'] == 0
    assert body['observation_count'] == 3
    assert body['missing_data_ratio'] == 0.25
    assert body['absolute_change'] == 15.0
    assert body['percentage_change'] is None
    assert body['slope_per_year'] > 0
    assert body['method'] == 'ordinary_least_squares_elapsed_years'
    assert sql_session.get(AnalysisRun, body['analysis_id']) is None
    assert sql_session.scalar(select(func.count()).select_from(TrendResult)
                              .where(TrendResult.run_id == body['analysis_id'])) == 0


@pytest.mark.integration
def test_lagged_context_is_deduplicated_and_dated_to_source_month(sql_client, sample_observations):
    params = {'dataset_version_id': sample_observations['version'].id,
              'region_id': sample_observations['region'].id, 'indicator': 'terra_ndvi_spatial_prev_month',
              'start_date': '2020-12-01', 'end_date': '2021-02-28'}
    response = sql_client.get('/api/v1/analysis/trends', params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert [item['date'] for item in body['series']] == ['2020-12-01', '2021-01-01', '2021-02-01']
    assert body['series'][0]['value'] == pytest.approx(0.2)
    assert body['series'][1]['value'] is None
    assert body['series'][2]['value'] == pytest.approx(0.2)
    assert body['observation_count'] == 2
    assert body['p_value'] is None


@pytest.mark.integration
@pytest.mark.parametrize('params', [{}, {'indicator': 'ghsl_2020_built_surface_m2_sum'}])
def test_trends_require_time_varying_indicator(sql_client, params):
    assert_public_error(sql_client.get('/api/v1/analysis/trends', params=params), 422)


@pytest.mark.integration
@pytest.mark.parametrize('periods', [
    {'period_a_start': '2021-02-01', 'period_a_end': '2021-01-01',
     'period_b_start': '2021-03-01', 'period_b_end': '2021-04-30'},
    {'period_a_start': '2021-01-01', 'period_a_end': '2021-03-31',
     'period_b_start': '2021-03-01', 'period_b_end': '2021-04-30'},
])
def test_period_comparison_rejects_invalid_or_overlapping_dates(sql_client, periods):
    response = sql_client.get('/api/v1/analysis/compare', params={'indicator': 'terra_lst_day_c', **periods})
    assert_public_error(response, 422)


@pytest.mark.integration
def test_period_comparison_uses_observed_aggregate_means(sql_client, sql_session, sample_observations):
    params = {'dataset_version_id': sample_observations['version'].id,
              'region_id': sample_observations['region'].id, 'indicator': 'terra_lst_day_c',
              'period_a_start': '2021-01-01', 'period_a_end': '2021-01-31',
              'period_b_start': '2021-03-01', 'period_b_end': '2021-04-30'}
    response = sql_client.get('/api/v1/analysis/compare', params=params)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body['period_a']['mean'] == 35.0
    assert body['period_b']['mean'] == 45.0
    assert body['absolute_change'] == 10.0
    assert body['percentage_change'] is None
    assert body['p_value'] is None
    assert sql_session.scalar(select(func.count()).select_from(PeriodComparison)
                              .where(PeriodComparison.run_id == body['analysis_id'])) == 0


@pytest.mark.integration
def test_dashboard_reports_observation_coverage_and_unavailable_predictions(sql_client, sample_observations):
    params = {'dataset_version_id': sample_observations['version'].id,
              'region_id': sample_observations['region'].id}
    response = sql_client.get('/api/v1/dashboard/summary', params=params)
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary['observation_rows'] == 5
    assert summary['spatial_cells'] == 2
    assert summary['tourism'] == summary['air_temperature'] == summary['predictions'] == 'unavailable'
    response = sql_client.get('/api/v1/dashboard/data-coverage', params=params)
    assert response.status_code == 200
    aqua = next(item for item in response.json()['items'] if item['indicator'] == 'aqua_lst_day_c')
    assert aqua['present_rows'] == 2
    assert aqua['missing_rows'] == 3
    assert aqua['present_ratio'] == 0.4


@pytest.mark.integration
def test_missing_records_return_404(sql_client, sample_observations):
    missing = uuid4().hex
    for path in [f'/api/v1/regions/{missing}', f'/api/v1/datasets/{missing}',
                 f'/api/v1/imports/{missing}', '/api/v1/observations/-1']:
        assert_public_error(sql_client.get(path), 404)
    response = sql_client.get('/api/v1/observations', params={'dataset_version_id': 2147483647})
    assert_public_error(response, 404)


@pytest.mark.integration
def test_import_and_dataset_details_do_not_expose_audit_paths(sql_client, sql_session, sample_observations):
    fixture = sample_observations
    fixture['version'].audit_json = {'source_file': 'C:/private-test-directory/raw.csv',
                                      'audit_file': 'C:/private-test-directory/audit.json', 'rows': 5}
    sql_session.flush()
    for path in [f'/api/v1/imports/{fixture["job"].id}', f'/api/v1/datasets/{DATASET_ID}']:
        response = sql_client.get(path)
        assert response.status_code == 200
        assert 'private-test-directory' not in response.text
        assert 'source_file' not in response.text


@pytest.mark.integration
def test_no_matching_observations_return_explicit_unavailable(sql_client, sample_observations):
    params = {'dataset_version_id': sample_observations['version'].id, 'start_date': '2010-01-01',
              'end_date': '2010-12-31', 'indicator': 'terra_lst_day_c'}
    response = sql_client.get('/api/v1/observations', params=params)
    assert response.status_code == 200
    assert response.json()['items'] == []
    assert response.json()['availability'] == 'unavailable'
    assert response.json()['total'] == 0
    assert sql_client.get('/api/v1/locations', params={'region_id': sample_observations['region'].id}) \
        .json()['availability'] == 'unavailable'


@pytest.mark.integration
def test_source_version_filter_never_leaks_other_versions(sql_client, sql_session, sample_observations):
    fixture = sample_observations
    response = sql_client.get('/api/v1/observations', params={'dataset_version_id': fixture['version'].id})
    assert response.status_code == 200
    returned = response.json()['items']
    assert {item['id'] for item in returned} == {row.id for row in fixture['observations']}
    assert sql_session.scalar(select(func.count()).select_from(Observation)
                              .where(Observation.dataset_version_id == fixture['version'].id)) == 5
