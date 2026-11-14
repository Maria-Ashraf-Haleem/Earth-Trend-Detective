from datetime import date
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import mssql

from app.models import DatasetVersion, Indicator, utcnow
from app.repositories import monthly_series, monthly_statement
from app.schemas import Filters
from app.services.ingestion.validation import VALIDATION_POLICY_VERSION


def indicator(support='previous_month'):
    return SimpleNamespace(
        id='terra_ndvi_spatial_prev_month' if support == 'previous_month' else 'terra_lst_day_c',
        temporal_support=support,
        source_id='terra',
    )


def compile_sql(filters, support='previous_month'):
    statement = monthly_statement(filters, 7, indicator(support))
    return str(statement.compile(dialect=mssql.dialect(), compile_kwargs={'literal_binds': True}))


def test_previous_december_uses_next_january_attachment_bounds():
    sql = compile_sql(Filters(start_date=date(2020, 12, 15), end_date=date(2020, 12, 20)))
    assert "observations.observed_on >= '2021-01-01'" in sql
    assert "observations.observed_on < '2021-02-01'" in sql
    assert 'DATEPART(year, dateadd(month, -1, datefromparts' in sql


def test_sql_server_grouping_date_constants_are_never_bound_parameters():
    compiled = monthly_statement(Filters(), 7, indicator()).compile(dialect=mssql.dialect())
    assert 'dateadd(month, -1, datefromparts' in str(compiled)
    assert ', 1))' in str(compiled)
    assert not any(name.startswith(('dateadd', 'datefromparts')) for name in compiled.params)


def test_previous_month_year_filter_includes_next_year_january():
    sql = compile_sql(Filters(year=2020, month=12))
    assert "observations.observed_on >= '2020-02-01'" in sql
    assert "observations.observed_on < '2021-02-01'" in sql
    assert 'DATEPART(month, observations.observed_on) = 1' in sql


def test_native_dates_keep_exact_date_bounds_and_intersect_year():
    sql = compile_sql(Filters(start_date=date(2019, 12, 15), end_date=date(2020, 3, 17), year=2020), '8_day')
    assert "observations.observed_on >= '2020-01-01'" in sql
    assert "observations.observed_on <= '2020-03-17'" in sql
    assert 'dateadd' not in sql


def test_aggregation_is_nested_by_cell_and_never_filters_missing_indicator():
    sql = compile_sql(Filters(data_source='terra'))
    assert 'avg(observations.terra_ndvi_spatial_prev_month)' in sql
    assert 'avg(anon_1.value)' in sql
    assert 'GROUP BY DATEPART' in sql
    assert 'observations.cell_id' in sql
    assert 'IS NOT NULL' not in sql
    assert 'SELECT *' not in sql


def test_more_than_1200_month_slots_fails_before_query():
    with pytest.raises(HTTPException) as error:
        compile_sql(Filters(start_date=date(1900, 1, 1), end_date=date(2000, 1, 1)))
    assert error.value.status_code == 422


class StubSession:
    """Unit-test calendar filling only; all actual SQL tests use SQL Server."""

    def __init__(self, rows, record=None):
        self.rows = rows
        self.record = record or indicator()

    def get(self, model, key):
        if model is Indicator:
            return self.record
        if model is DatasetVersion:
            return SimpleNamespace(id=key, validated_at=utcnow(), validation_json={
                'reconciled': True, 'validation_policy': VALIDATION_POLICY_VERSION})
        raise AssertionError('Unexpected model')

    def execute(self, statement):
        return SimpleNamespace(all=lambda: self.rows)


def test_missing_calendar_slots_and_spatial_support_are_explicit():
    session = StubSession([(2020, 1, 0.2, 5, 3, 20, 0), (2020, 3, None, 4, 0, 16, 0)])
    points, _, version = monthly_series(session, Filters(
        indicator='terra_ndvi_spatial_prev_month', dataset_version_id=7,
        start_date=date(2020, 1, 15), end_date=date(2020, 3, 20),
    ))
    assert version == 7
    assert [point['date'] for point in points] == ['2020-01-01', '2020-02-01', '2020-03-01']
    assert points[0]['value'] == 0.2
    assert points[0]['contributing_cells'] == 3
    assert points[0]['observed_cells'] == 5
    assert points[1] == {
        'date': '2020-02-01', 'value': None, 'observed_cells': 0, 'contributing_cells': 0, 'source_rows': 0,
    }
    assert points[2]['value'] is None
    assert points[2]['observed_cells'] == 4


