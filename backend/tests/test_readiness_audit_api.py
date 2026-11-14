"""Small, rolled-back SQL fixtures verify readiness, spatial and audit contracts."""
from datetime import datetime, timezone
from uuid import uuid4

from pydantic import SecretStr
import pytest

from app.models import Dataset, ImportBatch, ImportQuarantine
from app.repositories import latest_certified_version
from app.services.ingestion.validation import VALIDATION_POLICY_VERSION
from test_import_submission import _authorize_without_active_worker


@pytest.mark.integration
@pytest.mark.parametrize('manifest,stamped', [
    ({}, False),
    ({'reconciled': True, 'validation_policy': VALIDATION_POLICY_VERSION}, False),
    ({'reconciled': False, 'validation_policy': VALIDATION_POLICY_VERSION}, True),
    ({'reconciled': True, 'validation_policy': 'retired-test-policy'}, True),
])
def test_readiness_requires_current_independent_validation(
    sql_client, sql_session, sample_observations, manifest, stamped, monkeypatch,
):
    import app.main as main

    version = sample_observations['version']
    dataset = Dataset(id=f'readiness-{uuid4().hex}', name='Rollback readiness fixture', description='Isolated publication catalog')
    sql_session.add(dataset)
    sql_session.flush()
    version.dataset_id = dataset.id
    version.validation_json = manifest
    version.validated_at = datetime.now(timezone.utc).replace(tzinfo=None) if stamped else None
    sql_session.flush()
    # Scope default publication to an isolated logical dataset so the existing
    # live version 6 cannot correctly satisfy readiness for this negative case.
    original = main.active_version
    def scoped_version(db, requested=None, **kwargs):
        if requested is not None:
            return original(db, requested, **kwargs)
        return latest_certified_version(db, dataset.id, required=True).id
    monkeypatch.setattr(main, 'active_version', scoped_version)
    response = sql_client.get('/api/v1/health/readiness')
    assert response.status_code == 503, response.text
    result = response.json()
    assert result['status'] == 'not_ready'
    assert result['dataset_version_id'] is None
    assert result['checks'] == {'database': True, 'schema_current': True, 'data_verified': False}
    assert sql_client.get('/api/v1/dashboard/summary', params={
        'region_id': sample_observations['region'].id, 'dataset_version_id': version.id,
    }).status_code == 409


@pytest.mark.integration
def test_current_certification_makes_readiness_ready(sql_client, sql_session, sample_observations):
    version = sample_observations['version']
    version.validation_json = {'reconciled': True, 'validation_policy': VALIDATION_POLICY_VERSION}
    version.validated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    sql_session.flush()
    response = sql_client.get('/api/v1/health/readiness')
    assert response.status_code == 200, response.text
    assert response.json() == {
        'status': 'ready', 'checks': {'database': True, 'schema_current': True, 'data_verified': True},
        'dataset_version_id': version.id,
    }


@pytest.mark.integration
def test_completed_scoped_replay_alone_does_not_prove_full_import(
    sql_client, sql_session, sample_observations, monkeypatch,
):
    from app.main import settings

    fixture = sample_observations
    fixture['version'].validated_at = None
    fixture['version'].validation_json = {}
    fixture['job'].scope_json = {'kind': 'quarantine_replay', 'source_job_id': str(uuid4())}
    monkeypatch.setattr(settings, 'import_api_key', SecretStr('readiness-preview-test-key'))
    sql_session.flush()
    response = sql_client.get('/api/v1/dashboard/summary', params={
        'region_id': fixture['region'].id, 'dataset_version_id': fixture['version'].id,
        'allow_uncertified': True,
    }, headers={'X-Import-Key': 'readiness-preview-test-key'})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['observation_rows'] == 5
    assert result['import_complete'] is False
    assert result['data_verified'] is False
    assert result['warning']


@pytest.mark.parametrize('bounds', [
    {'west': 33.7},
    {'west': 33.7, 'south': 27.1, 'east': 33.9},
    {'west': 33.9, 'south': 27.1, 'east': 33.7, 'north': 27.3},
    {'west': 33.7, 'south': 27.3, 'east': 33.9, 'north': 27.1},
    {'west': 33.7, 'south': 27.1, 'east': 33.7, 'north': 27.3},
    {'west': 181, 'south': 27.1, 'east': 182, 'north': 27.3},
])
def test_bbox_requires_a_complete_increasing_geographic_extent(client, bounds):
    response = client.get('/api/v1/observations', params=bounds)
    assert response.status_code == 422, response.text
    assert response.json()['code'] == 'validation_error'


