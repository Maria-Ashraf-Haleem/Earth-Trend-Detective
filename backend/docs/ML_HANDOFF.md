# ML specialist handoff

This handoff describes observed environmental data and the backend interface that
prepares it. No model has been trained, no prediction service exists, and no
tourism label or causal effect has been generated. The existing frontend's local
mock results are not a source of training data or evaluation evidence.
Read [the backend handoff](BACKEND_HANDOFF_README.md) for the current
workspace state and operating boundaries before continuing this handoff.

## Release evidence and authoritative locations

Use a reconciled, explicitly pinned dataset version. A job reaching EOF is not
enough: historical imports can contain quarantined records, and a later recovery
can add observations to the same content version. The final release evidence is:

- `docs/SOURCE_PROFILE.json`: a streaming validation/profile of the actual source.
- `docs/INGESTION_VALIDATION.json`: independent SQL/source reconciliation and
  measured feature coverage.
- `docs/CLEAN_DATASET_MANIFEST.json`: a future clean export's schema, selected
  version, row count, hashes and precision policy; this file does not currently exist.
- `docs/FINAL_REPORT.md`: applied migrations, executed checks and remaining limits.

The source profile and SQL reconciliation exist and agree for certified version
`6`: 7,317,772 observations, 7,231 cells, and zero unresolved quarantine records.
SQL feature retrieval is verified. The large clean CSV and its manifest have
**not been generated**; they are optional delivery artifacts, not prerequisites
for using the certified SQL view. An export delivery must have a verified
manifest before it can be called complete. Failed reconciliation, unresolved
conflicts, or pending recovery prevent publication.

| Layer | Location and purpose |
| --- | --- |
| Immutable raw landing source | `C:\Users\abdel\Downloads\Earth Trend\EarthTrend_Unified\spatial_fusion_v2_fixed\earthtrend_spatial_fusion_v2.csv` |
| Upstream provenance | `spatial_fusion_audit.json` beside that CSV; backend retains its original private content in `dataset_versions.audit_json` |
| Validated query layer | SQL Server `localhost`, database `earthtrend_db`, read-only view `dbo.ml_features_v1` and underlying tables `dbo.observations`, `dbo.spatial_cells`, `dbo.dataset_versions`, and `dbo.indicators` |
| Clean lexical export | `C:\Users\abdel\Downloads\Backend\backend\artifacts\private\earthtrend_validated_v1.csv` after a successful `export-clean` command |
| Local export manifest | The clean CSV path followed by `.manifest.json` |
| Public handoff manifest | `backend/docs/CLEAN_DATASET_MANIFEST.json`, containing a safe basename rather than an internal filesystem path |

The inspected source content SHA256 is
`13bc7b3f72aafa247ac0dfab869c9662fa2a2277e7e06d6bb3db4b6dcdbfe44a`.
Its registered version ID in this workspace is `6`; IDs can differ in another
installation. Resolve the expected hash to a version there, and record both.
The upstream audit reports 7,317,772 source records and 7,231 cells for 2003-2024.
Use the final reconciliation artifacts for independently verified counts and
availability, rather than treating those upstream totals as backend QA results.

The following are operator reference commands for a future release/export.
They were not rerun in this verification session. Do not run them merely to
resume this handoff; no duplicate large export is authorized or necessary.
From PowerShell inside `C:\Users\abdel\Downloads\Backend\backend`:

```powershell
.\.venv\Scripts\python.exe -m app.cli validate-dataset --version-id 6
.\.venv\Scripts\python.exe -m app.cli export-clean --version-id 6 --output artifacts/private/earthtrend_validated_v1.csv
```

The clean export must follow successful validation. It selects validated SQL
observation membership and preserves the source CSV's original string values and
column order. It does not overwrite the raw file. The current certification
requires every source record to be valid and represented exactly once; verified
full ordinal coverage then permits a byte-preserving copy to a new file. Releases
with intentional source exclusions are refused until a separate certified policy
defines that membership. There is no approximate SQL-float-to-CSV fallback.
The resulting manifest records the actual export policy. Large CSVs and private
manifests stay outside Git.

## Observation identity and precision