def test_selected_calendar_month_is_the_missing_slot_denominator():
    points, _, _ = monthly_series(StubSession([]), Filters(
        indicator='terra_ndvi_spatial_prev_month', dataset_version_id=7,
        start_date=date(2019, 1, 1), end_date=date(2021, 12, 31), month=12,
    ))
    assert [point['date'] for point in points] == ['2019-12-01', '2020-12-01', '2021-12-01']
    assert all(point['value'] is None for point in points)


def test_native_final_calendar_month_is_emitted_without_overflowing_after_the_last_slot():
    points, _, _ = monthly_series(StubSession([], indicator('8_day')), Filters(
        indicator='terra_lst_day_c', dataset_version_id=7,
        start_date=date(9999, 11, 15), end_date=date(9999, 12, 31),
    ))
    assert [point['date'] for point in points] == ['9999-11-01', '9999-12-01']
    assert all(point['value'] is None and point['source_rows'] == 0 for point in points)


def test_snapshot_trend_is_rejected_before_query():
    with pytest.raises(HTTPException) as error:
        monthly_series(StubSession([], indicator('snapshot_2020')), Filters(
            indicator='ghsl_2020_built_surface_m2_sum', dataset_version_id=7,
        ))
    assert error.value.status_code == 422


def test_conflicting_monthly_context_returns_data_quality_error():
    with pytest.raises(HTTPException) as error:
        monthly_series(StubSession([(2020, 1, 0.2, 2, 2, 8, 1)]), Filters(
            indicator='terra_ndvi_spatial_prev_month', dataset_version_id=7,
        ))
    assert error.value.status_code == 409


@pytest.mark.integration
def test_sql_server_native_months_receive_equal_cell_weight(sql_session, sample_observations):
    sample = sample_observations
    points, _, _ = monthly_series(sql_session, Filters(
        region_id=sample['region'].id,
        dataset_version_id=sample['version'].id,
        indicator='terra_lst_day_c',
        start_date=date(2021, 1, 1), end_date=date(2021, 4, 30),
    ))
    # Cell A's mean=(10+30)/2=20, cell B's mean=50 => 35. A raw-row
    # regional mean would be 30 and would overweight cell A.
    assert points[0]['value'] == pytest.approx(35)
    assert points[0]['observed_cells'] == 2
    assert points[0]['contributing_cells'] == 2
    assert points[0]['source_rows'] == 3
    assert points[1]['value'] is None
    assert points[1]['source_rows'] == 0


@pytest.mark.integration
def test_sql_server_lagged_context_is_deduplicated_and_uses_source_month(sql_session, sample_observations):
    sample = sample_observations
    points, _, _ = monthly_series(sql_session, Filters(
        region_id=sample['region'].id,
        dataset_version_id=sample['version'].id,
        indicator='terra_ndvi_spatial_prev_month',
        start_date=date(2020, 12, 15), end_date=date(2021, 3, 20),
    ))
    assert [point['date'] for point in points] == [
        '2020-12-01', '2021-01-01', '2021-02-01', '2021-03-01',
    ]
    # December values attached to January records: A=.1 repeated twice,
    # B=.3 once. Equal cell weighting must yield .2, not .16666...
    assert points[0]['value'] == pytest.approx(0.2)
    assert points[0]['contributing_cells'] == 2
    assert points[1]['value'] is None
    assert points[2]['value'] == pytest.approx(0.2)
    assert points[3]['value'] is None
    assert points[3]['observed_cells'] == 1
    assert points[3]['contributing_cells'] == 0


@pytest.mark.integration
def test_sql_server_conflicting_repeated_context_is_rejected(sql_session, sample_observations):
    sample = sample_observations
    # Alter only this rollback fixture's second attachment of the same source
    # month/cell. Such a conflict cannot be interpreted as independent data.
    sample['observations'][1].terra_ndvi_spatial_prev_month = 0.9
    sql_session.flush()
    with pytest.raises(HTTPException) as error:
        monthly_series(sql_session, Filters(
            region_id=sample['region'].id,
            dataset_version_id=sample['version'].id,
            indicator='terra_ndvi_spatial_prev_month',
            start_date=date(2020, 12, 1), end_date=date(2020, 12, 31),
        ))
    assert error.value.status_code == 409