@pytest.mark.integration
def test_bbox_filters_observations_and_monthly_series(sql_client, sample_observations):
    fixture = sample_observations
    params = {'dataset_version_id': fixture['version'].id, 'region_id': fixture['region'].id,
              'west': 33.749, 'south': 27.19, 'east': 33.755, 'north': 27.21}
    response = sql_client.get('/api/v1/observations', params=params)
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['total'] == len(result['items']) == 4
    assert {row['cell_id'] for row in result['items']} == {fixture['cells'][0].id}
    response = sql_client.get('/api/v1/analysis/trends', params={
        **params, 'indicator': 'terra_lst_day_c', 'start_date': '2021-01-01', 'end_date': '2021-04-30',
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert [point['value'] for point in result['series']] == [20.0, None, 40.0, 50.0]
    assert result['observation_count'] == 3


@pytest.mark.integration
def test_batch_audit_is_ordered_paginated_and_reconciled(sql_client, sql_session, sample_observations):
    job = sample_observations['job']
    sql_session.add_all([
        ImportBatch(job_id=job.id, batch_number=2, source_start_row=3, source_end_row=5,
                    processed_rows=3, inserted_rows=3, duplicate_rows=0, rejected_rows=0),
        ImportBatch(job_id=job.id, batch_number=1, source_start_row=1, source_end_row=2,
                    processed_rows=2, inserted_rows=2, duplicate_rows=0, rejected_rows=0),
    ])
    sql_session.flush()
    response = sql_client.get(f'/api/v1/imports/{job.id}/batches', params={'page': 2, 'page_size': 1})
    assert response.status_code == 200, response.text
    result = response.json()
    assert (result['page'], result['page_size'], result['total']) == (2, 1, 2)
    assert len(result['items']) == 1
    batch = result['items'][0]
    assert batch['job_id'] == job.id
    assert batch['batch_number'] == 2
    assert batch['source_start_row'] == 3 and batch['source_end_row'] == 5
    assert batch['processed_rows'] == batch['inserted_rows'] + batch['duplicate_rows'] + batch['rejected_rows']
    assert batch['committed_at']


def _quarantine_fixture(sql_session, fixture):
    job = fixture['job']
    job.processed_rows = job.checkpoint_row = job.total_rows = 7
    job.rejected_rows = 2
    records = [ImportQuarantine(
        job_id=job.id, dataset_version_id=fixture['version'].id, source_row=number,
        row_hash=uuid4().hex * 2, error_code='SYNTHETIC_TEST_REJECTION', error_field='latitude',
        raw_payload={'private_marker': 'C:/private/secret-fixture.csv'}, resolution=state,
    ) for number, state in ((6, 'pending'), (7, 'resolved'))]
    sql_session.add_all(records)
    sql_session.flush()
    return records


@pytest.mark.integration
def test_quarantine_metadata_filters_and_omits_raw_payload(sql_client, sql_session, sample_observations):
    fixture = sample_observations
    _quarantine_fixture(sql_session, fixture)
    response = sql_client.get(f'/api/v1/imports/{fixture["job"].id}/quarantine',
                              params={'resolution': 'pending', 'page_size': 1})
    assert response.status_code == 200, response.text
    result = response.json()
    assert result['total'] == len(result['items']) == 1
    record = result['items'][0]
    assert record['source_row'] == 6 and record['resolution'] == 'pending'
    assert record['error_code'] == 'SYNTHETIC_TEST_REJECTION'
    assert record['resolved_observation_id'] is None
    assert 'raw_payload' not in record
    assert 'private_marker' not in response.text and 'secret-fixture' not in response.text
    assert sql_client.get(f'/api/v1/imports/{fixture["job"].id}/quarantine',
                          params={'resolution': 'unknown'}).status_code == 422


@pytest.mark.integration
@pytest.mark.parametrize('suffix', ['batches', 'quarantine'])
def test_audit_routes_require_an_existing_job(sql_client, suffix):
    response = sql_client.get(f'/api/v1/imports/{uuid4()}/{suffix}')
    assert response.status_code == 404


def test_import_resume_and_quarantine_replay_are_mutually_exclusive(client, monkeypatch):
    from app.main import settings
    monkeypatch.setattr(settings, 'import_api_key', SecretStr('rollback-fixture-secret'))
    response = client.post('/api/v1/imports', headers={'X-Import-Key': 'rollback-fixture-secret'}, json={
        'resume_job_id': str(uuid4()), 'retry_quarantine_job_id': str(uuid4()),
    })
    assert response.status_code == 422, response.text
    assert response.json()['code'] == 'validation_error'


@pytest.mark.integration
def test_authorized_quarantine_submission_has_explicit_scope(
    sql_client, sql_session, sample_observations, monkeypatch,
):
    headers = _authorize_without_active_worker(sql_session, monkeypatch)
    fixture = sample_observations
    _quarantine_fixture(sql_session, fixture)
    response = sql_client.post('/api/v1/imports', headers=headers,
                               json={'retry_quarantine_job_id': fixture['job'].id})
    assert response.status_code == 202, response.text
    job = response.json()['job']
    assert job['status'] == 'queued'
    assert job['dataset_version_id'] == fixture['version'].id
    assert job['scope'] == {'kind': 'quarantine_replay', 'source_job_id': fixture['job'].id}
    assert job['processed_rows'] == job['checkpoint_row'] == 0


@pytest.mark.integration
def test_quarantine_submission_rejects_a_source_without_records(
    sql_client, sql_session, sample_observations, monkeypatch,
):
    headers = _authorize_without_active_worker(sql_session, monkeypatch)
    response = sql_client.post('/api/v1/imports', headers=headers,
                               json={'retry_quarantine_job_id': sample_observations['job'].id})
    assert response.status_code == 409, response.text
