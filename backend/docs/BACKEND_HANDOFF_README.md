# Earth Trend Detective: backend engineering handoff

Verified 13 November 2026 against the existing Windows workspace and SQL Server.
Continue from this state. Do not recreate the database, repeat ingestion, generate
a duplicate large export, edit the frontend, execute migrations, train a model,
or commit/push without separate authorization.

## 1. Executive summary and status

**VERIFIED COMPLETE:** API/CLI replay initialization/resume, certified dataset
publication, and read-only analysis GET behavior. The final SQL-backed suite
passed **287 tests, 0 failed, 0 skipped**. **40 live HTTP checks passed** with
response-schema and content assertions. Existing **7,317,772 observations**,
**7,231 cells**, certification, quarantine and saved history were preserved.
**No database schema changes were made.**

The backend is ready for frontend integration of observed-data and descriptive
analysis routes. The existing frontend still uses mock data and local analysis;
its actual integration is **BLOCKED** by this task's backend-only scope.
Predictions and legacy experiment execution are **NOT IMPLEMENTED**. Large
regional reads have measured latency requiring further performance work.

Status categories used here: **VERIFIED COMPLETE**, **IMPLEMENTED BUT NOT VERIFIED**,
**BLOCKED**, **NOT IMPLEMENTED**, **REQUIRES APPROVAL**. The last category includes
all proposed database design changes; none was executed.

## 2. Exact workspace and repository layout

```text
C:\Users\abdel\Downloads\Backend\
  .github\workflows\backend-tests.yml
  src\                            Existing React/Vite frontend, untouched
  backend\
    .env                          Private configuration; never print/publish
    .env.example
    .venv\                        Existing Python 3.13.2 x64 environment
    README.md
    requirements.txt
    requirements-dev.txt
    requirements-lock.txt
    pyproject.toml
    alembic.ini
    alembic\env.py
    alembic\versions\             Four existing migrations
    app\main.py                   FastAPI routes, auth, logging, errors
    app\schemas.py                Query/response models
    app\models.py                 SQLAlchemy relational mappings
    app\repositories.py           Publication, filters, SQL aggregates
    app\cli.py                    Operator commands and worker dispatch
    app\core\config.py
    app\core\database.py          Engine/session lifecycle
    app\services\analytics.py     Pure descriptive statistics
    app\services\catalog.py       Source/indicator catalog
    app\services\verification.py  Certification and optional export
    app\services\ingestion\       Parser, atomic batches, replay/checkpoints
    scripts\profile_source.py     Existing streaming source profiler
    scripts\verify_api.py         New bounded live GET verifier
    sql\schema.sql
    sql\create_database.sql
    tests\                        Unit and rollback-isolated SQL tests
    docs\                         Contracts, audit snapshots and evidence
```

Git was inspected at original frontend commit `1b8c35a`. `git status --short`
reports untracked `.github/` and `backend/`; `git diff --stat` has no tracked patch
to display. These directories already contained substantial implementation.
Untracked status does not mean new/replaceable work. No commit or push occurred.

## 3. Actual backend architecture

FastAPI uses synchronous SQLAlchemy 2.x/pyodbc with Microsoft SQL Server 2025
Developer Edition on localhost, Windows Integrated Authentication and ODBC Driver
18. No secondary database engine is used. The pool defaults to 5 connections plus
5 overflow, with pre-ping/recycling. Request sessions roll back exceptions and
close reliably. Logs record request IDs, route templates, status and elapsed time,
not query values, keys, private source paths or rejected raw payloads. HTTP errors
are sanitized; CORS origins are explicit and credential cookies are disabled.

HTTP import submission queues a durable operator job. A CLI worker executes it
under a SQL application lock. Observations, detailed quarantine, lineage, quality
counters and checkpoints commit atomically per bounded batch. Source strings,
ordinals and canonical hashes are preserved. SQL numerical measurements are
FLOAT(53); exact source decimal lexemes remain in the protected CSV.

Analysis aggregates in SQL: one cell/source-month value, then an equal-cell
regional mean. Python receives at most 1,200 monthly points for descriptive
OLS/comparison. GETs do not persist analyses. `analysis_id` is an ephemeral UUID;
retain the response, version, filters and method metadata for external provenance.

## 4. Verified database state and relations

Database: **`earthtrend_db`**. Alembic revision: **`f932c7a14d58`**, unchanged.
Existing revision chain: `9381ba7a224e` → `c028a1f6b047` → `e3218df620ab` →
`f932c7a14d58`. `alembic check` reported no new upgrade operations. No migration,
index build, isolation change, DDL or database reset was executed.

