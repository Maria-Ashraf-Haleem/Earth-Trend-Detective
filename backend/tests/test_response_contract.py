"""Typed response contracts, nullable missing states, and safe extensible data."""

from uuid import uuid4

import pytest

from app.models import Dataset, DatasetVersion, ImportJob, ImportLog, QualityReport, Region


def test_all_successful_openapi_operations_expose_named_response_models(client):
    specification = client.get('/openapi.json').json()
    checked = []
    for path, operations in specification['paths'].items():
        for method, operation in operations.items():
            if method not in {'get', 'post', 'put', 'patch', 'delete'}:
                continue
            for status, response in operation['responses'].items():
                if not status.startswith('2'):
                    continue
                schema = response.get('content', {}).get('application/json', {}).get('schema')
                assert schema, f'{method.upper()} {path} {status} has no response schema'
                if schema.get('type') == 'array':
                    assert '$ref' in schema.get('items', {}), f'{method.upper()} {path} has untyped items'
                else:
                    assert '$ref' in schema, f'{method.upper()} {path} has no named response model'
                checked.append((method, path, status))
    assert len(checked) >= 20


@pytest.mark.integration
def test_environmental_overview_preserves_nullable_measurements_and_method(sql_client, sample_observations):
    fixture = sample_observations
    response = sql_client.get('/api/v1/dashboard/environmental-overview', params={
        'region_id': fixture['region'].id,
        'dataset_version_id': fixture['version'].id,
    })
    assert response.status_code == 200, response.text
    result = response.json()
    items = {item['indicator']: item for item in result['items']}
    assert items['terra_lst_day_c']['mean_attached_source_value'] == pytest.approx(36)
    assert items['aqua_lst_day_c']['mean_attached_source_value'] == pytest.approx(33)
    assert items['terra_ndvi_spatial_prev_month']['mean_attached_source_value'] == pytest.approx(0.175)
    assert items['terra_lst_night_c']['mean_attached_source_value'] is None
    assert items['terra_lst_night_c']['availability'] == 'unavailable'
    assert result['dataset_version_id'] == fixture['version'].id
    assert result['import_complete'] is True
    assert result['warning'] is None
    assert 'row-weighted' in result['methodology']


@pytest.mark.integration
def test_import_list_and_detail_keep_counters_nullable_dates_and_log_fields(
    sql_client, sql_session, sample_observations,
):
    fixture = sample_observations
    sql_session.add(ImportLog(
        job_id=fixture['job'].id, row_number=None, level='INFO', code='TEST_FIXTURE',
        message='Synthetic rollback fixture log.',
    ))
    sql_session.flush()
    response = sql_client.get('/api/v1/imports', params={'page_size': 500})
    assert response.status_code == 200, response.text
    result = response.json()
    item = next(item for item in result['items'] if item['id'] == fixture['job'].id)
    assert result['page'] == 1
    assert result['page_size'] == 500
    assert result['total'] >= 1
    assert item['processed_rows'] == item['inserted_rows'] == item['checkpoint_row'] == 5
    assert item['duplicate_rows'] == item['rejected_rows'] == 0
    assert item['started_at'] is None
    assert item['finished_at'] is None
    assert item['error_code'] is None

    detail_response = sql_client.get(f'/api/v1/imports/{fixture["job"].id}')
    assert detail_response.status_code == 200, detail_response.text
    detail = detail_response.json()
    assert detail['status'] == 'completed'
    assert detail['dataset_version_id'] == fixture['version'].id
    assert detail['created_at']
    assert detail['logs'] == [{
        'row_number': None, 'level': 'INFO', 'code': 'TEST_FIXTURE',
        'message': 'Synthetic rollback fixture log.',
    }]


@pytest.mark.integration
def test_quality_report_response_preserves_extensible_safe_provenance(sql_client, sql_session, sample_observations):
    fixture = sample_observations
    report = {
        'status': 'synthetic_rollback_fixture',
        'source_rows': 5,
        'field_coverage': {'terra_lst_day_c': 5, 'terra_lst_night_c': 0},
        'extension': {'new_quality_metric': 0.75, 'verified': False, 'unknown': None},
    }
    record = QualityReport(job_id=fixture['job'].id, report_json=report)
    sql_session.add(record)
    sql_session.flush()
    response = sql_client.get('/api/v1/quality/reports', params={'job_id': fixture['job'].id})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['total'] == 1
    assert result['items'][0]['id'] == record.id
    assert result['items'][0]['job_id'] == fixture['job'].id
    assert result['items'][0]['created_at']
    assert result['items'][0]['report'] == report


