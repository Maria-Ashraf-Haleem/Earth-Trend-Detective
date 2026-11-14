# Backend completion and verification report

Verified 13 November 2026. Continue from the existing workspace and database.
The full continuation record is [the backend handoff](BACKEND_HANDOFF_README.md).

## Result

**VERIFIED COMPLETE:** API/CLI replay initialization/resume, certified dataset
publication, and non-mutating analysis GETs. The final SQL-backed suite passed
**287 tests, 0 failed, 0 skipped** in 21.61 seconds. **40 live HTTP checks passed**
with response-model validation and independent SQL/certification assertions.
No required verification test is blocked.

Data, source CSV, certification, saved history, and schema were preserved. No
production ingestion/recovery, large export, training, frontend change, commit,
push, or deployment occurred. Existing backend and workflow files remain
untracked in the original clone; this is not a committed release.

## Fixes

- Fresh replay scopes initialize in the worker; snapshot limits, counters,
  checkpoints, source/version and quality status stay consistent across retries.
  Conflicting/corrupt state is rejected without resetting progress. API resume
  queues job/report together; CLI malformed dispatch is sanitized and mistyped
  new source IDs leave no queued orphan. Regression tests execute API/CLI through
  the actual worker on a guarded rollback connection.
- Default reads and catalogs select the latest timestamped, reconciled version
  under the current policy, using strict Boolean/policy checks. Failed historical
  attempts do not hide certified version 6. An explicit unpublished preview
  requires explicit selection, `allow_uncertified=true`, and the operator key.
- All three analytical GETs preserve successful response fields but no longer
  insert, flush or commit history. `analysis_id` is a fresh ephemeral UUID.
  Old saved history remains; explicit analysis saving is not implemented.
- Trend indicator is required/nonempty in OpenAPI and runtime. Calendar filling
  handles a valid terminal December without advancing beyond Python date limits.

## Protected database

SQL Server 2025 Developer Edition, Windows Integrated Authentication, ODBC Driver
18, synchronous SQLAlchemy 2.x; database `earthtrend_db`.

| Evidence | Final state |
| --- | --- |
| Alembic | `f932c7a14d58`, unchanged |
| Relations | 18 application tables plus `alembic_version`; 51-column `dbo.ml_features_v1` |
| Published version | 6 |
| Observations / cells | 7,317,772 / 7,231 |
| Observed period | 2003-01-01 through 2024-12-26 |
| Quarantine | 232,769 resolved; 0 pending |
| Saved history | 1 run, 1 trend result, 0 comparisons, 0 summaries |
| Source | 1,943,874,389 bytes; 43 columns |
| Observation indexes | Four enabled PAGE-compressed indexes, unchanged |

Certification: `fusion-v2-nullable-sensor-qa-2026-11-13`, timestamp
`2026-11-13T07:53:44.437Z`, reconciled true.
Source SHA256:
`13bc7b3f72aafa247ac0dfab869c9662fa2a2277e7e06d6bb3db4b6dcdbfe44a`.

The earlier complete source pass and independent reconciliation are recorded in
[SOURCE_PROFILE.json](SOURCE_PROFILE.json), [INGESTION_VALIDATION.json](INGESTION_VALIDATION.json)
and the persisted certificate. That expensive work was not repeated. This run
checked live selection, all 14 coverage totals, bounded actual observations,
metadata row counts, revision/view and unchanged certificate/history. Source
size was checked; the stored SHA was not recomputed over the full source now.

## Executed checks

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend\backend'
$env:RUN_SQL_TESTS='1'
.\.venv\Scripts\python.exe -m pytest -q --junitxml=docs/TEST_RESULTS.xml
.\.venv\Scripts\python.exe scripts/verify_api.py
.\.venv\Scripts\python.exe -m alembic check
.\.venv\Scripts\python.exe -m ruff check . --exclude .venv
.\.venv\Scripts\python.exe -m pip check
```

[TEST_RESULTS.xml](TEST_RESULTS.xml) records 287 passed, no failures/errors/skips.
[API_VERIFICATION.json](API_VERIFICATION.json) records 40 passing live GET checks,
unchanged protected state before/after, and the matching post-test check. Ruff
and dependency checks passed; Alembic reported no new upgrade operations. No
migration was executed. Earlier 59/122-test subsets are superseded by this result.

Fixtures own an outer SQL transaction/savepoints and share controlled worker/API
connections. New workflow tests reject escaped writes/DDL. Fixture rows roll back;
SQL identity seeds may advance, leaving gaps. One non-failing upstream
Starlette/httpx deprecation warning remains. Remote GitHub CI, deployment/load
verification, full revalidation/export and frontend end-to-end work were not run.

## Measured latency

Final loopback samples, not percentiles, identified query-plan diagnoses, or a
production SLA:

| Request | Milliseconds |
| --- | ---: |
| One cell, one observation date, page size 2 | 10.83 |
| Full-region dashboard summary | 13,693.34 |
| Full-region environmental overview | 9,864.11 |
| Full-region coverage | 8,717.57 |
| One-cell 12-month LST trend | 113.31 |
| Regional 12-month LST trend | 6,606.74 |
| Regional two-period comparison, one month each | 12,600.13 |

Large scans/aggregation and wide-row measurement access are plausible costs;
cache, blocking, CPU, reads and actual plans have not been separated. Exact
counts do work even with a small response. Capture plans/reads/CPU/waits before
choosing any index or derived-data design. No such database change was made.

## Integration readiness and remaining issues

**VERIFIED COMPLETE:** observed-data/descriptive-analysis routes are ready for
frontend integration. OpenAPI has 35 paths, 37 operations, 40 schemas. Every
implemented GET was exercised live; import submission/execution only used
rollback fixtures. See [FRONTEND_CONTRACT.md](FRONTEND_CONTRACT.md) for inventory,
parameters, models, examples, authentication and errors.

**BLOCKED within this scope:** the existing frontend still seeds/computes local
mock analyses in live mode. It needs a separately authorized frontend assignment.
No existing chart is claimed to be API-driven.

**NOT IMPLEMENTED:** saved-analysis POST/retrieval, legacy experiments/sessions
(501), predictions/training, verified tourism/air-temperature services, production
supervision/deployment, and large clean export/manifest. Certified SQL feature
retrieval works without the optional export. See [ML_HANDOFF.md](ML_HANDOFF.md).

**REQUIRES APPROVAL:** lineage/counter/JSON constraints, Unicode text migration,
numerical indexes/derived monthly data, model-registry schema, and isolation
changes. None was executed. [DATABASE_ARCHITECTURE_REVIEW.md](DATABASE_ARCHITECTURE_REVIEW.md)
remains the historical design snapshot; replay/publication/GET-write findings
are resolved by this execution.

Scientific limits remain: LST is not air temperature; lagged monthly context
retains source-month meaning and is deduplicated; GHSL is a 2020 snapshot gated
to 2021+ source rows; Aqua missing retrieval on 2022-04-07 stays unknown. OLS
inference is exploratory without seasonal/serial/multiple-testing correction.
No tourism causality or forecast is claimed.