| Relation | Final count/state |
| --- | ---: |
| `observations` | 7,317,772 |
| `spatial_cells` | 7,231 |
| `dataset_versions` | 1; ID 6 |
| `datasets`, `regions` | 1 each |
| `data_sources`, `indicators` | 3 / 14 |
| `import_jobs`, `import_batches` | 3 / 12 |
| `import_logs`, `quality_reports` | 2,003 / 3 |
| `import_quarantine` | 232,769, all resolved; zero pending |
| `analysis_runs`, `trend_results` | 1 / 1 |
| `period_comparisons`, `environmental_summaries` | 0 / 0 |
| `locations`, `tourism_observations` | 0 / 0 |
| `alembic_version` | 1 |
| `dbo.ml_features_v1` | View, 51 columns |

There are 18 application tables plus Alembic metadata. All four observation
indexes remain enabled and PAGE-compressed. Observed dates cover 2003-01-01
through 2024-12-26. Observation grain is unique by version/date/cell; version/source
ordinal is also unique. Historical null job/batch lineage links were preserved,
not invented retroactively. New recovery rows retain their actual provenance.

The live probe compared every table count, view-column count, revision, registered
source and certification hash/timestamp before and after GETs. The post-test
bounded check matched that same baseline. These metadata/count checks are not a
new full-table cryptographic checksum of every SQL value.

## 5. Dataset certification and protected source

Dataset: `earthtrend-spatial-fusion-v2`; published version **6**; region
`hurghada-study-area`. Certificate: `reconciled: true`, policy
`fusion-v2-nullable-sensor-qa-2026-11-13`, timestamp
`2026-11-13T07:53:44.437Z`. Input/imported counts are both 7,317,772; source ordinals
1..7,317,772 are complete; all 14 SQL/profile/quality coverage totals agree;
source validation rejected zero rows and unresolved quarantine is zero.

Original source:
`C:\Users\abdel\Downloads\Earth Trend\EarthTrend_Unified\spatial_fusion_v2_fixed\earthtrend_spatial_fusion_v2.csv`.
Size: **1,943,874,389 bytes**, 43 columns. Recorded SHA256:
`13bc7b3f72aafa247ac0dfab869c9662fa2a2277e7e06d6bb3db4b6dcdbfe44a`.

The earlier complete production-parser pass and independent SQL reconciliation
are in [SOURCE_PROFILE.json](SOURCE_PROFILE.json),
[INGESTION_VALIDATION.json](INGESTION_VALIDATION.json), and the stored certificate.
They were inspected, not rerun. Current live coverage matched the certificate.
The source was not modified/copied; size was checked now. The SHA comes from the
earlier full verification, rather than a new whole-file hash in this execution.

Publication requires a timestamp, actual Boolean `reconciled is True`, and exact
current policy. Populated/EOF/failed status alone cannot publish. Historical failed
attempts do not hide certified version 6. Direct SQL operators must preserve
certified content; the certificate is not a tamper-proof database mechanism.

## 6. Completed fixes

1. **Replay initialization:** fresh kind/source-only requests now initialize the
   snapshot in the worker. Max quarantine ID, selection, total, source and version
   stay pinned across interruption, pause, failure and resume. Counters/accounting,
   snapshot membership and processed-prefix checkpoint are checked. Late source
   additions do not move boundaries; completed/empty snapshots remain idempotent.
   Conflicting retries cannot relabel a valid paused job.
2. **Job/report consistency:** replay failures record matching sanitized failed
   status and committed counters. Resume clears stale errors. API resume queues
   job/report together and clears finished time. CLI malformed scope is an audited
   failure rather than an unhandled KeyError/poisoned queue. Mistyped new source IDs
   leave no queued orphan. API and CLI entry points are tested through the worker.
3. **Certified publication:** shared selection protects catalogs, observations
   including detail IDs, dashboards and analysis. Unknown explicit version: 404;
   uncertified explicit version: 409; no published default: 503. Operator previews
   require explicit selection, `allow_uncertified=true`, and `X-Import-Key` matching
   `IMPORT_API_KEY`. No selection: 422; invalid configured key: 401; unconfigured
   key: 503. Version-status responses warn about unpublished data even after EOF.
   Raw observation response shapes are unchanged; preserve preview request context.
