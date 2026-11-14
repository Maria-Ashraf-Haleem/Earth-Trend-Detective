# Frontend inspection and API contract

Inspected repository: `Maria-Ashraf-Haleem/Earth-Trend-Detective`, commit
`1b8c35a` (`add data`). No frontend files were modified for this backend.
Current workspace state and continuation boundaries are in the mandatory
[backend handoff](BACKEND_HANDOFF_README.md).

`/variables` includes the eight temperature indicators with meaningful day/night
windows. All fourteen environmental measurements, including vegetation and the
GHSL snapshot, are listed by `/indicators`; vegetation and built surface do not
receive an invented day/night classification.

## Architecture and current execution path

The existing application is a React 19 / TypeScript SPA built with Vite. React
Router uses `createBrowserRouter` in `src/app/router.tsx`. The routes are `/`,
`/explorer`, `/lab`, `/results`, `/results/:experimentId`, `/insights`,
`/experiments`, `/compare`, `/methodology`, and `/settings`. Zustand persists
application and analysis state in browser local storage. React Query is provided
at the application root, but the pages currently do not fetch their data through
it. Maps use React Leaflet; charts use Plotly. Tailwind supplies styling.

The original frontend commit contained no backend or database configuration.
The current workspace now includes the verified FastAPI/SQL Server backend.
The original client contract comes from its TypeScript interfaces, Zod request
schema, and the endpoint table in the methodology page.

**The unchanged frontend is not a production data client.** Switching its
environment flag does not replace its existing local analysis path:

- `src/config.ts:2` enables demo mode unless `VITE_DEMO_MODE` is exactly `false`.
- `src/services/api/earthtrend.ts` defines real HTTP methods and mock branches.
- `src/store/useLabStore.ts:119` seeds locally computed experiments regardless
  of that flag. The seed helper marks these runs `isDemo: false`.
- `src/store/useLabStore.ts:198` calls `POST /api/v1/experiments`, waits through
  local progress timers, and then `:220` always calls `analyzeDemo` locally. It
  never invokes the server run, status, or results methods.
- Overview, Explorer, Research Lab, Results, Experiments, Comparison,
  Methodology, map hero, and layout components import static catalogs or mock
  data directly. Explorer builds its series and spatial layers locally.
- Results and Insights render browser-persisted results. Deleting, copying, and
  saving experiments are local operations, not server requests.

Consequently no backend-only change can make every existing screen display
verified database results. This limitation must remain visible in release and
deployment documentation. Clearing local storage alone does not fix it because
the store recreates seed runs.

## Configure the existing HTTP client

Place these values in the frontend's local environment file and restart Vite:

```dotenv
VITE_DEMO_MODE=false
VITE_API_BASE_URL=http://localhost:8000
```

The base URL must not include `/api/v1`: the client appends that prefix itself.
The backend must allow the actual frontend origin through `CORS_ORIGINS`, such
as `http://localhost:5173`. This changes HTTP client configuration only; the
local execution limitations above still apply.
The repository's `.env.example` enables demo mode. The existing client methods
do not send `allow_uncertified` or `X-Import-Key`, and the store does not call the
backend's descriptive-analysis endpoints. Live client configuration is therefore
not evidence that the displayed charts came from the certified database release.

## Existing client request inventory

| Method | Path below `/api/v1` | Type expected by the client |
| --- | --- | --- |
| GET | `/variables` | `Variable[]` |
| GET | `/regions` | `Region[]` |
| GET | `/datasets` | `Dataset[]` |
| POST | `/experiments` | `Experiment` |
| GET | `/experiments/{id}` | `Experiment` |
| POST | `/experiments/{id}/run` | `Experiment` |
| GET | `/experiments/{id}/status` | `{ status, step }` |
| GET | `/experiments/{id}/results` | `AnalysisResults` |
| GET | `/experiments/{id}/map` | `SpatialLayer[]` |
| POST | `/experiments/{id}/insights` | `AIInsight` |
| POST | `/sessions` | `ResearchSession` |
| GET | `/sessions` | `ResearchSession[]` |
| GET | `/experiments/{id}/export?format=csv\|json` | Declared as `Blob`, but implementation always parses JSON |

