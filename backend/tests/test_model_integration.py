"""Model integration contract tests: disabled state must stay explicit.

No model exists yet. These tests pin the honest not-configured behaviour and
the null-preserving feature document shape, so a future provider cannot be
wired in while silently generating fabricated predictions.
"""
from app.services.modeling.config import ModelSettings
from app.services.modeling.features import build_feature_document


def test_status_is_not_configured_when_disabled(client):
    response = client.get('/api/v1/model/status')
    assert response.status_code == 200
    body = response.json()
    assert body['enabled'] is False
    assert body['status'] == 'not_configured'
    assert body['feature_version'] == 'ml_features_v1'
    assert 'unavailable' in body['message']


def test_predictions_rejected_while_disabled(client):
    response = client.post('/api/v1/model/predictions', json={'cell_id': 1})
    assert response.status_code == 503
    assert response.json()['code'] == 'model_not_configured'


def test_settings_reject_non_http_endpoint():
    import pytest
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        ModelSettings(model_enabled=True, model_provider='http',
                      model_endpoint='ftp://not-allowed.example/predict')


def test_feature_document_preserves_missing_values_as_nulls():
    rows = [{'cell_id': 18, 'observation_date': '2022-04-07', 'source_split': 'train',
             'terra_lst_day_c': 18.95, 'terra_lst_night_c': 5.87, 'aqua_lst_day_c': None,
             'aqua_lst_night_c': 2.45, 'year': 2022, 'month': 4, 'day_of_year': 97,
             'season_sin': -0.072918, 'season_cos': 0.997338,
             'terra_ndvi_spatial_prev_month': 0.098069, 'terra_evi_spatial_prev_month': 0.078231,
             'aqua_ndvi_spatial_prev_month': None, 'aqua_evi_spatial_prev_month': None,
             'terra_monthly_day_spatial_prev_month': None, 'terra_monthly_night_spatial_prev_month': None,
             'aqua_monthly_day_spatial_prev_month': None, 'aqua_monthly_night_spatial_prev_month': None,
             'ghsl_2020_built_surface_m2_sum': None, 'ghsl_2020_valid_pixel_count': 79.0,
             'terra_day_valid': 1, 'terra_night_valid': 1, 'aqua_day_valid': 1, 'aqua_night_valid': 1,
             'terra_day_qa_accepted': 1, 'terra_night_qa_accepted': 1,
             'aqua_day_qa_accepted': 1, 'aqua_night_qa_accepted': 1,
             'terra_day_night_delta_c': 13.08, 'aqua_day_night_delta_c': 23.26,
             'terra_aqua_day_difference_c': -6.76}]
    document = build_feature_document(rows, 'ml_features_v1')
    assert document['row_count'] == 1
    assert document['feature_version'] == 'ml_features_v1'
    assert document['null_policy'].startswith('missing values are null')
    lst = document['rows'][0]['lst']
    assert lst['terra_lst_day_c'] == 18.95
    assert lst['aqua_lst_day_c'] is None
    vegetation = document['rows'][0]['vegetation']
    assert vegetation['aqua_ndvi_spatial_prev_month'] is None