The measurement grain is one reference cell and original eight-day acquisition
date within a content version. The business key is
`(dataset_version_id, cell_id, observed_on)`. Preserve `grid_id` as the stable source
spatial identifier; SQL identity keys and observation IDs are installation-local.

Each accepted observation retains its one-based `source_row` CSV record ordinal
and canonical source `row_hash`. A CSV record can span physical lines, so this is
not a text line number. Whole-file SHA256 identifies immutable source bytes. Exact
duplicates are excluded from another insert; conflicting records at the same
business key are quarantined rather than replacing accepted values. Retries are
additional audited attempts, not additional independent environmental samples.

The SQL query layer uses nullable `FLOAT(53)` for measurements and coordinates.
These are IEEE 754 double-precision approximations, not arbitrary-precision
decimal storage. No backend scaling, rounding, clipping, interpolation or
unit conversion is applied to those measurement values. Exact original decimal
lexemes, trailing zeros and source types remain recoverable from the fingerprinted
raw source and lexical clean export. Use `csv.DictReader` and `decimal.Decimal`
when exact decimal arithmetic is required; importing CSV values directly as
binary floats is a downstream choice. Do not describe SQL FLOAT as exact decimal
preservation.

Blank measurement strings represent missing observations and become SQL NULL.
Zero remains a valid value, including GHSL built surface. Quality flags and QC
values retain their original strings in `source_metadata`; numeric encodings
such as `1.0`, `0.0` and `65.0` are validated by their exact integral value,
without truncating fractions or rewriting the retained strings. A blank QC is
not converted to QC zero. Read validation policy and quarantine history alongside
the final data; earlier parser-policy failures are retained as historical attempts.

## Available measurement features

All fourteen source columns below use scale factor **1** in this backend. LST
values are already degrees Celsius; applying the frontend demo's raw-DN factor
`0.02` would corrupt them. The fusion table does not establish an additional
validity policy for every lagged feature; nonmissing coverage is not a confidence
score or an independent QA reprocessing result.

| Source column | Unit | Temporal and spatial support |
| --- | --- | --- |
| `terra_lst_day_c` | degC | Original Terra daytime eight-day LST; native reference cell |
| `terra_lst_night_c` | degC | Original Terra nighttime eight-day LST; native reference cell |
| `aqua_lst_day_c` | degC | Original Aqua daytime eight-day LST; native reference cell |
| `aqua_lst_night_c` | degC | Original Aqua nighttime eight-day LST; native reference cell |
| `terra_ndvi_spatial_prev_month` | index | Terra VI source records grouped by prior source `period_end` month and reference cell |
| `terra_evi_spatial_prev_month` | index | Same source-month/cell construction for Terra EVI |
| `aqua_ndvi_spatial_prev_month` | index | Same source-month/cell construction for Aqua NDVI |
| `aqua_evi_spatial_prev_month` | index | Same source-month/cell construction for Aqua EVI |
| `terra_monthly_day_spatial_prev_month` | degC | Prior completed source month; coarse 0.05-degree bin mapped to reference cells |
| `terra_monthly_night_spatial_prev_month` | degC | Same coarse-bin construction for Terra nighttime monthly LST |
| `aqua_monthly_day_spatial_prev_month` | degC | Same coarse-bin construction for Aqua daytime monthly LST |
| `aqua_monthly_night_spatial_prev_month` | degC | Same coarse-bin construction for Aqua nighttime monthly LST |
| `ghsl_2020_built_surface_m2_sum` | m2 | Sum of valid GHSL 2020 source-pixel values assigned to a reference cell; attached only in 2021+ rows |
| `ghsl_2020_valid_pixel_count` | pixels | Count of source pixels contributing to that cell's single GHSL snapshot |

The upstream base model-v2 audit identifies MOD11A2/MYD11A2 LST and an original
native MODIS grid with no resampling in that stage. The spatial-fusion builder's
reference grid spacing is `926.6254331` metres in its MODIS sinusoidal projection,
commonly described as nominal 1 km. The fusion CSV supplies geographic centroids,
not surveyed cell polygons. The original VI product resolution and granule release
times must be checked against original source metadata before making finer-scale
or operational-availability claims. The monthly 0.05-degree bin is not a fixed
metric cell area and can be shared by several reference cells.