4. **GET writes:** trend, region-trend and comparison no longer add/flush/commit
   analysis history. Successful structures and string `analysis_id` remain; IDs
   are ephemeral. Repeated GET tests preserve all four history tables and old rows.
5. **Input/calendar edges:** generic trends require a nonempty indicator in runtime
   and OpenAPI; filling a valid terminal December no longer advances out of range.

## 7. Complete API inventory

[openapi.json](openapi.json): **35 paths, 37 operations, 40 named schemas**.
There are 27 implemented operations and 10 explicit unavailable legacy operations.
Paths below have `/api/v1` prefix except the noted root health aliases.

| Method | Routes | Result |
| --- | --- | --- |
| GET | `/health`, `/health/database` | Liveness/database; also root `/health`, `/health/database` |
| GET | `/health/readiness` | Database/schema/current-certificate checks; 200/503 |
| GET | `/regions`, `/regions/{region_id}` | Metadata array/detail; source centroid bounds |
| GET | `/regions/{region_id}/cells`, `/locations` | Paginated cells / empty named locations |
| GET | `/datasets`, `/datasets/{dataset_id}` | Published version, provenance/version metadata |
| GET | `/indicators`, `/variables` | 14 measurements / 8 source-specific LST variables |
| GET | `/observations`, `/observations/{observation_id}` | Filtered source rows / gated detail |
| GET | `/dashboard/summary` | Actual row/cell/date totals, availability flags |
| GET | `/dashboard/environmental-overview` | Nullable row-weighted attached-source means |
| GET | `/dashboard/data-coverage` | 14 coverage counts and source-row denominator |
| GET | `/analysis/trends`, `/analysis/trends/{region_id}` | Equal-cell monthly series and descriptive OLS/null statistics |
| GET | `/analysis/compare` | Disjoint period summaries and change |
| GET | `/imports`, `/imports/{job_id}` | Job scope/counters, bounded safe logs |
| GET | `/imports/{job_id}/batches`, `/imports/{job_id}/quarantine` | Paginated audit metadata; no raw payload |
| POST | `/imports` | Key-authorized durable queue, 202; separate CLI execution |
| GET | `/quality/reports` | Paginated recorded quality evidence |
| POST | `/experiments`, `/experiments/{id}/run`, `/experiments/{id}/insights` | 501, NOT IMPLEMENTED |
| GET | `/experiments/{id}`, `/experiments/{id}/status`, `/experiments/{id}/results`, `/experiments/{id}/map`, `/experiments/{id}/export` | 501, NOT IMPLEMENTED |
| GET, POST | `/sessions` | 501, NOT IMPLEMENTED |

Swagger `/docs`, ReDoc `/redoc`, and `/openapi.json` are available. JSON errors
contain `code`, `message`, `status`, `request_id`; responses expose request IDs.
Readiness 503 uses its own checks body. Public certified reads need no key. Never
embed the operator key in a public frontend bundle.

Required parameters, response models, filters, examples and errors are in
[FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md). Page size is 1..500, default 100;
generic series are limited to 1,200 slots. Dataset detail's nested version history
is not separately paginated and can grow with future releases; retain that item
in resource-limit review. Current registered version count is one.

## 8. Live API verification outcomes

**VERIFIED COMPLETE:** [API_VERIFICATION.json](API_VERIFICATION.json), started
`2026-11-13T09:21:57Z`, records **40 passing checks**. All 26 implemented GET
operations were exercised with Pydantic response validation. Content assertions
checked certificate row/cell/14-feature totals, independently SQL-selected
observation identity/measurements/nulls, pagination, bounding-box/cell/date
intersections, calendar slots, preserved import/batch/quarantine counters and
quality/job status. No full dataset was loaded into application memory.

The probe verified pagination-limit 422, missing-version 404, implicit-preview
422, GHSL-trend 422, overlapping-period 422, and six legacy GETs returning 501.
It submitted no import or write. Protected state before/after matched. The probe
initially had route-discovery/error-pagination assertion bugs; they were corrected
before the recorded complete passing run. HTTP 200 alone was not treated as proof.

POST imports, preview authentication, no-certificate cases, source-month overlap,
other validation/errors and all legacy methods were verified in isolated API/SQL
fixtures. Production ingestion/recovery was deliberately **not executed**.

## 9. Final automated test results

**VERIFIED COMPLETE:** [TEST_RESULTS.xml](TEST_RESULTS.xml): **287 passed,
0 failures, 0 errors, 0 skipped**, 21.605 seconds; final run began
`2026-11-13T11:23:42+02:00`. Exact command:

