# Data Sources & Provenance

## Source products

| Source | Variables | Native cadence | Notes |
|---|---|---|---|
| MODIS **Terra** | LST Day / LST Night (degC) | 8-day composites | Land surface temperature — not air temperature |
| MODIS **Aqua** | LST Day / LST Night (degC) | 8-day composites | Always distinguishable from Terra |
| MODIS **Terra/Aqua** | NDVI, EVI (index) | 16-day, attached as **previous-month** context | Indices — not tree counts |
| MODIS **Terra/Aqua** | Monthly day/night context (degC) | Monthly, previous-month context | Repeated context; equal-cell weighting reduces duplication |
| **GHSL 2020** | Built-surface m², valid pixel count | Single snapshot (2020) | Not an annual series; trends return HTTP 422 |

## Fusion dataset

`earthtrend-spatial-fusion-v2` fuses the sources onto one spatial grid with lagged temporal context.

- Each version is identified by **sha256** of the source bundle and carries a validation certificate in `validation_json`.
- Certification requires `reconciled = true` under the current validation policy version; the reconciliation process resolved historical failed import attempts before certification (historical failed job rows are audit history, not data loss).
- **Version 6 (certified, published):** 7,317,772 observations · 7,231 cells · study period 2003-01-01 → 2024-12-26 · zero unresolved quarantine.

## Spatial provenance

- Cell coordinates are actual source-grid centroids (not interpolated rasters).
- Region geography exposes a bounding box derived from real cell extents, explicitly labelled `source_centroid_bounding_box` — it is not an administrative boundary.
- The study focus is the **Hurghada, Egypt** fusion footprint.

## Temporal provenance

- Eight-day LST rows carry their own observation dates.
- Monthly context (NDVI/EVI, monthly LST) belongs to the *previous* source month; the analysis layer intersects source months so disjoint day windows never double-count context.
- The record ends 2024-12-26. No data after that date exists or may be invented.

## Provenance in API responses

Every analytical response travels with:

- `dataset_version_id` — exact version used,
- `data_verified` / certification status and `warning` text when uncertified,
- `method` and `methodology` strings describing the computation,
- `warnings` — e.g. serial-dependence and seasonality caveats,
- support statistics (`observation_count`, `total_slots`, `missing_data_ratio`, `observed_cells`, `contributing_cells`, `source_rows`).

## External verification

QA source-masked flags (`*_qc_source_masked`), QA acceptance flags and per-column status strings are preserved in `source_metadata` and exposed in the `ml_features_v1` view. Dataset-level provenance is visible in `GET /api/v1/datasets/{id}` (validation summary, coverage, limitations).
