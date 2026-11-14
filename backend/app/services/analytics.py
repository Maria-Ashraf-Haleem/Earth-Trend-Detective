"""Descriptive analyses of observed series; no prediction or causal inference.

The caller supplies one equally defined regional aggregate per calendar slot,
including explicit ``None`` values for missing slots.  This module never fills
gaps or treats repeated spatial-fusion context as independent observations.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date
import math
from numbers import Real
from statistics import fmean
from typing import Any

from scipy import stats


DAYS_PER_YEAR = 365.2425
ALPHA = 0.05
METHOD = "ordinary_least_squares_elapsed_years"
METHODOLOGY = (
    "Ordinary least squares on observed aggregate values versus elapsed calendar "
    "days / 365.2425. The two-sided slope t-test and 95% Student-t confidence "
    "interval assume a linear relation with independent, approximately normal "
    "residuals of common variance. No seasonal "
    "or serial-correlation adjustment is applied. Missing slots are omitted "
    "without imputation. Absolute change compares the first and last observed "
    "aggregate, not a model prediction."
)
WARNINGS = [
    "Significance and confidence intervals are exploratory: seasonality and "
    "autocorrelation can invalidate the independent-residual assumption.",
    "A descriptive environmental trend does not establish causation or tourism impact.",
    "Missing-data ratio concerns the supplied time slots; it is not spatial "
    "coverage or a source quality score.",
]


def _parse_points(
    points: Sequence[Mapping[str, Any]],
) -> list[tuple[date, float | None]]:
    parsed: list[tuple[date, float | None]] = []
    seen: set[date] = set()
    for point in points:
        if not isinstance(point, Mapping) or "date" not in point or "value" not in point:
            raise ValueError("Each observation requires date and value fields")
        supplied_date = point["date"]
        if isinstance(supplied_date, str):
            try:
                parsed_date = date.fromisoformat(supplied_date)
            except ValueError as exc:
                raise ValueError("Observation dates must be ISO calendar dates") from exc
        elif type(supplied_date) is date:
            parsed_date = supplied_date
        else:
            raise ValueError("Observation dates must be ISO calendar dates")
        if parsed_date in seen:
            raise ValueError("Aggregate observations must have distinct calendar dates")
        seen.add(parsed_date)
        supplied_value = point["value"]
        if supplied_value is None:
            value = None
        elif (
            isinstance(supplied_value, Real)
            and not isinstance(supplied_value, bool)
            and math.isfinite(supplied_value)
        ):
            value = float(supplied_value)
        else:
            raise ValueError("Observation values must be finite numbers or null")
        parsed.append((parsed_date, value))
    return sorted(parsed, key=lambda point: point[0])


def _allows_percentage(unit: str, requested: bool) -> bool:
    # Relative changes in Celsius and vegetation indices have no ratio-scale
    # interpretation. The explicit opt-in is reserved for verified ratio units.
    normalized_unit = unit.strip().casefold().replace(" ", "")
    excluded = {
        "c", "°c", "degc", "celsius", "degreescelsius", "ndvi", "evi",
        "index", "unitless", "dimensionless", "1",
    }
    return requested and normalized_unit not in excluded


def _percentage(change: float | None, baseline: float | None, allowed: bool) -> float | None:
    if not allowed or change is None or baseline is None or baseline <= 0:
        return None
    result = change / baseline * 100.0
    return result if math.isfinite(result) else None


def _summary(points: list[tuple[date, float | None]]) -> dict[str, Any]:
    valid = [(day, value) for day, value in points if value is not None]
    return {
        "observation_count": len(valid),
        "total_slots": len(points),
        "missing_data_ratio": (len(points) - len(valid)) / len(points) if points else None,
        "start_date": valid[0][0].isoformat() if valid else None,
        "end_date": valid[-1][0].isoformat() if valid else None,
        "mean": fmean(value for _, value in valid) if valid else None,
    }


def describe_trend(
    points: Sequence[Mapping[str, Any]],
    unit: str,
    percentage_meaningful: bool = False,
) -> dict[str, Any]:
    """Describe an observed calendar series using OLS, with explicit limitations.

    At least three nonmissing distinct dates are required for inference. Empty
    or short series return null inferential quantities rather than invented
    values. Dates may arrive unordered; duplicates and nonfinite values fail
    validation because they can otherwise silently bias a trend.
    """
    parsed = _parse_points(points)
    valid = [(day, value) for day, value in parsed if value is not None]
    summary = _summary(parsed)
    count = len(valid)
    change = valid[-1][1] - valid[0][1] if count >= 2 else None
    result: dict[str, Any] = {
        **summary,
        "availability": "unavailable" if count == 0 else "insufficient_data",
        "unit": unit,
        "absolute_change": change,
        "percentage_change": _percentage(
            change,
            valid[0][1] if valid else None,
            _allows_percentage(unit, percentage_meaningful),
        ),
        "slope_per_year": None,
        "p_value": None,
        "significant": None,
        "confidence_interval": None,
        "confidence_level": 1 - ALPHA,
        "alpha": ALPHA,
        "method": METHOD,
        "methodology": METHODOLOGY,
        "warnings": list(WARNINGS),
    }
    if count < 3:
        result["warnings"].append(
            "At least three nonmissing distinct calendar dates are required for a trend test."
        )
        return result

    origin = valid[0][0]
    elapsed_years = [(day - origin).days / DAYS_PER_YEAR for day, _ in valid]
    values = [value for _, value in valid]
    if min(values) == max(values):
        # linregress may return NaN for an exactly constant response.
        slope, p_value, interval = 0.0, 1.0, [0.0, 0.0]
    else:
        fitted = stats.linregress(elapsed_years, values)
        slope = float(fitted.slope)
        p_value = float(fitted.pvalue)
        margin = float(stats.t.ppf(1 - ALPHA / 2, count - 2) * fitted.stderr)
        interval = [slope - margin, slope + margin]
        if not all(math.isfinite(value) for value in [slope, p_value, *interval]):
            result["warnings"].append("Numerical inference was unavailable for this series.")
            return result
    result.update(
        availability="available",
        slope_per_year=slope,
        p_value=p_value,
        significant=p_value < ALPHA,
        confidence_interval=interval,
    )
    return result


def compare_periods(
    points_a: Sequence[Mapping[str, Any]],
    points_b: Sequence[Mapping[str, Any]],
    unit: str,
    percentage_meaningful: bool = False,
) -> dict[str, Any]:
    """Compare means of supplied aggregates without unsupported inference.

    Each nonmissing supplied aggregate receives equal weight. Calendar or
    spatial matching is the repository's responsibility and must be reported by
    the caller. This function never adds a p-value to unmatched period means.
    """
    summary_a = _summary(_parse_points(points_a))
    summary_b = _summary(_parse_points(points_b))
    available = summary_a["mean"] is not None and summary_b["mean"] is not None
    change = summary_b["mean"] - summary_a["mean"] if available else None
    return {
        "availability": "available" if available else "unavailable",
        "unit": unit,
        "period_a": summary_a,
        "period_b": summary_b,
        "absolute_change": change,
        "percentage_change": _percentage(
            change, summary_a["mean"], _allows_percentage(unit, percentage_meaningful)
        ),
        "p_value": None,
        "significant": None,
        "method": "difference_of_observed_period_means",
        "methodology": (
            "Arithmetic mean of nonmissing supplied aggregates in each period; "
            "period B minus period A. All included aggregates receive equal "
            "weight. No significance test, imputation, causal attribution, "
            "seasonal adjustment, or prediction is performed."
        ),
        "warnings": [
            "Different seasonal or spatial coverage can bias a period comparison.",
            "An environmental difference does not establish causation or tourism impact.",
        ],
    }