```powershell
$env:RUN_SQL_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q --junitxml=docs/TEST_RESULTS.xml
```

Coverage includes nullable QA/integral-decimal parsing, source validation,
duplicates/conflicts, atomic batches, replay snapshots/resume/failure, public
API/CLI dispatch, strict publication, previews, repeated read-only GETs, monthly
context/NULL semantics, comparisons, response/errors, ML view, certification,
small fixture exports and profiler checkpoints. Four malformed-dispatch cases
and the full public queue-to-worker regression are in this final result.

Earlier 59/122-test subsets and older session results are prior evidence,
superseded by this suite. Initial stale readiness/history assertions were updated
for intended publication/read-only behavior: negative readiness isolates its own
logical catalog so certified live version 6 cannot satisfy that negative case.
No implementation defect was suppressed merely to force a passing result.

Ruff **passed**; `pip check` **passed**; `alembic check` **passed**, no new upgrade
operations. One non-failing upstream Starlette/httpx deprecation warning remains.
No required test is blocked. GitHub CI, deployment/load testing, full source
revalidation, large export, training and frontend end-to-end integration were
**not run**. No large clean export is claimed to exist.

## 10. SQL integration isolation and preservation

The final suite used actual migrated SQL Server. `tests/conftest.py` owns an outer
transaction with `create_savepoint` sessions. API dependencies and test CLI/worker
factories share that controlled connection. New workflow tests reject escaped
writes and DDL. Fixtures create distinct versions/UUID jobs, not historical jobs,
and their row changes roll back. Identity seeds can advance despite rollback and
leave gaps; this does not change existing rows or imply zero SQL INSERTs in tests.

After testing, bounded checks matched all 19 table counts, revision, source size,
51-column view and certificate against the live baseline. Pending quarantine was
zero. Source ordinal 1 retained `source_split='train'` and both GHSL values NULL.
Four enabled PAGE observation indexes and 18 domain tables remain. Evidence is in
`post_test_database_check` in [API_VERIFICATION.json](API_VERIFICATION.json).

## 11. Performance assessment

Final loopback HTTP samples, milliseconds; one sample each, not a percentile,
production SLA or identified query-plan bottleneck:

| Query shape | Elapsed ms |
| --- | ---: |
| One-cell observation, 2022-04-07, page size 2 | 10.83 |
| Full-region dashboard summary | 13,693.34 |
| Full-region environmental overview | 9,864.11 |
| Full-region coverage | 8,717.57 |
| One-cell 12-month native LST trend | 113.31 |
| One-cell 12-month lagged NDVI trend | 129.63 |
| Regional 12-month LST trend | 6,606.74 |
| Regional comparison, two one-month windows | 12,600.13 |

Full-region counts/means and cell-month aggregation touch many compressed rows.
Indexed date/cell/version predicates bound ranges, but measurement access can
still touch wide clustered rows. Cache, blocking, reads, CPU and actual plans
have not been separated; these are plausible costs rather than proved diagnoses.
Comparison performs two aggregates pinned to one version. Exact counts/deep
offset pagination can remain expensive despite bounded response sizes.

No unproved cache/index/derived-table/isolation redesign was introduced. Capture
plans, logical reads, CPU, waits and write/storage costs before choosing an
optimization. `SQL_TIMEOUT` controls connection establishment, not statement
execution duration; request/query budgets are remaining application work.
[PERFORMANCE_REVIEW.md](PERFORMANCE_REVIEW.md) is the earlier historical review;
the current timings above supersede its partial-import timing evidence.

## 12. Frontend integration requirements

Frontend source is unchanged. `src/services/api/earthtrend.ts` provides catalog
and legacy HTTP methods, while pages import static catalogs and
`src/store/useLabStore.ts` seeds results and invokes local `analyzeDemo` even with
`VITE_DEMO_MODE=false`. The client discards structured error bodies and always
parses JSON, including its declared Blob export helper. Configuration alone does
not integrate real analysis.

**VERIFIED COMPLETE:** catalogs, cells, observations, dashboards/coverage and
descriptive-analysis contracts are ready for a new live frontend path. Use actual
IDs, certified version pinning, nullable statistics and error/availability states.
Ordinary UI reads need no operator key. Replace mock seeding/execution and wire
requests in a separately authorized frontend task. No existing chart is claimed
to be backed by this API. Saved experiments, sessions, predictions and tourism
insights have no working service. See [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md).

## 13. ML readiness and scientific limits

