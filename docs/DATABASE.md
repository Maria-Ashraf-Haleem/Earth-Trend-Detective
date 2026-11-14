# Database

Verified against the live `earthtrend_db` (SQL Server 2025, compatibility level 170, FULL recovery).

## Tables (18) and the `ml_features_v1` view

| Table | Role |
|---|---|
| `regions` | Study areas; availability derived from actual cell extents |
| `locations` | Named points inside regions |
| `spatial_cells` | 7,231 source-grid cell centroids |
| `data_sources` | Terra / Aqua / GHSL provenance records |
| `datasets` | Logical datasets (`earthtrend-spatial-fusion-v2`) |
| `dataset_versions` | Immutable, sha256-identified versions with validation certificates |
| `indicators` | 14 indicators with units and temporal support |
| `observations` | 7,317,772 source rows (version 6) |
| `import_jobs` / `import_batches` / `import_logs` / `import_quarantine` | Ingestion audit trail |
| `quality_reports` | Per-job quality evidence |
| `analysis_runs`, `trend_results`, `period_comparisons` | Reserved persistence structures (GET analysis is ephemeral by contract) |
| `environmental_summaries` | Reserved; empty and unused by the current API (dashboards aggregate directly) |
| `tourism_observations` | Reserved; no verified tourism data exists |

## Observations table

- Clustered index on `id`.
- Unique grain: `uq_observation_grain (dataset_version_id, observed_on, cell_id)` — idempotent imports.
- Query-supporting indexes: `ix_observations_version_date_lst (dataset_version_id, observed_on)`, `ix_observations_cell_date (cell_id, observed_on)`, `uq_observation_version_source_row (dataset_version_id, source_row)`.
- 14 measurement columns (Terra/Aqua LST day/night, NDVI/EVI and monthly context for each, GHSL built-surface m² and valid pixel count). NULL means *not observed* — never zero.
- Row count verified 2026-11-14: exactly 7,317,772 rows, all `dataset_version_id = 6`.

## `ml_features_v1` view

One row per observation with typed features for a future model: measurement columns, QA-acceptance flags, seasonal encodings (`season_sin`, `season_cos`), day/night deltas, `source_split`, and provenance (`cell_id`, `grid_id`, `region_id`, `observation_date`). The backend reads it read-only and preserves NULLs.

## Integrity rules observed by the application

- Certification gate: a version is published only when `validation_json.reconciled = true` and the `validation_policy` matches the current ingestion policy (`repositories.is_certified_version`).
- Region and cell filters validate existence before querying observations (404 semantics).
- Monthly aggregation is equal-cell-weight: repeated monthly context is reduced to one value per cell/month; conflicting context values abort with HTTP 409 rather than averaging silently.
- Analysis requests are bounded to 1,200 calendar months (HTTP 422 beyond).

## Access layer

- SQLAlchemy 2.x engine (`backend/app/core/database.py`): pyodbc, `Trusted_Connection=yes`, encrypt + trust-server-certificate flags from settings, `pool_pre_ping`, per-connection query timeout, JSON serializer pinned.
- Sessions: request-scoped, `expire_on_commit=False`, rollback on error.
- All statements are SQLAlchemy expressions (parameterized); no user input is interpolated into SQL.

## Performance notes (measured 2026-11-14)

- Version-filtered count: 338 ms. Page-id selection over the version index: ≈2.2 s cold. Clustered-seek fetch of a 20-row page: ≈1 ms.
- Dashboard aggregate over all 14 measures: ≈11.5 s cold buffer pool, then process-cached (one hour TTL, keyed by version certificate).
- Historical Query Store investigation (Query Store ID 833) motivated `ix_observations_version_date_lst`, which is already present; no additional index is currently proposed.

## Change policy

No destructive operations are permitted against the certified data. Any schema change ships as an Alembic revision, additive only, with a written justification and a verified backup (the latest full backup: 2026-11-14). The certified version 6 rows are never modified in place.
