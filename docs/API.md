# API Reference (human summary)

Base URL: `http://127.0.0.1:8000/api/v1` · Interactive docs: `/docs` · Authoritative machine contract: `backend/docs/openapi.json`.

All errors use one envelope: `{"code", "message", "status", "request_id"}`. Pagination responses carry `X-Total-Count`, `X-Page`, `X-Page-Size` headers and an `items/total/page/page_size` body. Every analytical response includes `dataset_version_id`, `data_verified` and `warnings`.

## Health

| Endpoint | Result |
|---|---|
| `GET /health` | Service liveness |
| `GET /health/database` | Connectivity check |
| `GET /api/v1/health/readiness` | `ready` / `not_ready` with `checks: {database, schema_current, data_verified}`; 503 when not ready |

## Catalog

| Endpoint | Notes |
|---|---|
| `GET /regions` · `GET /regions/{id}` | Bounds/boundary derived from actual cell extents; `boundaryKind: source_centroid_bounding_box` |
| `GET /regions/{id}/cells` | Bounded cell page (max 500) |
| `GET /locations` | Named points; `availability` reflects existence |
| `GET /indicators` | 14 indicators with unit and temporal support |
| `GET /variables` | degC subset (8 LST variables) for chart UIs |
| `GET /datasets` · `GET /datasets/{id}` | Certification status, study period, available bands, provenance notes |

## Observations

`GET /observations?region_id&cell_id&indicator&start_date&end_date&year&month&data_source&west&south&east&north&dataset_version_id&page&page_size&sort=date|id|cell_id&order=asc|desc`

- Returns a bounded page (`page_size` ≤ 500) with `source_metadata` preserved.
- Missing measurements are JSON `null`; Terra/Aqua and day/night never merge.
- Unknown region/cell → 404; indicator/source mismatch → 422; uncertified preview requires the import key header.

## Analysis

`GET /analysis/trends?region_id=…&indicator=…&start_date=…&end_date=…&dataset_version_id=6[&cell_id=&bounds]`

- Monthly equal-cell-weight series; missing slots are `null` points.
- Descriptive OLS: `slope_per_year`, `p_value`, `significant`, `confidence_interval`, `method: ordinary_least_squares_elapsed_years`.
- `percentage_change` is suppressed for non-ratio units (degC, index) — it stays `null`.
- GHSL (snapshot) → HTTP 422. Unknown indicator → 404. Span > 1200 months → 422.
- `analysis_id` is an ephemeral computation ID; GET does not save history.

`GET /analysis/compare?indicator=…&period_a_start=…&period_a_end=…&period_b_start=…&period_b_end=…&region_id=…&dataset_version_id=6`

- Two disjoint periods, pinned to one certified version. Overlap → 422 (calendar-month overlap check for `previous_month` indicators). No p-value: a two-period comparison is descriptive only.

## Dashboard

`GET /dashboard/summary` · `GET /dashboard/environmental-overview` · `GET /dashboard/data-coverage` — bounded aggregates; `air_temperature`, `tourism`, `predictions` are literal `"unavailable"`.

## Model integration (disabled by default)

| Endpoint | Result |
|---|---|
| `GET /model/status` | `not_configured` / `available` / `not_implemented` + plain-language message |
| `POST /model/predictions` | 503 `model_not_configured` while disabled; when enabled: validated features → adapter → `{value, unit, confidence?, …}` |

No trained model exists. The layer never fabricates predictions.

## Legacy routes

`/experiments` and `/sessions` families answer HTTP 501 with a pointer to the observed-data endpoints. They exist so old clients fail truthfully instead of silently.

## Imports & quality (operator)

`GET /imports`, `/imports/{id}`, `/imports/{id}/batches`, `/imports/{id}/quarantine`, `GET /quality/reports`, `POST /imports` (requires `IMPORT_API_KEY` header; 503 while unset; app-lock guarded against concurrent runs).
