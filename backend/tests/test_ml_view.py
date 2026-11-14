"""The ML handoff view is a read-only, source-preserving SQL Server projection."""
from datetime import date

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from app.models import MEASUREMENT_COLUMNS, Observation


def _first(sql_session, sample_observations, metadata=None):
    observation = sample_observations['observations'][0]
    if metadata is not None:
        observation.source_metadata = metadata
    sql_session.flush()
    return observation


def _read(sql_session, observation, columns):
    # Names are test-owned literals or the fixed model feature tuple, never input.
    return sql_session.execute(text(
        f"SELECT {', '.join(columns)} FROM dbo.ml_features_v1 "
        "WHERE dataset_version_id = :version AND id = :id"
    ), {'version': observation.dataset_version_id, 'id': observation.id}).mappings().one()


@pytest.mark.integration
def test_ml_view_preserves_all_fourteen_measurements_without_rescaling(sql_session, sample_observations):
    observation = sample_observations['observations'][0]
    values = dict(zip(MEASUREMENT_COLUMNS, [
        28.125, 9.625, 32.375, 7.875, 0.125, 0.225, 0.175, 0.275,
        27.125, 10.125, 30.125, 8.125, 1500.125, 87,
    ]))
    for name, value in values.items():
        setattr(observation, name, value)
    sql_session.flush()
    result = _read(sql_session, observation, MEASUREMENT_COLUMNS)
    assert result == pytest.approx(values)


@pytest.mark.integration
def test_ml_view_calendar_spatial_and_source_identity_are_explicit(sql_session, sample_observations):
    observation = _first(sql_session, sample_observations, {
        'split': 'validation', 'terra_day_status': 'ACCEPTED',
        'season_sin': '0.017202', 'season_cos': '0.999852',
        'terra_day_night_delta_c': '19.26', 'aqua_day_night_delta_c': '',
        'terra_aqua_day_difference_c': '-4.74',
    })
    cell = sample_observations['cells'][0]
    result = _read(sql_session, observation, (
        'cell_id', 'grid_id', 'region_id', 'longitude', 'latitude',
        'observation_date', '[year]', '[month]', 'day_of_year', 'previous_month_reference',
        'source_row', 'row_hash', 'source_split', 'terra_day_status', 'aqua_night_status',
        'season_sin', 'season_cos', 'terra_day_night_delta_c',
        'aqua_day_night_delta_c', 'terra_aqua_day_difference_c',
    ))
    assert result['cell_id'] == cell.id
    assert result['grid_id'] == cell.grid_id
    assert result['region_id'] == cell.region_id
    assert result['longitude'] == cell.longitude
    assert result['latitude'] == cell.latitude
    assert result['observation_date'] == date(2021, 1, 1)
    assert (result['year'], result['month'], result['day_of_year']) == (2021, 1, 1)
    assert result['previous_month_reference'] == date(2020, 12, 1)
    assert result['source_row'] == observation.source_row
    assert result['row_hash'] == observation.row_hash
    assert result['source_split'] == 'validation'
    assert result['terra_day_status'] == 'ACCEPTED'
    assert result['aqua_night_status'] is None
    assert result['season_sin'] == pytest.approx(0.017202)
    assert result['season_cos'] == pytest.approx(0.999852)
    assert result['terra_day_night_delta_c'] == pytest.approx(19.26)
    assert result['aqua_day_night_delta_c'] is None
    assert result['terra_aqua_day_difference_c'] == pytest.approx(-4.74)


@pytest.mark.integration
@pytest.mark.parametrize('encoded,expected', [
    ('1.0', 1), ('0.0', 0), (1, 1), (0, 0), ('0.25', None),
    ('2', None), ('', None), ('true', None), (None, None),
])
def test_ml_view_normalizes_numeric_boolean_encodings_without_inventing_missing_flags(
    sql_session, sample_observations, encoded, expected,
):
    observation = _first(sql_session, sample_observations, {'aqua_day_valid': encoded})
    result = _read(sql_session, observation, ('aqua_day_valid', 'terra_day_valid'))
    assert result['aqua_day_valid'] == expected
    assert result['terra_day_valid'] is None
    assert observation.source_metadata['aqua_day_valid'] == encoded


@pytest.mark.integration
@pytest.mark.parametrize('encoded,expected', [
    ('0.0', 0), ('65.0', 65), ('', None), (' ', None), (None, None),
    ('65.25', None), ('256', None), ('-1', None), ('n/a', None),
])
def test_ml_view_qc_bytes_preserve_missing_instead_of_mapping_it_to_zero(
    sql_session, sample_observations, encoded, expected,
):
    observation = _first(sql_session, sample_observations, {'aqua_night_qc': encoded})
    assert _read(sql_session, observation, ('aqua_night_qc',))['aqua_night_qc'] == expected
    assert observation.source_metadata['aqua_night_qc'] == encoded


@pytest.mark.integration
def test_ml_view_masked_qc_is_null_and_mask_flag_is_one(sql_session, sample_observations):
    observation = _first(sql_session, sample_observations, {
        'terra_night_valid': '0.0', 'terra_night_qa_accepted': '0.0',
        'terra_night_qc': '', 'terra_night_qc_source_masked': '1.0',
    })
    observation.terra_lst_night_c = None
    sql_session.flush()
    result = _read(sql_session, observation, (
        'terra_night_valid', 'terra_night_qa_accepted',
        'terra_night_qc', 'terra_night_qc_source_masked',
    ))
    assert result == {
        'terra_night_valid': 0, 'terra_night_qa_accepted': 0,
        'terra_night_qc': None, 'terra_night_qc_source_masked': 1,
    }


@pytest.mark.integration
@pytest.mark.parametrize('built,pixels,reference', [(None, None, None), (0, 0, 2020), (125, 87, 2020)])
def test_ml_view_ghsl_reference_is_an_epoch_only_when_context_exists(
    sql_session, sample_observations, built, pixels, reference,
):
    observation = sample_observations['observations'][0]
    observation.ghsl_2020_built_surface_m2_sum = built
    observation.ghsl_2020_valid_pixel_count = pixels
    sql_session.flush()
    result = _read(sql_session, observation, ('ghsl_reference_year', 'ghsl_2020_built_surface_m2_sum'))
    assert result['ghsl_reference_year'] == reference
    assert result['ghsl_2020_built_surface_m2_sum'] == built


@pytest.mark.integration
def test_ml_view_rejects_dml_and_does_not_modify_the_base_observation(sql_session, sample_observations):
    observation = sample_observations['observations'][0]
    original = observation.terra_lst_day_c
    with pytest.raises(DBAPIError):
        with sql_session.begin_nested():
            sql_session.execute(text(
                'UPDATE dbo.ml_features_v1 SET terra_lst_day_c = 999 '
                'WHERE id = :id AND dataset_version_id = :version'
            ), {'id': observation.id, 'version': observation.dataset_version_id})
    value = sql_session.scalar(select(Observation.terra_lst_day_c).where(Observation.id == observation.id))
    assert value == original
