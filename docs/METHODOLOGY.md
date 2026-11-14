# Scientific Methodology

Scope: what this application computes, exactly, and what it refuses to claim.

## Monthly aggregation

`backend/app/repositories.py` — `monthly_statement`:

1. Filter observations to the certified version and the user's window (dates, year/month, cell/region/bounds).
2. Aggregate **within each cell and month first** (mean of source values): repeated monthly/snapshot context attached to several 8-day rows is reduced to one value per cell-month, so cells with denser eight-day coverage gain no extra weight.
3. Aggregate across cells to one value per month: mean of per-cell values, with `observed_cells`, `contributing_cells` and raw `source_rows` reported separately.
4. Calendar months inside the window with no observations are **present as null points**; `total_slots` and `missing_data_ratio` quantify support.
5. For `previous_month` indicators, conflicting repeated-context values abort with HTTP 409 instead of averaging silently.

## Descriptive OLS

`backend/app/services/analytics.py` — `describe_trend`:

- Regresses monthly values against **elapsed years** (time as fractional years, not row index).
- Reports `slope_per_year`, p-value, and a Student-t confidence interval **only where estimable** (≥ 3 non-missing distinct dates and variance > 0). Unsupported statistics remain `null` — never approximated.
- `significant` reflects the configured alpha (0.05) and is labelled exploratory.
- `percentage_change` is suppressed (null) for interval/ratio-unit indicators (degC, index values) where a percentage is not meaningful; it is meaningful only for m²/pixel counts.
- `method: ordinary_least_squares_elapsed_years`; the response's `methodology` string states that this is a historical aggregate, not a model prediction.

## Period comparison

Two disjoint historical periods, same pinned certified version. Reports period means, absolute change and — only for m²/pixel indicators — percentage change. **No p-value**: a two-mean comparison without distributional assumptions is descriptive. Calendar-month overlap checks protect repeated-context indicators from double counting.

## Missing data

- Missing measurements are `null` in storage, in SQL results and in JSON.
- No zero-filling, no interpolation, no imputation anywhere in the analysis path.
- QA-failed values remain distinguishable from unobserved values via `source_metadata` status strings.

## Explicit limits (surfaced in every analysis response)

1. LST is land surface temperature, not ambient air temperature.
2. NDVI/EVI are vegetation indices, not tree counts.
3. OLS significance is exploratory: seasonality, serial correlation, multiple testing and changing spatial support are not corrected.
4. A slope is history, not a forecast; it does not establish causality.
5. GHSL 2020 is one snapshot; it cannot support a time trend (HTTP 422 by design).
6. Tourism revenue, hotel occupancy, arrivals and ambient air temperature have no verified observations; they are never estimated from proxies.
7. If/when a model integration is enabled, its outputs are labelled as model output — never as observed measurements.

## Reproducibility

- Aggregation is defined in SQL (single statement, deterministic ordering by date/cell).
- Statistics are computed from the returned monthly series with SciPy; the same series the API publishes is the series the statistics are computed from.
- The dataset version pin (sha256 + certificate) makes any historical result re-derivable.

## Tests protecting these rules

- `backend/tests/test_analytics.py`, `test_monthly_repository.py`, `test_compare_boundaries.py` — aggregation shapes, boundary semantics, unsupported-statistic nulls.
- `backend/tests/test_read_only_analysis.py`, `test_response_contract.py` — contract and null preservation.
- `tests/environment-schemas.test.ts`, `tests/api-client.test.ts` (frontend) — response schemas reject zero-filled or rescaled payloads.