All requests set `Content-Type: application/json`, including GET requests.
`src/services/api/client.ts` treats non-2xx responses as errors, discards the
server's error body, and exposes a generic `Request failed (status)` message.
Successful JSON is cast to the TypeScript type without runtime response
validation. Zod validates experiment requests before they are sent.

## Backend compatibility decisions

`GET /regions`, `GET /datasets`, and `GET /variables` return bare JSON arrays
with camelCase metadata expected by the client. Pagination information is in
response headers so the existing array contract is preserved. Observation,
cell, location, import, and quality-report lists use a paginated response
envelope. `/indicators` and `/variables` are metadata arrays. `/variables` is a
metadata adapter over the real indicator catalog; it does not create separate
observations.

Region IDs are strings. A region's `centroid` is `[latitude, longitude]` for
Leaflet. GeoJSON polygon coordinates are `[longitude, latitude]`. Region bounds
have `west`, `south`, `east`, and `north` numeric members. An imported cell
centroid extent can be exposed as a clearly labeled bounding box; it is not an
official administrative boundary. A boundary unavailable from verified input
must not be fabricated.

Dataset metadata includes `id`, `name`, `shortName`, `provider`, `version`,
`spatialResolution`, `temporalResolution`, `availableBands`,
`studyPeriod: {start, end}`, `documentationUrl`, and `notes`. Metadata and
availability must reflect the source or database, including incomplete imports.
The catalog's published selection is the newest current-policy certified version,
currently version `6`; a newer uncertified import does not become the default.

Variable metadata uses `id`, `name`, `shortName`, `unit`, `datasetId`,
`observationWindow`, `description`, `scaleFactor`, and `nativeUnit` where those
fields have a defensible meaning. CSV LST columns ending `_c` already contain
Celsius values; a compatibility scale factor must be `1`, never the demo
catalog's raw-DN factor `0.02`. Variables for future air-temperature or tourism
sources must be explicitly unavailable until verified observations exist.

The current frontend experiment contract requires all of Sen's slope,
Mann–Kendall statistics, a numerical confidence interval, decomposition,
anomalies, spatial statistics, and an insight object. Those fields cannot be
filled by an OLS-only service without misleading consumers. The backend returns
an explicit HTTP 501 unavailable response for the legacy experiment and session
workflow. In particular, rejecting `POST /experiments` stops the unchanged
store before it creates another local result presented as a completed live run.
Verified descriptive analyses are available through `/analysis/*`; their
independent, documented schema allows nullable unsupported statistics.

## Publication, preview and analysis identity

Ordinary observation, dashboard and descriptive-analysis reads select the newest
current-policy certified version. Clients can pin a certified
`dataset_version_id`. Unknown explicit versions return 404, explicit uncertified
versions return 409, and default data reads return 503 if no certified release
exists. Metadata catalogs can still report unavailable data.

An operator preview requires an explicit `dataset_version_id`,
`allow_uncertified=true` and `X-Import-Key` matching the existing server-side
`IMPORT_API_KEY`. The flag without a version is 422; configured-key authentication
failures are 401; preview is disabled with 503 if no key is configured. Observation
detail also checks its stored version: `/observations/{id}?allow_uncertified=true`
requires the same key, with the observation ID serving as the explicit selection.
The current frontend has no preview controls or key-handling workflow; ordinary
UI integration should consume published data. Responses with version-status
fields return `data_verified=false` and an uncertified-data warning for previews
even if import reached EOF. Raw observation list/detail shapes are unchanged;
clients must retain the explicit preview request context.

Trend, region-trend and comparison GETs do not write analysis history. A returned
`analysis_id` is a fresh ephemeral UUID for that response, not a stored experiment
ID. There is no saved-result retrieval guarantee for it. Existing historical
database results remain intact. An explicit authenticated POST workflow for saved
analyses is not implemented and would need separate design approval; it must not
be inferred from the unavailable legacy experiment routes.