There is no verified air-temperature feature, tourism occupancy/arrivals target,
historical built-surface sequence or hotel-level observation in this source.
`tourism_observations` is an empty future integration structure. Surface
temperature must not be relabeled as air temperature; GHSL 2020 must not be
interpreted as a time series of urban development.

## Complete source CSV schema

The raw and lexical clean files have these 43 fields in source order. The
fourteen measurement columns are typed query columns; the other flags, statuses,
derived values and split are retained as provenance rather than silently
recalculated. Year, month and day-of-year are checked against `observation_date`.

```text
grid_id
longitude
latitude
observation_date
year
month
day_of_year
season_sin
season_cos
terra_lst_day_c
terra_lst_night_c
terra_day_valid
terra_night_valid
terra_day_qa_accepted
terra_night_qa_accepted
terra_day_status
terra_night_status
aqua_lst_day_c
aqua_lst_night_c
aqua_day_valid
aqua_night_valid
aqua_day_qa_accepted
aqua_night_qa_accepted
aqua_day_status
aqua_night_status
terra_day_night_delta_c
aqua_day_night_delta_c
terra_aqua_day_difference_c
split
terra_night_qc
terra_night_qc_source_masked
aqua_night_qc
aqua_night_qc_source_masked
terra_ndvi_spatial_prev_month
terra_evi_spatial_prev_month
aqua_ndvi_spatial_prev_month
aqua_evi_spatial_prev_month
terra_monthly_day_spatial_prev_month
terra_monthly_night_spatial_prev_month
aqua_monthly_day_spatial_prev_month
aqua_monthly_night_spatial_prev_month
ghsl_2020_built_surface_m2_sum
ghsl_2020_valid_pixel_count
```

## Upstream joins, cleaning and aggregation

The backend imports an existing fusion product; it does not rerun the upstream
satellite processing or claim that its source QA has been independently validated.
The inspected upstream builder performs these operations:

1. It maps source geographic centroids into the MODIS sinusoidal reference grid.
   This is centroid assignment, not area-weighted polygon overlap. Its documented
   Terra-2003 grid-offset treatment uses geographic coordinates; the backend
   preserves that output rather than silently changing coordinates.
2. For VI, it accepts values according to upstream valid flags, groups source
   pixel/record contributions by reference grid and `period_end` calendar month,
   and computes sums divided by valid counts. That source month becomes available
   to the following calendar-month join key. NDVI and EVI are averaged separately.
3. Monthly LST source values are grouped by the coarser 0.05-degree geographic
   bins and source month, then mapped to the reference cells in that bin. The
   resulting monthly feature repeats across that cell's eight-day rows in the
   following attachment month.
4. GHSL invalid/nodata and negative source values are excluded upstream. Valid
   built-surface values are summed by reference cell and valid pixels counted.
   The 2020 snapshot is attached only to records whose calendar year is at least
   2021. No earlier epoch is reconstructed and no missing value is imputed.
5. The backend checks CSV schema, finite numerics, coordinates, date/calendar
   consistency, flag/QC semantics and business-key conflicts. It preserves source
   derived deltas, seasonal encodings and split values rather than repairing or
   estimating them. These structural checks are not independent scientific QA.

For monthly descriptive analyses, the backend first averages nonmissing native
observations inside each cell/source-month, then averages those cell values with
equal cell weight. It collapses repeated lagged context to its source month;
conflicting nonmissing values within one cell/source-month produce HTTP 409.
It does not merge Terra and Aqua into an undocumented composite. All-null values
remain missing. Regional means are neither area-weighted nor a new satellite
retrieval product. See [statistical methods](STATISTICAL_METHODS.md) for inference.

## Missingness and temporal availability

Use measured column counts and gaps from final release evidence. The supplied
audit's attachment coverage ranges widely: NDVI/EVI are relatively dense,
monthly LST context is much sparser, and GHSL is populated only under its 2021+
policy. Those are source-row attachment counts, not numbers of independent
monthly measurements. The upstream model-v2 audit explicitly preserves the
missing Aqua acquisition on `2022-04-07`; no backend interpolation fills it.