@pytest.mark.integration
def test_region_without_cells_retains_explicit_null_extent(sql_client, sql_session):
    region = Region(
        id=f'empty-region-{uuid4().hex}', name='Empty rollback fixture', country='Egypt',
        description='Synthetic region with no source cells.',
    )
    sql_session.add(region)
    sql_session.flush()
    response = sql_client.get(f'/api/v1/regions/{region.id}')
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['availability'] == 'unavailable'
    assert result['centroid'] is None
    assert result['bounds'] is None
    assert result['boundary'] is None
    assert result['boundaryKind'] == 'source_centroid_bounding_box'


@pytest.mark.integration
def test_dataset_without_versions_retains_null_period_and_empty_versions(sql_client, sql_session):
    dataset = Dataset(
        id=f'empty-dataset-{uuid4().hex}', name='Empty rollback fixture dataset',
        description='No imported version exists for this fixture.',
    )
    sql_session.add(dataset)
    sql_session.flush()
    response = sql_client.get(f'/api/v1/datasets/{dataset.id}')
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['availability'] == 'unavailable'
    assert result['datasetVersionId'] is None
    assert result['studyPeriod'] == {'start': None, 'end': None}
    assert result['versions'] == []
    assert result['availableBands']
    assert result['notes']


@pytest.mark.integration
def test_dataset_catalog_selects_populated_version_before_new_empty_failure(
    sql_client, sql_session, sample_observations,
):
    fixture = sample_observations
    empty_version = DatasetVersion(dataset_id=fixture['version'].dataset_id, sha256=uuid4().hex * 2,
                                   source_size=0, audit_json={'test_fixture': True})
    sql_session.add(empty_version)
    sql_session.flush()
    sql_session.add(ImportJob(id=str(uuid4()), dataset_version_id=empty_version.id, status='failed',
                             inserted_rows=0, error_code='TEST_FIXTURE_EMPTY_FAILURE'))
    sql_session.flush()
    assert empty_version.id > fixture['version'].id

    response = sql_client.get(f'/api/v1/datasets/{fixture["version"].dataset_id}')
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['datasetVersionId'] == fixture['version'].id
    assert result['version'] == fixture['version'].sha256
    assert result['studyPeriod'] == {'start': '2021-01-01', 'end': '2021-04-01'}
    assert result['importComplete'] is True
    assert empty_version.id in {version['id'] for version in result['versions']}


@pytest.mark.integration
@pytest.mark.parametrize('start,end,count,availability', [
    ('2100-01-01', '2100-03-31', 0, 'unavailable'),
    ('2021-01-01', '2021-03-31', 2, 'insufficient_data'),
])
def test_short_trend_retains_null_inference_and_calendar_support(
    sql_client, sample_observations, start, end, count, availability,
):
    fixture = sample_observations
    response = sql_client.get('/api/v1/analysis/trends', params={
        'indicator': 'terra_lst_day_c', 'region_id': fixture['region'].id,
        'dataset_version_id': fixture['version'].id, 'start_date': start, 'end_date': end,
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['availability'] == availability
    assert result['observation_count'] == count
    assert result['total_slots'] == 3
    assert result['slope_per_year'] is None
    assert result['p_value'] is None
    assert result['confidence_interval'] is None
    assert result['significant'] is None
    assert result['percentage_change'] is None
    assert result['analysis_id']
    assert result['method']
    assert result['methodology']
    assert result['warnings']
    assert len(result['series']) == 3
    assert all({'date', 'value', 'observed_cells', 'contributing_cells', 'source_rows'} <= point.keys()
               for point in result['series'])
    missing = result['series'][1]
    assert missing['value'] is None
    assert missing['observed_cells'] == missing['contributing_cells'] == missing['source_rows'] == 0
