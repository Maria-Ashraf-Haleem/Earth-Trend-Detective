# Source mapping and relational schema

The inspected CSV is a spatial-fusion table, not a verified tourism or air-temperature
dataset. It has 43 source columns. The supplied audit reports 7,317,772 records,
7,231 reference grid cells and years 2003–2024. The backend independently streams
and validates its own imported rows and records measured coverage separately.

## Source grain and values

`observations` stores one source record per `(dataset_version_id, cell_id, observed_on)`.
Nullable FLOAT(53) columns preserve numeric source values without rescaling. The
original CSV remains the exact lexical record, identified by a full SHA256 content
fingerprint and a one-based CSV record number. A per-row SHA256 over the canonical
source dictionary distinguishes exact duplicate records from conflicting keys.
No raw source files are committed to the repository.

| Source fields | Database mapping and interpretation |
| --- | --- |
| `grid_id` | `spatial_cells.grid_id`, source reference-grid identifier; not a latitude/longitude ID |
| `longitude`, `latitude` | `spatial_cells` FLOAT(53), WGS84-degree centroid values as supplied; no invented cell polygons |
| `observation_date` | `observations.observed_on` DATE, source fusion attachment date |
| `year`, `month`, `day_of_year` | Validated against the date; derived through SQL when filtering |
| `terra_lst_day_c`, `terra_lst_night_c`, `aqua_lst_day_c`, `aqua_lst_night_c` | Same-named FLOAT columns, degrees Celsius, base eight-day source values |
| `terra_ndvi_spatial_prev_month`, `terra_evi_spatial_prev_month`, Aqua equivalents | Same-named FLOAT columns, index units; previous completed calendar-month source context |
| `terra_monthly_day_spatial_prev_month`, `terra_monthly_night_spatial_prev_month`, Aqua equivalents | Same-named FLOAT columns, degrees Celsius; previous completed month, coarser 0.05-degree spatial bins |
| `ghsl_2020_built_surface_m2_sum` | Same-named FLOAT column, square metres; one 2020 snapshot attached only in 2021+ rows |
| `ghsl_2020_valid_pixel_count` | Same-named FLOAT column preserving source value, validated as nonnegative integer; count of source pixels |
| `season_sin`, `season_cos` | Original strings in private `source_metadata` JSON; numeric validation without recomputation |
| Four `*_valid`, four `*_qa_accepted`, four `*_status` fields | Original strings in JSON, exact flags/statuses retained; 0/1 flags checked |
| `terra_night_qc`, `aqua_night_qc`, two `*_night_qc_source_masked` fields | Original strings in JSON; blank QC remains blank, never changed to QC=0 |
| `terra_day_night_delta_c`, `aqua_day_night_delta_c`, `terra_aqua_day_difference_c` | Original strings in JSON; validated numeric, never silently recalculated |
| `split` | Original `train`, `validation` or `test` source metadata; retained for provenance, no model training performed |

Blank measurements become SQL NULL. Zero is a valid GHSL observation. Numeric NaN
and infinity, malformed dates, inconsistent year/month/day-of-year, invalid bounds,
and incompatible base measurement/validity flags are rejected with safe codes.
NDVI is checked against [-1,1]; EVI is not artificially clamped to one. QC must be
an integer byte or blank, including exact integral decimal encodings such as `0.0`
and `65.0` found in later exports. Fractional and nonfinite QC values are rejected;
original decimal strings remain unchanged in metadata. A masked QC source must
have blank QC. Source status
strings are retained; the backend does not claim an independent product-specific
quality reprocessing algorithm. A valid source-value flag is not a scientific
confidence interval.

## Tables

| Table | Purpose and principal keys |
| --- | --- |
| `regions` | Stable study-area identifier; actual imported grid extent is explicitly a centroid bounding box |
| `locations` | Verified named locations with region and coordinate constraints; currently empty |
| `spatial_cells` | Unique source grid ID, region foreign key and validated centroid coordinates |
| `data_sources` | Terra, Aqua, GHSL source attribution |
| `datasets` | Stable logical fusion dataset catalog |
| `dataset_versions` | Unique full content SHA256, source bytes, private audit, current-policy reconciliation manifest and validated UTC |
| `indicators` | Source-column IDs, unit, data-source FK, temporal support and description |
| `observations` | Typed measurement columns, source metadata, source record identity and foreign keys |
| `import_jobs` | Durable state, version, counters, CSV checkpoint, timestamps and safe failure code |
| `import_batches` | Atomic source-ordinal bounds and counters with SQL reconciliation CHECK; observation provenance FK |
| `import_quarantine` | Every rejected original payload/hash/field/code; resolution links retained after recovery |
| `import_logs` | Bounded detailed row failures, job FK and codes without source paths |
| `quality_reports` | Cumulative measured counts, coverage, bounds, source dates and limitations for each job |
| `analysis_runs` | Version-pinned execution ID, kind, request filters, UTC and availability status |
| `trend_results` | One JSON statistical result per analysis execution |
| `period_comparisons` | One JSON descriptive comparison per analysis execution |
| `environmental_summaries` | Reserved result container for future persisted summaries; not fabricated or prepopulated |
| `tourism_observations` | Empty future integration: region/source/version/date, nullable occupancy fraction, arrivals, capacity and seasonal indicator |

SQL Server identity integer keys serve dimensions; source observations and tourism
use BIGINT identity. Source dates use DATE, timestamps are naive UTC SQL DATETIME,
numeric measurements use FLOAT(53), and SQLAlchemy JSON maps to NVARCHAR(MAX).
Source identifiers, foreign keys, uniqueness and range constraints enforce
structural integrity. Large raw records and indexes use PAGE compression.

The immutable 43-column CSV is the raw landing layer, identified by its content
hash. Validated observations form a separate typed query layer; rejected records
retain their complete original strings in quarantine. This avoids duplicating
millions of valid raw dictionaries in SQL. Diagnostic logs are capped; quarantine
records are not. Every new batch enforces `processed = inserted + duplicates + rejected`
and commits with its rows, quarantine and checkpoint. Historical rows predating
the batch migration keep nullable job/batch FKs and remain traceable through
version, source record number and raw row hash; old batch timestamps are not invented.

Numeric Boolean flags accept exact 0/1 encodings including `0.0`/`1.0` while
retaining their original text. The documented absent Aqua retrieval on 2022-04-07
has blank LST, validity, QA, status and QC for all 7,231 cells. That coherent absent
state remains unknown; independently attached Aqua vegetation/monthly context and
Terra/GHSL values are retained. A nonmissing LST still requires valid and accepted
source flags. An unknown QA flag never becomes an affirmative or false flag.

`dbo.ml_features_v1` is the versioned read-only 51-column ML interface. It exposes
original measurement values, geographic and source identity, calendar references
and canonical integer/NULL QA and QC. Empty QC stays NULL. It does not contain
predictions, verified availability timestamps or tourism labels. The clean export
retains the original 43-column CSV schema byte for byte after certification, so
decimal lexemes up to the observed 17 significant digits/19 decimal places are
preserved exactly. SQL FLOAT(53) remains an approximate floating-point query type.

Wide raw measurement columns intentionally match the validated fused source grain,
avoiding expansion to over 100 million indicator/value records. Dimensions,
versions, provenance, execution history and future tourism observations are
separate relations. Monthly aggregates are derived queries, never mislabeled raw
observations. GHSL temporal trends are explicitly rejected. Region extent is not
an administrative boundary or an area-weighted polygon overlap.

The audit includes source filesystem paths. Those remain private provenance;
dataset APIs return an allowlisted subset of methodological audit fields only.