Keep three separate quantities: a missing measurement within an existing source
row, an absent/missing cell-month contribution, and a completely missing requested
monthly time slot. API monthly points expose `observed_cells`,
`contributing_cells` and `source_rows`. Their trend `missing_data_ratio` concerns
empty selected monthly slots only. It does not establish complete spatial coverage
or measure every rejected/missing source value. For previous-month context, the
final attachment month cannot supply a future month outside the source period;
for example, December context would ordinarily attach to January of the next year.

`observation_date` is an acquisition/composite date, not a proven product-release
timestamp. Source `period_end`, processing latency, actual publication timestamps
and a per-feature `available_at` are not all present in this fusion file. The
previous-completed-month join is a useful temporal policy; it is not proof that
every input had been publicly available at every historical forecast origin.
Likewise, the GHSL-2020/2021 gate is an upstream rule, not verified evidence of the
GHSL product's publication date. Verify release history before operational or
retrospective as-of backtesting.

## Versioned SQL feature interface

Alembic revision `f932c7a14d58` creates `earthtrend_db.dbo.ml_features_v1`. This
migration was applied to the local SQL Server and its feature/quality behavior
was tested against rolled-back SQL Server fixtures. The view exposes one row per
accepted observation, with 51 explicitly named columns and no trained output.
It preserves the observation grain and all fourteen numerical measurements;
it performs no rescaling, imputation, spatial weighting or monthly deduplication.

| View columns | Interpretation |
| --- | --- |
| `id`, `dataset_version_id`, `cell_id`, `grid_id`, `region_id`, `longitude`, `latitude` | Observation identity and source spatial references |
| `observation_date`, `year`, `month`, `day_of_year` | Original base observation date and calendar values derived from it |
| `previous_month_reference` | First day of the preceding source calendar month, including December/January year boundaries |
| Fourteen measurement columns listed above | Original typed SQL values in their existing units |
| Four `*_valid` and four `*_qa_accepted` columns, two `*_night_qc_source_masked` columns | Canonical numeric 0/1 flags; missing or unrecognized metadata remains NULL |
| `terra_night_qc`, `aqua_night_qc` | Integer byte values when present; blank or unknown QC stays NULL, not zero |
| Four `*_status` columns | Original source status strings when present |
| `season_sin`, `season_cos`, three source temperature-difference columns | Numeric projections of original metadata, without recomputing their formulas |
| `source_split`, `source_row`, `row_hash` | Preserved source split and source-record lineage |
| `ghsl_reference_year` | 2020 when at least one GHSL context value exists; NULL without that context |

`previous_month_reference` describes source-month support and
`ghsl_reference_year` describes a snapshot epoch. Neither is an actual
`available_at` or publication timestamp. The view preserves Celsius values and
does not combine Terra and Aqua. Source difference columns can directly encode
a temperature target; apply the leakage exclusions below before using them as
predictors. The original flag/QC string encodings remain in the underlying
`source_metadata` and lexical export even though the view offers numeric forms.

The view is a nonmaterialized projection. Its empty `UNION ALL` member produces
no rows and makes DML through the view unsupported; an actual SQL integration
test verifies an attempted fixture update is rejected without changing its base
observation. Database privileges on underlying tables remain an operator
responsibility. Queries still require version/date filters and bounded batches,
and the view does not itself certify a version's completeness or freeze recovery.

For example, this read retrieves a bounded page with explicit temporal and QA
context:

```sql
DECLARE @version_id int = 6, @last_id bigint = 0;
SELECT TOP (10000)
    id, dataset_version_id, grid_id, region_id, observation_date,
    previous_month_reference, terra_lst_day_c, aqua_lst_day_c,
    terra_ndvi_spatial_prev_month, ghsl_2020_built_surface_m2_sum,
    ghsl_reference_year, terra_day_valid, aqua_day_valid,
    terra_night_qc, aqua_night_qc, source_split, source_row, row_hash
FROM dbo.ml_features_v1
WHERE dataset_version_id = @version_id AND id > @last_id
ORDER BY id;
```