**VERIFIED COMPLETE:** bounded certified SQL extraction from the existing
51-column `dbo.ml_features_v1`, including source identity, calendar/spatial fields,
14 measurements, QA and source split. Pin version 6. Preserve upstream temporal
splits: train 2003-2018, validation 2019-2021, test 2022-2024; random row splits risk
spatial/temporal leakage. No split or original source value was changed.

**NOT IMPLEMENTED:** trained model/prediction API, model-artifact registry,
tourism targets/causality, verified air-temperature sources and large clean CSV
delivery. `artifacts/private/earthtrend_validated_v1.csv` and
`docs/CLEAN_DATASET_MANIFEST.json` do not exist. Small fixture exports passed;
SQL retrieval does not require a duplicate multi-gigabyte export.

LST is surface temperature, not air temperature. Previous-month features retain
source-month meaning; repeated attachments are not independent daily samples.
GHSL is a static 2020 snapshot: parser validation rejects populated GHSL before
2021. The view preserves those values rather than independently enforcing the
gate against arbitrary direct SQL edits; certified source/application validation
establishes the current guarantee. GHSL time trends are rejected.

On 2022-04-07 Aqua retrieval/QA remains unknown, never false/zero; independent
Terra, Aqua vegetation/monthly context and GHSL retain their own meaning. OLS uses
elapsed days/365.2425 and Student-t inference, without seasonal/serial/multiple
testing or changing-spatial-support corrections. Missing data remains NULL and
Celsius/index percent changes remain null. There is no forecast, trained model,
Mann-Kendall/Sen service or tourism-causality result. Read
[ML_HANDOFF.md](ML_HANDOFF.md) and [STATISTICAL_METHODS.md](STATISTICAL_METHODS.md).

## 14. Exact backend startup commands

The loopback API is already running on port 8000 after verified startup. Do not
start a second listener. If it is stopped, use the prepared environment/database:

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

From another terminal, read-only checks are:

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend\backend'
.\.venv\Scripts\python.exe -m app.cli check-db
Invoke-RestMethod 'http://127.0.0.1:8000/health'
Invoke-RestMethod 'http://127.0.0.1:8000/api/v1/health/readiness'
.\.venv\Scripts\python.exe scripts/verify_api.py
```

The probe returns bounded data but intentionally measures full-region SQL
aggregates; do not repeat it unnecessarily. Do not run `init-db`, `seed`, `import`,
`retry-quarantine`, `worker`, `validate-dataset`, `export-clean` or `alembic upgrade`
merely to resume verification. They are write/recovery/release operations and the
protected dataset needs no recovery.

## 15. Exact testing commands

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend\backend'
$env:RUN_SQL_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q --junitxml=docs/TEST_RESULTS.xml
.\.venv\Scripts\python.exe -m ruff check . --exclude .venv
.\.venv\Scripts\python.exe -m pip check
.\.venv\Scripts\python.exe -m alembic check
```

Without `RUN_SQL_TESTS=1`, integration fixtures intentionally skip; that is not a
verified SQL integration run. Preserve rollback isolation for new worker/write
tests. The prepared dependencies are installed; no new dependency was added.

## 16. Environment variable names

Do not print `.env`. Names only, with no private values:

```text
SQL_SERVER
SQL_DATABASE
SQL_DRIVER
SQL_ENCRYPT
SQL_TRUST_SERVER_CERTIFICATE
SQL_TIMEOUT
POOL_SIZE
CORS_ORIGINS
IMPORT_API_KEY
DATA_FILE_PATH
AUDIT_FILE_PATH
IMPORT_BATCH_SIZE
LOG_LEVEL
RUN_SQL_TESTS
```

Defaults exist; local `.env` provides configured connection/path settings.
`IMPORT_API_KEY` optionally enables operator submission/previews. Windows
authentication requires no SQL-password variable. `RUN_SQL_TESTS` controls tests.
Frontend-only names are `VITE_API_BASE_URL`, `VITE_DEMO_MODE`; changing them does
not remove mock execution.

## 17. Remaining defects and unexecuted database proposals

