# Earth Trend Detective backend

FastAPI, SQLAlchemy 2.x, Alembic and SQL Server with Windows Integrated Authentication.
This backend serves observed source values, monthly aggregates and descriptive statistics.
It contains no trained model, predictions, invented tourism records or causal impact scores.

See [the execution report](docs/FINAL_REPORT.md), [frontend contract](docs/FRONTEND_CONTRACT.md),
[statistical methods](docs/STATISTICAL_METHODS.md) and [data dictionary](docs/DATA_DICTIONARY.md).
Read the [backend handoff](docs/BACKEND_HANDOFF_README.md) for the current workspace
state, operating boundaries and continuation instructions.
The release interface and leakage/precision rules are in [ML_HANDOFF.md](docs/ML_HANDOFF.md).
Detailed quarantine and batch contracts are in [INGESTION_AUDIT.md](docs/INGESTION_AUDIT.md).

Verified 13 November 2026: version 6 is certified with 7,317,772 observations,
7,231 cells and zero unresolved quarantine. The final SQL-backed suite passed
287 tests (0 failed, 0 skipped); 40 live HTTP checks passed. Existing data/history
and schema were preserved. Evidence is in `docs/TEST_RESULTS.xml` and
`docs/API_VERIFICATION.json`. The backend observed-data routes are ready for
integration; the unchanged frontend still uses mock analysis.

The environment and database here already exist. Setup, ingestion, certification
and export commands below are operator reference instructions for a separate
authorized installation/release. Do not run migrations, ingestion/recovery,
full profiling or a large export merely to continue this workspace. Use the
handoff's startup/read-only verification commands instead.

## Windows setup

