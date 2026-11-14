"""Public analytical reads must not mutate the existing saved history."""

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select

from app.models import AnalysisRun, EnvironmentalSummary, PeriodComparison, TrendResult


@pytest.mark.integration
def test_repeated_analytical_gets_preserve_all_history_tables(sql_client, sql_session, sample_observations):
    fixture = sample_observations
    models = (AnalysisRun, TrendResult, PeriodComparison, EnvironmentalSummary)

    def counts():
        return [sql_session.scalar(select(func.count()).select_from(model)) for model in models]

    before = counts()
    common = {'dataset_version_id': fixture['version'].id, 'indicator': 'terra_lst_day_c',
              'region_id': fixture['region'].id}
    calls = [
        ('/api/v1/analysis/trends', {**common, 'start_date': '2021-01-01', 'end_date': '2021-04-30'}),
        (f"/api/v1/analysis/trends/{fixture['region'].id}", {
            k: v for k, v in {**common, 'start_date': '2021-01-01', 'end_date': '2021-04-30'}.items()
            if k != 'region_id'}),
        ('/api/v1/analysis/compare', {**common, 'period_a_start': '2021-01-01',
         'period_a_end': '2021-01-31', 'period_b_start': '2021-03-01', 'period_b_end': '2021-04-30'}),
    ]
    ids = []
    for path, params in calls:
        for _ in range(2):
            response = sql_client.get(path, params=params)
            assert response.status_code == 200, response.text
            ids.append(response.json()['analysis_id'])
    assert len(set(ids)) == 6
    assert counts() == before
    assert not sql_session.new and not sql_session.dirty and not sql_session.deleted


@pytest.mark.integration
@pytest.mark.parametrize('path', [
    '/api/v1/observations', '/api/v1/analysis/trends', '/api/v1/analysis/trends/{region}',
    '/api/v1/analysis/compare', '/api/v1/dashboard/summary',
    '/api/v1/dashboard/environmental-overview', '/api/v1/dashboard/data-coverage',
])
def test_uncertified_preview_requires_explicit_selection_and_key(
    sql_client, sql_session, sample_observations, monkeypatch, path,
):
    from app.main import settings

    fixture = sample_observations
    fixture['version'].validated_at = None
    fixture['version'].validation_json = {}
    sql_session.flush()
    monkeypatch.setattr(settings, 'import_api_key', SecretStr('preview-test-key'))
    path = path.format(region=fixture['region'].id)
    params = {'dataset_version_id': fixture['version'].id, 'region_id': fixture['region'].id,
              'indicator': 'terra_lst_day_c', 'start_date': '2021-01-01', 'end_date': '2021-04-30',
              'period_a_start': '2021-01-01', 'period_a_end': '2021-01-31',
              'period_b_start': '2021-03-01', 'period_b_end': '2021-04-30'}
    assert sql_client.get(path, params=params).status_code == 409
    preview = {**params, 'allow_uncertified': True}
    assert sql_client.get(path, params=preview).status_code == 401
    response = sql_client.get(path, params=preview, headers={'X-Import-Key': 'preview-test-key'})
    assert response.status_code == 200, response.text
    if 'data_verified' in response.json():
        assert response.json()['data_verified'] is False
    preview.pop('dataset_version_id')
    assert sql_client.get(path, params=preview, headers={'X-Import-Key': 'preview-test-key'}).status_code == 422


@pytest.mark.integration
def test_observation_by_id_cannot_bypass_publication(sql_client, sql_session, sample_observations, monkeypatch):
    from app.main import settings

    fixture = sample_observations
    fixture['version'].validated_at = None
    fixture['version'].validation_json = {}
    sql_session.flush()
    monkeypatch.setattr(settings, 'import_api_key', SecretStr('preview-test-key'))
    path = f"/api/v1/observations/{fixture['observations'][0].id}"
    assert sql_client.get(path).status_code == 409
    assert sql_client.get(path, params={'allow_uncertified': True}).status_code == 401
    assert sql_client.get(path, params={'allow_uncertified': True},
                          headers={'X-Import-Key': 'preview-test-key'}).status_code == 200


@pytest.mark.parametrize('path', ['/api/v1/analysis/trends', '/api/v1/analysis/trends/hurghada-study-area'])
def test_trend_indicator_is_required_in_openapi_and_runtime(client, path):
    for params in ({}, {'indicator': ''}):
        assert client.get(path, params=params).status_code == 422
    parameters = client.get('/openapi.json').json()['paths'][path.replace('hurghada-study-area', '{region_id}')]['get']['parameters']
    indicator = next(p for p in parameters if p['name'] == 'indicator')
    assert indicator['required'] is True
    assert indicator['schema']['minLength'] == 1