| Status | Remaining work |
| --- | --- |
| VERIFIED COMPLETE | Critical requested backend fixes and safe tests; no remaining required test failure |
| BLOCKED | Existing frontend live integration requires edits excluded from this assignment |
| NOT IMPLEMENTED | Explicit authenticated saved-analysis POST/retrieval; legacy experiments/sessions stay 501 |
| NOT IMPLEMENTED | Predictions/training, tourism/air-temperature services, large clean export/manifest |
| IMPLEMENTED BUT NOT VERIFIED | Existing remote Windows CI workflow; no GitHub run/push occurred |
| BLOCKED | Production readiness cannot be claimed without deployment, load, backup/restore and worker-supervision verification |
| REQUIRES APPROVAL | Composite lineage FK/coherence, cumulative job accounting and JSON validity constraints identified by the audit |
| REQUIRES APPROVAL | Unicode text migration for human VARCHAR/codepage1252 fields and numeric semantic/schema refinements |
| REQUIRES APPROVAL | Numerical covering indexes, normalized snapshot/derived monthly data, model-registry schema and isolation changes |

No proposed migration was created or executed. Slow regional queries, absence of
statement deadlines, and growing nested version-history metadata remain application
resource concerns. No organization authorization framework or internet deployment
is claimed. [DATABASE_ARCHITECTURE_REVIEW.md](DATABASE_ARCHITECTURE_REVIEW.md)
remains the authoritative prior design snapshot; its replay/publication/GET-write
findings are resolved by this execution and should not be reimplemented from its
historical behavior descriptions.

## 18. Files modified during this fix/verification execution

```text
backend/app/main.py
backend/app/schemas.py
backend/app/repositories.py
backend/app/cli.py
backend/app/services/ingestion/pipeline.py
backend/tests/conftest.py
backend/tests/test_api.py
backend/tests/test_compare_boundaries.py
backend/tests/test_monthly_repository.py
backend/tests/test_quarantine.py
backend/tests/test_readiness_audit_api.py
backend/README.md
backend/docs/FINAL_REPORT.md
backend/docs/ML_HANDOFF.md
backend/docs/FRONTEND_CONTRACT.md
backend/docs/openapi.json
```

## 19. Files created during this execution

```text
backend/tests/test_publication.py
backend/tests/test_read_only_analysis.py
backend/tests/test_replay_workflow.py
backend/scripts/verify_api.py
backend/docs/API_VERIFICATION.json
backend/docs/TEST_RESULTS.xml
backend/docs/BACKEND_HANDOFF_README.md
```

These lists describe this execution, not all Git-untracked files. Models,
migrations, schema artifacts, original source, source profile, reconciliation and
frontend were not rewritten for these fixes.

## 20. Prioritized next steps and evidence

1. Authorize the separate frontend integration assignment, remove unconditional
   mock execution and connect the documented observed-data routes. Render nullable
   results honestly and keep unavailable workflows explicit.
2. Capture regional plans/reads/CPU/waits on a controlled workload before choosing
   a performance change. Obtain database design approval for indexes, derived
   data or isolation; these measurements do not authorize them.
3. Review outstanding lineage/Unicode/constraint designs from the existing audit
   separately. Preserve certified version 6 and all source/audit/history assets.
4. If persistent analysis is needed, approve an explicit save action with version,
   filters and method provenance. Review any schema changes first. Ephemeral GET
   IDs do not imply a saved-result lookup.
5. For future ML work, use the bounded SQL extraction in ML_HANDOFF, preserve
   temporal/spatial splits and define valid labels/availability/methods first.
   Do not infer a prediction service or clean export from feature readiness.

| Important completion claim | Evidence |
| --- | --- |
| Replay API/CLI state machine | `tests/test_quarantine.py`, `tests/test_replay_workflow.py`, final JUnit |
| Certified publication and previews | `tests/test_publication.py`, `tests/test_read_only_analysis.py`, readiness tests |
| GET history preservation/response compatibility | Repeated-route SQL tests, `tests/test_api.py`, live before/after history counts |
| SQL/source/NULL coverage fidelity | Live content assertions, parser/monthly/ML-view/verification tests, prior complete reconciliation |
| Final automated suite | [TEST_RESULTS.xml](TEST_RESULTS.xml), 287 passed/0 failed/0 skipped |
| Live API/timings/protected state | [API_VERIFICATION.json](API_VERIFICATION.json), 40 passed plus post-test checks |
| Current contracts/schemas | [openapi.json](openapi.json), [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md) |
| Certified source/scientific limitations | [INGESTION_VALIDATION.json](INGESTION_VALIDATION.json), [ML_HANDOFF.md](ML_HANDOFF.md) |
| Database design/unexecuted proposals | [DATABASE_ARCHITECTURE_REVIEW.md](DATABASE_ARCHITECTURE_REVIEW.md) |

No full ingestion, full profiling, architecture reaudit, large export, schema
change, frontend rewrite or model run is needed to finish this backend task.