Requirements: Python 3.13 x64, running default SQL Server instance on `localhost`,
ODBC Driver 18 x64 and a Windows account permitted to connect and create the target
database/tables. SQL Server Developer Edition is for development and testing;
use a correctly licensed edition for a production deployment.
See [Microsoft SQL Server licensing guidance](https://www.microsoft.com/licensing/guidance/SQL).

From PowerShell:

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend\backend'
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
Copy-Item .env.example .env
```

Skip the venv creation/copy if using the environment already prepared here.
`requirements-lock.txt` pins the complete tested environment including test tools.
For runtime only, install `requirements.txt`; for tests, install `requirements-dev.txt`.

Edit `.env`. Windows Authentication requires no username/password. All database
connections use `Trusted_Connection=yes`. `SQL_TRUST_SERVER_CERTIFICATE=false`
verifies the SQL Server certificate by default. For this local Developer Edition
with its self-signed certificate, the prepared ignored `.env` explicitly sets
`SQL_TRUST_SERVER_CERTIFICATE=true`. A deployment should use a trusted certificate
and keep certificate verification enabled.

The CLI and Alembic load `.env` from the working directory. Run commands inside
`backend`, or set environment variables explicitly. An activated venv is optional.
No PowerShell execution-policy change is needed when invoking the Python executable.

```powershell
.\.venv\Scripts\python.exe -m app.cli init-db
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m app.cli seed
.\.venv\Scripts\python.exe -m app.cli check-db
.\.venv\Scripts\python.exe -m alembic check
```

`init-db` creates the database only if absent. If the Windows account lacks CREATE
DATABASE permission, have a database administrator run `sql/create_database.sql`
against `master`; then rerun migrations. Existing tables are never dropped.
Schema name collisions require inspection before applying the initial migration.
Destructive migration downgrades are deliberately disabled. `sql/schema.sql` is
an inspectable schema artifact generated from migrations; use Alembic for installation.

## Run the API

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
Invoke-RestMethod 'http://127.0.0.1:8000/health'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/health/database'
```

Swagger: <http://127.0.0.1:8000/docs>. ReDoc: <http://127.0.0.1:8000/redoc>.
OpenAPI: <http://127.0.0.1:8000/openapi.json>. An exported copy is `docs/openapi.json`.
The API uses synchronous SQLAlchemy sessions in FastAPI worker threads; the
middleware alone is asynchronous. Each request owns a session and failed requests
roll back. Connections are pooled with liveness checks and bounded overflow.

## Import the source

Configure only these server-side variables; HTTP clients cannot select a file:

```dotenv
DATA_FILE_PATH=C:/Users/abdel/Downloads/Earth Trend/EarthTrend_Unified/spatial_fusion_v2_fixed/earthtrend_spatial_fusion_v2.csv
AUDIT_FILE_PATH=C:/Users/abdel/Downloads/Earth Trend/EarthTrend_Unified/spatial_fusion_v2_fixed/spatial_fusion_audit.json
IMPORT_BATCH_SIZE=2000
```

```powershell
# Bounded pilot: prints its job_id, imports 10,000 source records, then pauses.
.\.venv\Scripts\python.exe -m app.cli import --max-rows 10000
# Resume that exact job to EOF; use the ID printed above.
.\.venv\Scripts\python.exe -m app.cli import --job-id '<job-id>'
# Start a separate, idempotent import of the whole configured file.
.\.venv\Scripts\python.exe -m app.cli import
```

`--max-rows` counts newly examined records per invocation, including rejected and
duplicate records. A completed job is a no-op when resumed. A new job importing
the same SHA256 skips identical `(version, cell, date)` records. A different value
at an already-seen key is rejected and logged rather than overwriting data.
Resume always verifies the entire file hash, then streams past the saved CSV
record index. This is bounded-memory but costs a sequential scan of the prefix.

Each batch commits observations, logs, quality counts and checkpoint together.
Failed/paused jobs can resume; a crashed `running` job can be recovered using the
CLI with its same ID. SQL Server session application locks serialize ingestion
across processes and release on connection termination. The original files are
never modified. Source CSVs, virtual environments, private `.env` and logs are
ignored by Git. The supplied audit's counts are provenance, not validation results.

For HTTP submission, configure a random `IMPORT_API_KEY` in `.env` and restart the
API. Do not commit the secret. POST returns 202 only after a durable job is saved:

```powershell
# Set $env:IMPORT_API_KEY to the same configured secret in this shell first.
Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8000/api/v1/imports' `
  -Headers @{ 'X-Import-Key' = $env:IMPORT_API_KEY } -ContentType 'application/json' -Body '{}'
# In another shell, run the durable queue consumer:
.\.venv\Scripts\python.exe -m app.cli worker
# Or consume at most one queued job:
.\.venv\Scripts\python.exe -m app.cli worker --once
```

To queue a paused/failed job, POST `{"resume_job_id":"<job-id>"}`. To replay its stored
quarantine payloads, POST `{"retry_quarantine_job_id":"<source-job-id>"}` instead.
These operations are mutually exclusive. Arbitrary paths
and extra body fields are rejected. Submission is disabled if no secret is set.
GET `/imports/{job_id}` exposes progress and the latest 100 safe log messages;
the importer caps per-row detail at 1,000 messages and keeps cumulative rejection
counts. Every rejection is also retained in uncapped `import_quarantine` with its
original strings and source identity; the 1,000-message limit applies only to
diagnostic logs. `/quality/reports` exposes backend-measured coverage and validation scope.
`/imports/{job_id}/batches` and `/imports/{job_id}/quarantine` return paginated audit
metadata; the public quarantine route excludes raw payloads.

A job retired with `VALIDATION_POLICY_UPDATED` cannot resume after its old
checkpoint: start a new idempotent import so previously rejected rows are examined
again. The historical job and its failure counters remain available for audit.

For targeted recovery, use the stored quarantine rather than rereading valid rows:

```powershell
.\.venv\Scripts\python.exe -m app.cli retry-quarantine --source-job-id '<source-job-id>'
# Resume that scoped job with its printed ID:
.\.venv\Scripts\python.exe -m app.cli retry-quarantine --source-job-id '<source-job-id>' --job-id '<replay-job-id>'
```

Full-file and scoped jobs keep separate counters. Each batch enforces
`processed = inserted + duplicates + rejected` in SQL and commits with observation,
quarantine, provenance and checkpoint changes. Scoped-job completion alone does
not certify the full dataset.

## Certify and export for the ML specialist

The immutable CSV is the raw landing layer; SQL observations are the validated
query layer, and quarantines retain exact rejected-source payloads. Measurements
use FLOAT(53), matching a binary floating-point query contract. Exact original
decimal strings remain in the fingerprinted source and would be preserved by
the optional byte-exact export; they are never reconstructed from SQL FLOAT values.
The large clean CSV and `docs/CLEAN_DATASET_MANIFEST.json` do not currently exist.
No duplicate export was generated during backend completion.

```powershell
# Check every source record and profile all original numeric encodings:
.\.venv\Scripts\python.exe scripts/profile_source.py --expected-sha256 13bc7b3f72aafa247ac0dfab869c9662fa2a2277e7e06d6bb3db4b6dcdbfe44a --expected-rows 7317772
# Independently reconcile SQL cardinality, source ordinals, 14 feature counts and job quality:
.\.venv\Scripts\python.exe -m app.cli validate-dataset --version-id 6
# Writes a NEW file and its .csv.manifest.json; refuses source/existing destinations:
.\.venv\Scripts\python.exe -m app.cli export-clean --version-id 6 --output artifacts/private/earthtrend_validated_v1.csv
```

Use the registered version/SHA for a different source; version `6` identifies the
real dataset imported on this machine. Certification is deliberately conservative:
it requires all source records valid, all source ordinals present once, no pending
quarantine, matching coverage and reconciled insertion counts. It never infers that
an unexplained missing record was a duplicate. Export stays disabled until this
proof is stored. The current all-valid dataset can then be copied byte for byte;
future intentional exclusions need a separately verified export policy.

`GET /api/v1/health/readiness` returns 200 only for a current schema and certified
dataset; otherwise it returns 503 with component states. `data_verified` (and
catalog `dataVerified`) is distinct from merely reaching the end of an import.
`docs/INGESTION_VALIDATION.json` is the existing reconciliation evidence. A future
successful clean export would copy its manifest to `docs/CLEAN_DATASET_MANIFEST.json`.

For typed model inputs, use read-only `earthtrend_db.dbo.ml_features_v1`: it exposes
51 named fields, raw measurements, normalized 0/1/NULL QA, nullable QC, source
identity and explicit temporal references. The view rejects DML. See the handoff
for exact schema, bounded SQL consumption, source splits and leakage constraints.
The optional clean CSV would retain the original 43-column schema and strings.

## API contract

Swagger/OpenAPI defines typed success responses for every resource, including
nullable extents, study periods, missing measurements, and unsupported statistical
inference. Catalog camelCase fields and resource pagination retain their existing
JSON shapes. Safe provenance and quality metadata remain extensible. Dataset
catalogs select the newest version certified under the current validation policy;
a newer populated but uncertified version does not replace the published version.
`dataVerified` identifies certification separately from `importComplete`.

All data routes are under `/api/v1`. Liveness aliases `/health` and
`/health/database` also exist at the root.

| Group | Routes |
| --- | --- |
| Geography | `GET /regions`, `/regions/{id}`, `/regions/{id}/cells`, `/locations` |
| Observations | `GET /indicators`, `/variables`, `/observations`, `/observations/{id}` |
| Dashboard | `GET /dashboard/summary`, `/dashboard/environmental-overview`, `/dashboard/data-coverage` |
| Analysis | `GET /analysis/trends`, `/analysis/trends/{region_id}`, `/analysis/compare` |
| Data management | `GET /datasets`, `/datasets/{id}`, `/imports`, `/imports/{id}`, `/quality/reports`; `POST /imports` |
| Unavailable legacy workflows | Experiment and session routes return HTTP 501 with an explicit error |

`/regions`, `/datasets`, `/variables` and `/indicators` return bare arrays.
`/variables` is the day/night temperature compatibility catalog; `/indicators`
also includes vegetation and GHSL without imposing a day/night classification.
Regions/datasets carry pagination in `X-Total-Count`, `X-Page`, `X-Page-Size`.
Other paginated endpoints return `{items,total,page,page_size,...}`.
Errors return `{code,message,status,request_id}`. Validation responses omit raw
user inputs and database exceptions never disclose connection strings or paths.
Empty data is represented by empty arrays, nullable values and explicit availability.

Observation filters: `region_id`, `cell_id`, `indicator`, `start_date`, `end_date`,
`year`, `month`, `data_source` (`terra`, `aqua`, `ghsl`), `dataset_version_id`.
Pagination: `page` and `page_size` (maximum 500); `sort=date|id|cell_id` and
`order=asc|desc`. Observation dates are fusion attachment dates. An indicator
filter returns nonmissing values of that indicator. Without one, nullable
measurements remain visible. Selecting a source returns its measurement columns.
Spatial bounding-box filters are `west`, `south`, `east`, `north` in geographic
degrees. Supply all four with increasing bounds; they select source centroids,
not polygon overlap. The same filters work on the generic trend endpoint.

An analysis requires a source column as `indicator`. Date filters on lagged
context refer to its source calendar month; see statistical methods for interval
precision, equal-cell averaging, denominators and inference assumptions.

```powershell
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/observations?indicator=terra_lst_day_c&page_size=5'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/analysis/trends?region_id=hurghada-study-area&indicator=terra_lst_day_c&start_date=2003-01-01&end_date=2024-12-31'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/analysis/compare?indicator=terra_lst_day_c&period_a_start=2003-01-01&period_a_end=2007-12-31&period_b_start=2020-01-01&period_b_end=2024-12-31'
```

Observation, dashboard and analysis reads default to the newest current-policy
certified version. The published version in this workspace remains `6`. Pass
`dataset_version_id` to pin a certified release. An unknown explicit version returns
404; an uncertified explicit version returns 409. A default data read returns 503
when no certified version exists. Import EOF alone does not publish a version.

An operator preview requires all three: an explicit `dataset_version_id`,
`allow_uncertified=true`, and an `X-Import-Key` header matching the server's existing
`IMPORT_API_KEY`. The preview flag without a version returns 422; missing or invalid
credentials return 401 when the key is configured. Preview is disabled with 503
when no key is configured. Observation detail is also publication-gated: its
explicit `/observations/{id}` selection can be previewed with
`allow_uncertified=true` and the same header. A preview is provisional data, not
release certification. Responses with version-status fields return
`data_verified=false` and an uncertified-data warning even after import EOF.
Raw observation list/detail shapes are unchanged; their preview context comes
from the explicit request.

`GET /analysis/trends`, its region-specific form, and `GET /analysis/compare` are
read-only. Each response has a fresh ephemeral `analysis_id`; it does not save a
run or promise later result retrieval. Existing stored history is preserved.
An explicit authenticated POST workflow for saved analyses is not implemented;
it requires a separately approved design. Retain the response, selected version,
filters and method metadata when recording a computation outside the server.

The unchanged frontend cannot currently run a truthful backend-driven workflow.
Its static data and local analysis remain active in live mode. Do not treat its
existing charts or tourism claims as results of this API. The exact compatibility
and blocked UI work are documented in `docs/FRONTEND_CONTRACT.md`.

## Validation

```powershell
.\.venv\Scripts\python.exe -m pytest -q
# Real SQL Server integration tests use transactions/savepoints and roll back fixtures.
$env:RUN_SQL_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m ruff check . --exclude .venv
.\.venv\Scripts\python.exe -m alembic check
.\.venv\Scripts\python.exe -m pip check
```

No secondary database engine is used, including in tests. Unit fixtures explicitly
identify synthetic data and never populate production tourism observations.

The repository workflow `.github/workflows/backend-tests.yml` runs on Windows
with Python 3.13 for backend changes and manual dispatch. It installs the locked
dependencies, checks package compatibility, runs Ruff, and executes pytest with
SQL Server integration fixtures skipped. Run the opt-in integration command
above against a migrated local SQL Server before releasing database changes.

## Operations and extension

Observation insertion uses uniform nullable parameter batches and pyodbc
`fast_executemany`, without ORM object creation per source row. The largest table
has SQL Server PAGE compression, a unique version/date/cell key and a cell/date
index. Keep batch sizes within available process/ODBC memory; 2,000 is the tested
default. Analytics aggregate in SQL and materialize at most 1,200 monthly points.
Coverage/dashboard scans and deep offset pagination can be expensive on millions
of rows; use date/version filters and review actual query plans before public load.
There is no precomputed materialized aggregate cache or pagination snapshot.

Implementation references: [SQLAlchemy's SQL Server pyodbc dialect](https://docs.sqlalchemy.org/en/20/dialects/mssql.html#fast-executemany-mode)
and [SQL Server data compression](https://learn.microsoft.com/en-us/sql/relational-databases/data-compression/data-compression?view=sql-server-ver17).

The local server binds to loopback by default. A deployed service needs the
organization's HTTPS, access controls, throttling, durable worker supervision,
backups and observability. Import authorization controls HTTP mutation only;
operators with local CLI/database access are trusted. CORS is an origin policy,
not authorization. Structured logs contain request IDs, route templates, timing
and safe ingestion codes; UTC database timestamps use `DATETIME` conventions.

Future models should consume version-pinned aggregates behind a separate service
with model/version/training-data provenance. Do not reuse descriptive OLS fits as
forecasts. Future tourism integration has empty, constrained observation tables
with source/version attribution; ingest verified data and define an analysis
method before implementing impact or causal services.
