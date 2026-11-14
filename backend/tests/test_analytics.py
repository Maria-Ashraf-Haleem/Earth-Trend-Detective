from datetime import date, timedelta

import pytest

from app.services.analytics import DAYS_PER_YEAR, compare_periods, describe_trend


def series(values, start=date(2020, 1, 1), step_days=90):
    return [
        {"date": (start + timedelta(days=index * step_days)).isoformat(), "value": value}
        for index, value in enumerate(values)
    ]


def test_elapsed_calendar_time_slope_and_confidence_interval():
    origin = date(2020, 1, 1)
    days = [0, 29, 61, 150, 366]
    points = [
        {"date": (origin + timedelta(days=day)).isoformat(), "value": 20 + 2.5 * day / DAYS_PER_YEAR}
        for day in days
    ]
    result = describe_trend(list(reversed(points)), unit="°C")
    assert result["availability"] == "available"
    assert result["slope_per_year"] == pytest.approx(2.5)
    assert result["confidence_interval"] == pytest.approx([2.5, 2.5])
    assert result["significant"] is True
    assert result["observation_count"] == 5
    assert result["start_date"] == "2020-01-01"
    assert result["end_date"] == "2021-01-01"


def test_nonzero_student_t_confidence_interval_uses_residual_variation():
    # Residuals [1, -2, 2, -2, 1] have zero sum and zero covariance with
    # x=[0,1,2,3,4]. SSE=14; Sxx=10; df=3; t(.975,3)=3.182446305.
    result = describe_trend(series([6, 5, 11, 9, 14], step_days=365), "°C")
    expected_slope = 2 * DAYS_PER_YEAR / 365
    expected_margin = 3.1824463052837078 * (14 / 30) ** 0.5 * DAYS_PER_YEAR / 365
    assert result["slope_per_year"] == pytest.approx(expected_slope)
    assert result["confidence_interval"] == pytest.approx(
        [expected_slope - expected_margin, expected_slope + expected_margin]
    )


def test_missing_slots_omitted_without_imputation():
    result = describe_trend(series([1, None, 3, 4]), unit="index")
    assert result["observation_count"] == 3
    assert result["total_slots"] == 4
    assert result["missing_data_ratio"] == 0.25
    assert result["absolute_change"] == 3
    assert result["slope_per_year"] == pytest.approx(DAYS_PER_YEAR / 90)


@pytest.mark.parametrize("unit", ["°C", "Celsius", "index", "NDVI", "EVI", "1"])
def test_temperature_and_index_percentage_changes_unavailable(unit):
    result = describe_trend(series([10, 20, 30]), unit, percentage_meaningful=True)
    assert result["percentage_change"] is None


def test_percentage_requires_explicit_ratio_scale_and_positive_baseline():
    assert describe_trend(series([10, 15, 20]), "m²")["percentage_change"] is None
    assert describe_trend(series([10, 15, 20]), "m²", True)["percentage_change"] == 100
    assert describe_trend(series([0, 15, 20]), "m²", True)["percentage_change"] is None
    assert describe_trend(series([-5, 15, 20]), "m²", True)["percentage_change"] is None


def test_constant_series_has_explicit_non_significant_result():
    result = describe_trend(series([4, 4, 4, 4]), "°C")
    assert result["slope_per_year"] == 0
    assert result["p_value"] == 1
    assert result["confidence_interval"] == [0, 0]
    assert result["significant"] is False


@pytest.mark.parametrize("values", [[], [None, None], [2], [2, 3]])
def test_short_series_never_invents_inference(values):
    result = describe_trend(series(values), "°C")
    assert result["availability"] != "available"
    assert result["slope_per_year"] is None
    assert result["p_value"] is None
    assert result["significant"] is None
    assert result["confidence_interval"] is None


def test_empty_series_has_no_assumed_missing_denominator():
    assert describe_trend([], "°C")["missing_data_ratio"] is None
    assert describe_trend(series([None, None]), "°C")["missing_data_ratio"] == 1


@pytest.mark.parametrize("value", [float("nan"), float("inf"), float("-inf"), "3", True])
def test_invalid_values_are_rejected(value):
    with pytest.raises(ValueError, match="finite"):
        describe_trend(series([1, value, 3]), "°C")


def test_duplicate_dates_rejected_to_prevent_pseudoreplication():
    with pytest.raises(ValueError, match="distinct"):
        describe_trend([{"date": "2020-01-01", "value": 1}] * 3, "°C")


@pytest.mark.parametrize("date_value", ["2020-02-30", "invalid", "2020-01-01T12:00:00", None])
def test_invalid_calendar_dates_rejected(date_value):
    with pytest.raises(ValueError, match="calendar"):
        describe_trend([{"date": date_value, "value": 1}], "°C")


def test_period_comparison_uses_nonmissing_equal_weight_means():
    result = compare_periods(series([10, None, 20]), series([20, 30, 40]), "m²", True)
    assert result["period_a"]["mean"] == 15
    assert result["period_a"]["observation_count"] == 2
    assert result["period_b"]["mean"] == 30
    assert result["absolute_change"] == 15
    assert result["percentage_change"] == 100
    assert result["p_value"] is None
    assert result["significant"] is None


def test_missing_period_returns_explicit_unavailable():
    result = compare_periods(series([None]), series([2]), "°C")
    assert result["availability"] == "unavailable"
    assert result["absolute_change"] is None
    assert result["percentage_change"] is None


def test_temperature_period_change_is_absolute_only():
    result = compare_periods(series([10]), series([20]), "°C", True)
    assert result["absolute_change"] == 10
    assert result["percentage_change"] is None


def test_inputs_are_not_mutated():
    points = series([3, None, 1])
    snapshot = [point.copy() for point in points]
    describe_trend(points, "°C")
    assert points == snapshot
