# Statistical methods and limits

The backend supports observed measurements, aggregate indicators, and descriptive statistics. It provides no trained model, prediction, tourism impact score, causal attribution, or invented tourism observation. Statistical services are independent of the frontend's existing mock-analysis utilities.

## Observation grain and aggregation

An observation is a source measurement at a cell and acquisition date. Region aggregates must identify their indicator, dataset version, spatial scope, dates, valid counts, and weighting. The pure statistical service consumes one consistently defined aggregate per calendar slot, in chronological order. Missing slots remain `null`; the service never interpolates or fills them. Every included time aggregate receives equal weight.

The spatial-fusion CSV attaches previous-completed-calendar-month NDVI, EVI, and monthly LST context to several eight-day records. Those repeats are not independent monthly observations. The repository must reduce them to one source month and spatial cell before temporal analysis. Their source month precedes the attached base observation's calendar month. The GHSL field is a 2020 built-surface snapshot attached to later records, so it cannot support an urban-development time trend. Land surface temperature is not air temperature.

The repository first averages nonmissing observations within each cell and source month, then averages those cell values with equal cell weight. A cell with more available eight-day source rows therefore receives no additional regional weight. All-null cell values remain missing and never become zero. For monthly context, a requested date interval includes the overlapping source calendar months: for example, 15–20 December 2020 selects December context attached to January 2021 source rows. Native eight-day LST uses the exact inclusive date interval instead, so a partial-month request can produce a partial-month mean. The optional `year` and date-range constraints intersect; `month` refers to the source month.

Each returned monthly point records `observed_cells` (cells with source rows in that month), `contributing_cells` (those with a nonmissing selected value), and `source_rows`. These are observed support counts, not an assertion that all expected spatial cells were sampled. Calendar months without source rows have a null value and zero observed support. An explicitly requested January–March interval contains three slots even if February has no data. A selected calendar-month filter changes the temporal denominator to those selected slots. Analysis windows are limited to 1,200 calendar months.

A monthly mean may exist despite incomplete spatial or eight-day coverage. The trend's missing-data ratio counts only empty monthly time slots; it must not be interpreted as the ratio of missing source measurements. Repeated monthly context must agree within each cell/source-month; conflicting nonmissing context values return HTTP 409 for a data quality review instead of being silently averaged.

## Trend calculation

`describe_trend(points, unit, percentage_meaningful=False)` accepts dictionaries containing ISO calendar `date` and finite numeric `value` or `null`. It sorts dates and rejects duplicate dates, invalid dates, infinities, NaN, and nonnumeric measurements. The caller must construct missing calendar slots and resolve spatial aggregation before invoking the service.

- Observation count is the number of nonmissing aggregate values, not the number of source pixels or rows.
- Start and end dates are the first and last nonmissing aggregate dates.
- Absolute change is the last observed aggregate minus the first observed aggregate. It is sensitive to endpoint variation and is separate from fitted slope.
- Missing-data ratio is missing supplied calendar slots divided by all supplied slots. It is `null` when no slots were supplied. It does not measure within-month spatial gaps or source QA rejection.
- Relative percentage change is calculated only after explicit ratio-scale opt-in and only when the baseline is positive. Celsius and vegetation/index units remain unavailable even after opt-in; percentage change for these units is not meaningful.
- Ordinary least squares fits observed values against elapsed days divided by 365.2425. The slope is in indicator units per year. Missing slots are omitted, without treating remaining points as evenly spaced.
- With at least three distinct, nonmissing dates, SciPy `linregress` supplies the two-sided Student-t test of zero slope. The 95% slope confidence interval is slope ± `t(0.975, n−2) × slope_standard_error`. Significance means unadjusted `p < 0.05`.
- An exactly constant series returns slope 0, p-value 1, confidence interval [0, 0], and no significance. Short series return explicit unavailable or insufficient-data states and null inferential quantities.

The confidence interval is calculated from an implemented statistical method; it is never a fixed percentage or visual padding around the slope. The backend does not claim Mann–Kendall, seasonal Mann–Kendall, Sen's slope, anomaly detection, or decomposition in this implementation.

## Interpretation

The ordinary-least-squares p-value and interval assume a linear relation with independent, approximately normal residuals of common variance. Environmental time series can have strong annual seasonality, serial correlation, heteroskedasticity, sampling bias, and changing spatial coverage. These assumptions are not tested or corrected here. Significance and intervals are therefore explicitly exploratory; they are not validated scientific evidence of a persistent trend. No multiple-comparison adjustment is applied. Raw data, actual missingness, scope, method, and warnings accompany results so a scientific team can reproduce and improve the analysis.

An environmental association does not establish causation. No statistical result establishes that vegetation, surface temperature, or built area caused tourism outcomes. Tourism data and a defensible future methodology would be needed to investigate that question.

## Period comparison

`compare_periods(points_a, points_b, unit, percentage_meaningful=False)` compares arithmetic means of the nonmissing supplied aggregates. Absolute change is mean B minus mean A. The same percentage restrictions apply. Each period includes its actual count, dates, missing-slot ratio, and mean. If either period contains no observed value, the comparison is unavailable.

No significance test is attached to the difference in means. Periods can have different spatial or seasonal coverage, and the caller must disclose their filters. An unmatched comparison cannot be interpreted as causal evidence.

The API rejects overlapping requested periods. For previous-month context, it also rejects periods that overlap in source calendar months, even if their day ranges are disjoint, because those requests would reuse the same whole-month measurement. Native eight-day measurements may be compared over disjoint partial-month intervals, with their actual counts and date scope disclosed. Both periods use the dataset version selected for the first aggregate; a partially imported version can still gain rows between statements and is marked incomplete.

## Reproducibility and tests

Unit tests verify a known slope using irregular elapsed calendar dates, confidence bounds, missing slots, constant and short series, invalid inputs, duplicate-date rejection, percentage restrictions, unequal missingness in comparisons, and nonmutation of inputs. The API's persisted execution metadata identifies dataset versions and request filters; data provenance and scientific source limitations remain part of interpretation.

Primary statistical API reference: [SciPy `linregress`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.linregress.html) and [SciPy Student-t distribution](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.t.html).