Set the next cursor to the final returned `id`; resolve the expected SHA and
reconciliation evidence before extraction. The view and its API-independent
versioning allow a future model consumer to use canonical quality values without
changing raw observations or frontend files. SQL behavior follows Microsoft's
[`CREATE VIEW`](https://learn.microsoft.com/en-us/sql/t-sql/statements/create-view-transact-sql?view=sql-server-ver17),
[`JSON_VALUE`](https://learn.microsoft.com/en-us/sql/t-sql/functions/json-value-transact-sql?view=sql-server-ver17)
and [`TRY_CONVERT`](https://learn.microsoft.com/en-us/sql/t-sql/functions/try-convert-transact-sql?view=sql-server-ver17)
documentation.

## Consuming the prepared data

Use the lexical clean CSV when exact source strings or decimal arithmetic are
required. Keep blanks distinct from numeric zero, and explicitly choose types
instead of accepting automatic mixed-type inference. The manifest and data
dictionary specify units and shape; a filename containing "model ready" is not
scientific validation or a training-label definition.

For typed SQL access, run from the `backend` directory with its configured `.env`.
The following bounded extraction pattern uses the existing connection/session
configuration and named columns. It adds no dependency and trains no model:

```python
from sqlalchemy import select
from app.core.database import get_session_factory
from app.models import Observation, SpatialCell

version_id = 6  # Resolve the expected source SHA in each installation first.
last_id = 0
with get_session_factory()() as session:
    while True:
        rows = session.execute(
            select(
                Observation.id, Observation.source_row, Observation.observed_on,
                SpatialCell.grid_id, SpatialCell.longitude, SpatialCell.latitude,
                Observation.terra_lst_day_c, Observation.aqua_lst_day_c,
                Observation.terra_ndvi_spatial_prev_month,
                Observation.ghsl_2020_built_surface_m2_sum,
                Observation.source_metadata,
            )
            .join(SpatialCell, SpatialCell.id == Observation.cell_id)
            .where(Observation.dataset_version_id == version_id,
                   Observation.id > last_id)
            .order_by(Observation.id)
            .limit(10_000)
        ).mappings().all()
        if not rows:
            break
        # Pass this batch to the specialist's own feature pipeline or analysis.
        last_id = rows[-1]["id"]
        print(f"Read {len(rows)} rows; cursor={last_id}")
```

The example selects four of the fourteen measurements; add only required named
columns from the feature table above. SQL identities need not be contiguous.
Version pinning prevents mixing releases, but it does not freeze an incomplete
version while recovery is active. Extract after reconciliation, or use a
documented database snapshot under the operator's own maintenance procedure.

For small interactive reads, use the documented REST API rather than downloading
millions of rows in one response:

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/observations?dataset_version_id=6&indicator=terra_lst_day_c&page_size=100'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/analysis/trends?dataset_version_id=6&indicator=terra_ndvi_spatial_prev_month&start_date=2003-01-01&end_date=2024-12-31'
```

Raw observation date filters refer to fusion attachment dates. Analytical date
filters for `*_prev_month` refer to source calendar months and include overlapping
whole source months. The API limits monthly analyses to 1,200 calendar slots and
observation pages to 500 rows. For bulk feature preparation, prefer the validated
export or bounded SQL extraction.

The observation, dashboard and descriptive-analysis API defaults to the newest
version certified under the current validation policy; the published version in
this workspace remains `6`. An explicit certified `dataset_version_id` pins the
release. Unknown versions return 404, explicit uncertified versions return 409,
and a default data read with no certified version returns 503. The SQL feature
view does not enforce this HTTP publication gate, so SQL consumers must check the
selected version's reconciliation evidence themselves.

For an operator-only preview, supply an explicit `dataset_version_id`,
`allow_uncertified=true`, and `X-Import-Key` matching the configured `IMPORT_API_KEY`.
Observation detail instead uses its explicit observation ID plus the preview flag
and key. Preview access is not a release certificate. Do not use an in-progress
preview as a frozen training or evaluation release. Responses that include
version status warn that an uncertified preview is unpublished even after import
EOF. Raw observation payloads keep their existing shape, so retain the explicit
preview request context alongside them.

All trend and comparison GETs are read-only. Their fresh `analysis_id` values are
ephemeral computation identifiers, not saved-run keys or a promise of retrieval.
Existing historical rows are retained, but new GETs do not append history. Saving
a result through an explicit authenticated POST workflow is not implemented and
requires separate design approval; no saved-analysis endpoint is available here.
Record the response, pinned source version/hash, filters, code and method metadata
in the specialist's own experiment tracking when reproducibility is required.

## Leakage risks and evaluation design

- Define the target, its observation support, the forecast origin and horizon
  before selecting predictors. Same-row day/night LST and the three stored
  temperature-difference fields contain target measurements when predicting one
  of those temperatures. Exclude target-derived inputs; do not reuse an OLS fit
  or frontend result as a label.
- An eight-day composite can include observations after the date printed on its
  row. Do not treat a composite, same-month aggregate, recovered QC value or
  retrospectively available product as known at an earlier origin without verified
  availability times. Record `available_at` and enforce `available_at <= origin`.
- Repeated monthly context is not independent evidence. For a monthly target,
  reduce to one cell/source-month before splitting or scoring. For an eight-day
  target, keeping monthly context as a predictor can be reasonable, but adjacent
  rows sharing it remain dependent and must not be randomly scattered across folds.
- Spatial autocorrelation and shared 0.05-degree monthly LST bins create leakage
  across nearby native cells. Hold out appropriate spatial blocks and underlying
  coarse bins when measuring geographic transfer; grouping native cell IDs alone
  does not remove every shared-feature dependency.
- The preserved upstream split is train **2003-2018**, validation **2019-2021**,
  test **2022-2024**. Its reported row counts are provenance until independently
  checked. Keep a held-out chronological test interval untouched during selection.
  Decide whether evaluation concerns future periods in known cells, unseen spatial
  blocks, or both; those are distinct claims.
- Form temporal folds on complete acquisition-date or source-month groups, not
  arbitrary row offsets that can divide one date's cells between folds. Choose
  any boundary gap from the target horizon, feature lookback and composite support.
  Keep `split`, SQL identities, source record ordinals and import-job metadata as
  lineage/selection fields, rather than unexamined model predictors.
- Fit scalers, imputers, feature selection and any climatology only on each
  training fold. Whole-period monthly climatology, normalization, interpolation
  through a held-out interval or future-dependent gap repair can leak test data.
  Preserve missingness and record any downstream imputation policy separately.
- The GHSL eligibility gate and source outages can act as time/split proxies.
  Report availability shifts and performance by period, sensor and spatial block;
  do not interpret associations with those indicators as environmental causation.

These are evaluation recommendations, not an implemented training pipeline.
Chronological splitting and group separation solve different dependencies;
combine them when the scientific target requires both. Relevant primary
references are [TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html),
[GroupKFold](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupKFold.html),
and [scikit-learn's data-leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html#data-leakage).
No scikit-learn dependency or model was added to this backend.

## Recommended future model boundary

The model specialist should define a versioned contract separately from the raw
and descriptive API schemas. The following is a design contract, not an active
prediction endpoint or an example of computed predictions:

| Input field | Required meaning |
| --- | --- |
| `feature_schema_version` | Named, immutable feature definition and transformation version |
| `dataset_version_id`, `dataset_sha256` | Pin the reconciled source content and installation-local ID |
| `grid_id`, spatial-scope definition | Source cell identity, CRS/reference and any aggregation scope |
| `origin`, target interval, horizon | Distinguish when the request is made from when the target is measured |
| Target specification | Measurable variable, source, unit and temporal support; no tourism target without verified labels |
| Feature values and units | Explicit ordered feature list, nulls, source period, source version and verified `available_at` |
| Quality and support | Source flags, missingness, contributing observations and any exclusion policy |
| Transformation provenance | Cleaning/aggregation/imputation versions and training-fitted artifacts |

| Output field | Required meaning |
| --- | --- |
| Availability/status | Explicit unavailable or insufficient-data state when no validated model/input exists |
| Model identity | Registered model/version, training dataset fingerprints, code/environment and validation report |
| Request identity | Origin, target interval, grid/scope, feature schema and source content versions |
| Estimated value and unit | Only after an actual model is trained and evaluated for the specified target |
| Uncertainty | Only an implemented, evaluated uncertainty method; no invented interval or confidence score |
| Support/limitations | Missing inputs, extrapolation conditions, evaluation scope and supported interpretation |

Store future model results separately from observed measurements and descriptive
trend results. Validate feature schema and temporal availability before invoking
an implementation. A forecast does not establish a causal effect, and a future
tourism analysis additionally requires reliable tourism observations and a
defensible study design. Those tasks remain with the model/scientific team.