## Static identifiers and source mismatch

| Existing static identifier | Meaning in frontend files | Integration treatment |
| --- | --- | --- |
| `hurghada` | Hand-authored broad corridor extent | Do not treat its polygon as a surveyed boundary |
| `urban-resorts` | Mock resort/vegetation category | No verified source classification was supplied; do not infer it from a threshold |
| `mod11a2-061` | Frontend's combined Terra/Aqua/vegetation/GHSL catalog entry | Do not alias an imported fusion version to this unsupported provenance claim |
| `lst-day`, `lst-night` | Combined frontend temperature series | Use source-specific indicator IDs; no implicit Terra/Aqua fusion |
| `cell-{integer}` | Cells in bundled precomputed map JSON | These are not IDs of the ingestion grid |

The bundled frontend spatial file is described as 265 cells on a 0.05-degree
grid, and its local monthly series covers 264 months. The supplied spatial
fusion audit reports 7,231 cells and 7,317,772 base rows. Its base observations
and lagged monthly features have different temporal and spatial supports.
These sources must not be silently substituted for one another.

## Scientific claims the backend does not endorse

Existing static frontend content includes tourism recommendations, a claimed
12–18% HVAC impact, and a claimed 41% vegetation mitigation effect
(`src/data/mock/insights.ts`). These are not derived from backend tourism
observations or causal analysis. The frontend also constructs a confidence
interval with `abs(slope) * 0.22 + 0.008`, and its function named seasonal
Mann–Kendall returns the median of monthly p-values (`src/utils/stats.ts`).
Those are not methods used by the backend. Backend results and documentation
must not be interpreted as validation of these pre-existing UI statements.

## Required future frontend work (outside the authorized change)

Before production use, replace static catalog imports with API queries, stop
unconditional seed/mock analysis, display server availability/error states,
consume the actual read-only analysis responses, and render nullable unsupported statistics.
Use real dataset versions, region and indicator IDs from the API. Consume raw
observations separately from aggregates and trend results. Treat lagged monthly
features at their actual source month, and keep the GHSL 2020 snapshot separate
from time-varying indicators. A future experiment UI must send only implemented
methods and consume server results rather than calculate them with demo helpers.
Server-side saving and later retrieval would require the separate future POST
workflow described above; ephemeral analysis IDs cannot supply it.

The export helper also needs a future binary/text response path if server-side
CSV downloads are enabled; its current `request<Blob>` implementation cannot
parse an actual CSV file.

## Available integration routes

All paths below have `/api/v1` prefix. Response names refer to the complete
schemas in [openapi.json](openapi.json). Public certified reads require no key.

