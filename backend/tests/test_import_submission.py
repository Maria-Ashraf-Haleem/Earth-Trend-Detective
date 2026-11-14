"""Exercise authorized durable submissions after the real importer releases its lock."""
import pytest
from pydantic import SecretStr
from sqlalchemy import select

from app.models import ImportJob


def _authorize_without_active_worker(sql_session, monkeypatch):
    from app.main import settings

    active = sql_session.scalar(select(ImportJob.id).where(ImportJob.status.in_(['queued', 'running'])).limit(1))
    if active:
        pytest.skip('A real ingestion job is active; do not interfere with its application lock')
    monkeypatch.setattr(settings, 'import_api_key', SecretStr('rollback-fixture-secret'))
    return {'X-Import-Key': 'rollback-fixture-secret'}


@pytest.mark.integration
def test_authorized_submission_is_durable_and_rejects_a_second_queue(sql_client, sql_session, monkeypatch):
    headers = _authorize_without_active_worker(sql_session, monkeypatch)
    response = sql_client.post('/api/v1/imports', json={}, headers=headers)
    assert response.status_code == 202, response.text
    job = response.json()['job']
    assert job['status'] == 'queued'
    assert job['dataset_version_id'] is None
    assert job['checkpoint_row'] == job['inserted_rows'] == job['processed_rows'] == 0
    assert sql_session.get(ImportJob, job['id']).status == 'queued'
    assert sql_client.post('/api/v1/imports', json={}, headers=headers).status_code == 409


@pytest.mark.integration
def test_authorized_resume_preserves_checkpoint(sql_client, sql_session, sample_observations, monkeypatch):
    headers = _authorize_without_active_worker(sql_session, monkeypatch)
    job = sample_observations['job']
    job.status = 'paused'
    job.error_code = 'SYNTHETIC_ROLLBACK_FIXTURE'
    sql_session.flush()
    response = sql_client.post('/api/v1/imports', json={'resume_job_id': job.id}, headers=headers)
    assert response.status_code == 202, response.text
    result = response.json()['job']
    assert result['id'] == job.id
    assert result['status'] == 'queued'
    assert result['checkpoint_row'] == result['inserted_rows'] == 5
    assert result['error_code'] is None


@pytest.mark.integration
def test_retired_policy_cannot_be_resumed(sql_client, sql_session, sample_observations, monkeypatch):
    headers = _authorize_without_active_worker(sql_session, monkeypatch)
    job = sample_observations['job']
    job.status = 'failed'
    job.error_code = 'VALIDATION_POLICY_UPDATED'
    sql_session.flush()
    response = sql_client.post('/api/v1/imports', json={'resume_job_id': job.id}, headers=headers)
    assert response.status_code == 409
    assert job.status == 'failed'
    assert job.error_code == 'VALIDATION_POLICY_UPDATED'
