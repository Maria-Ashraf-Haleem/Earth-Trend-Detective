import pytest


def compare_query(sample_observations, indicator):
    sample = sample_observations
    return {
        'indicator': indicator,
        'region_id': sample['region'].id,
        'dataset_version_id': sample['version'].id,
        'period_a_start': '2021-01-01',
        'period_a_end': '2021-01-08',
        'period_b_start': '2021-01-09',
        'period_b_end': '2021-01-31',
    }


@pytest.mark.integration
def test_disjoint_days_cannot_reuse_same_source_month_context(sql_client, sample_observations):
    response = sql_client.get('/api/v1/analysis/compare', params=compare_query(
        sample_observations, 'terra_ndvi_spatial_prev_month',
    ))
    assert response.status_code == 422
    assert 'source calendar months' in response.json()['message']


@pytest.mark.integration
def test_native_acquisition_comparison_can_use_disjoint_partial_months(sql_client, sample_observations):
    response = sql_client.get('/api/v1/analysis/compare', params=compare_query(
        sample_observations, 'terra_lst_day_c',
    ))
    assert response.status_code == 200
    result = response.json()
    assert result['availability'] == 'available'
    assert result['period_a']['mean'] == pytest.approx(30)
    assert result['period_b']['mean'] == pytest.approx(30)
    assert result['absolute_change'] == pytest.approx(0)


@pytest.mark.integration
def test_default_version_is_pinned_for_second_period(sql_client, sample_observations, monkeypatch):
    import app.main as main
    import app.repositories as repositories

    version = sample_observations['version'].id
    original = main.monthly_series
    received_versions = []

    def record_call(session, filters):
        received_versions.append(filters.dataset_version_id)
        return original(session, filters)

    monkeypatch.setattr(main, 'monthly_series', record_call)
    # Make default selection deterministic while still exercising actual SQL
    # monthly aggregation and checking what the second invocation receives.
    monkeypatch.setattr(repositories, 'active_version', lambda session, requested=None, **kwargs: requested or version)
    params = compare_query(sample_observations, 'terra_lst_day_c')
    params.pop('dataset_version_id')
    response = sql_client.get('/api/v1/analysis/compare', params=params)
    assert response.status_code == 200
    assert received_versions == [None, version]
    assert response.json()['dataset_version_id'] == version


@pytest.mark.parametrize('path,params', [
    ('/api/v1/dashboard/summary', {}),
    ('/api/v1/dashboard/environmental-overview', {}),
    ('/api/v1/dashboard/data-coverage', {}),
    ('/api/v1/analysis/trends/hurghada-study-area', {'indicator': 'terra_lst_day_c'}),
    ('/api/v1/analysis/compare', {
        'indicator': 'terra_lst_day_c',
        'period_a_start': '2020-01-01', 'period_a_end': '2020-12-31',
        'period_b_start': '2021-01-01', 'period_b_end': '2021-12-31',
    }),
])
def test_manually_constructed_analysis_filters_reject_negative_version(client, path, params):
    response = client.get(path, params={**params, 'dataset_version_id': -1})
    assert response.status_code == 422
    assert response.json()['code'] == 'validation_error'