| GET route | Required input | Response and immediate use |
| --- | --- | --- |
| `/health`, `/health/database`, `/health/readiness` | None | `HealthRead`, `DatabaseHealthRead`, `ReadinessRead`; service/readiness state |
| `/regions`, `/regions/{region_id}` | Region ID for detail | `RegionRead[]` / `RegionRead`; actual IDs and centroid bounds |
| `/regions/{region_id}/cells` | Region ID | `Pagination[SpatialCellRead]`; actual cell centroids |
| `/locations` | None; optional `region_id` | `LocationPage`; currently empty/unavailable |
| `/datasets`, `/datasets/{dataset_id}` | Dataset ID for detail | `DatasetRead[]` / `DatasetDetail`; published version and source provenance |
| `/indicators`, `/variables` | None | `IndicatorRead[]` / `TemperatureVariableRead[]`; 14 source measurements / 8 LST variables |
| `/observations` | None | `ObservationPage`: `items`, `total`, `page`, `page_size`, `availability`, `dataset_version_id` |
| `/observations/{observation_id}` | Observation ID | `ObservationRead`: identity, `date`, nullable `values`, source `quality` strings |
| `/dashboard/summary` | None; optional region/version | `DashboardSummary`: row/cell totals, period, verification and unavailable-data flags |
| `/dashboard/environmental-overview` | None; optional region/version | `EnvironmentalOverview`: 14 nullable row-weighted source means; not trends |
| `/dashboard/data-coverage` | None; optional region/version | `DataCoverage`: source-row denominator, present/missing counts and ratios |
| `/analysis/trends` | `indicator` | `TrendRead`: monthly `series`, support counts, descriptive OLS/null statistics, version status, ephemeral ID |
| `/analysis/trends/{region_id}` | Region ID, `indicator` | Same `TrendRead`; optional inclusive start/end dates and version |
| `/analysis/compare` | `indicator`, `period_a_start`, `period_a_end`, `period_b_start`, `period_b_end` | `ComparisonRead`: two aggregate summaries, change/null statistics, pinned version, ephemeral ID |
| `/imports`, `/imports/{job_id}` | Job ID for detail | Paginated `ImportJobRead` / `ImportDetail`; counters, scope, safe bounded logs |
| `/imports/{job_id}/batches`, `/imports/{job_id}/quarantine` | Job ID | Paginated batch / safe quarantine metadata; no raw rejected payloads |
| `/quality/reports` | None; optional `job_id` | Paginated `QualityReportRead`; recorded source-coverage evidence |

List pagination uses `page >= 1` and `1 <= page_size <= 500` (default 100).
The array catalogs `/regions` and `/datasets` expose totals in `X-Total-Count`,
`X-Page`, and `X-Page-Size`; `/variables` and `/indicators` contain the fixed catalog.
Observation filters are optional `region_id`, `cell_id`, `indicator`, inclusive
`start_date`/`end_date`, `year`, `month`, `data_source`, `dataset_version_id`, and
all four `west`/`south`/`east`/`north` coordinates together. Sorting uses
`sort=date|id|cell_id`, `order=asc|desc`. Generic trends accept the same source
filters, require an indicator, and return at most 1,200 calendar slots.
Comparisons accept optional region/version; periods must be disjoint, including
source-calendar-month disjointness for previous-month indicators.

`POST /imports` is an operator write, requires `X-Import-Key`, and accepts only
`{}`, `{"resume_job_id":"UUID"}`, or `{"retry_quarantine_job_id":"UUID"}`.
It returns `ImportSubmission` with status 202 and queues a durable CLI-worker job.
It is not a frontend analysis endpoint. Never embed the operator key in a public
frontend bundle. Saved analyses, predictions, tourism, experiment execution,
sessions, and server CSV download are unavailable; legacy routes return 501.

Errors have `{code, message, status, request_id}` and an `X-Request-ID` header.
Handle 401 for operator authentication, 404 for unknown identifiers, 409 for
uncertified versions/context conflicts/import conflicts, 422 for invalid input,
501 for unavailable workflows, and 503 for database/publication unavailability.
Readiness 503 has its documented `ReadinessRead` body with named check results.
Missing measurements are JSON `null`, never implicit zero.

Example public requests:

```text
GET /api/v1/observations?dataset_version_id=6&indicator=terra_lst_day_c&start_date=2022-04-07&end_date=2022-04-07&page_size=5
GET /api/v1/analysis/trends?dataset_version_id=6&region_id=hurghada-study-area&indicator=terra_lst_day_c&start_date=2022-01-01&end_date=2022-12-31
GET /api/v1/analysis/compare?dataset_version_id=6&indicator=terra_lst_day_c&period_a_start=2021-01-01&period_a_end=2021-01-31&period_b_start=2022-01-01&period_b_end=2022-01-31
```

Live verification: [API_VERIFICATION.json](API_VERIFICATION.json) records 40 checks
with response-schema and content assertions. [TEST_RESULTS.xml](TEST_RESULTS.xml)
records the 287-test final SQL-backed suite. The backend is ready for integration
with these observed-data routes; the existing UI still requires the changes
listed above before it can display them truthfully.
