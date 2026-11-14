# EarthTrend Lab: frontend integration report

Updated: 14 November 2026. Workspace: `C:\Users\abdel\Downloads\Backend`.

**Overall status: IMPLEMENTED BUT NOT VERIFIED as a browser demonstration.** The live frontend integration is implemented, bounded real HTTP reads and the low-level API client tests passed in the earlier integration phase, and the latest task reports a successful pre-repair TypeScript/Vite build. Fresh repair verification remains separate. Browser verification is currently **BLOCKED** by the available tooling; no successful browser Analyze flow is claimed.

`ROOT_FINAL_VERIFICATION`: Replace pending entries with the fresh command results, actual HTTP/database evidence, measured performance changes, and precise remaining browser limitations before the handoff is finalized. See [PRODUCTION_READINESS_REPORT.md](PRODUCTION_READINESS_REPORT.md) for the latest full-stack A-H repair report.

This report covers the frontend integration work and its latest repair verification. The [backend handoff](../backend/docs/BACKEND_HANDOFF_README.md) remains a historical record of the earlier backend-only task; its statement that frontend integration was outside that task's scope does not describe the implementation documented here. The initial integration phase did not change backend business logic, migrations, SQL Server schema, ingestion, or source observations. The broader repair phase is documented separately in the production readiness report. No commit or push was made.

## 1. Frontend architecture

The existing React, Vite, TypeScript, React Router, Tailwind, Zustand, React Query, React Leaflet, and Plotly application is preserved. Existing route structure, themes, navigation, cards, fields, and chart/map libraries remain in use. No project dependency or frontend framework was added.

| Layer | Implementation and responsibility |
| --- | --- |
| Routes | `src/app/router.tsx`: Overview, Explorer, Analyze wizard, Results, Compare, local analysis history, Evidence companion, Methodology, and Settings. Pages remain lazy loaded. |
| HTTP transport | `src/services/api/client.ts`: public configurable origin, one `/api/v1` prefix, real fetch requests, structured `ApiError`, AbortController propagation, and a 60-second default deadline. |
| Environmental adapter | `src/services/api/environment.ts`, re-exported from `earthtrend.ts`: documented GET methods and runtime response validation. These methods always use HTTP and have no generated-data fallback. |
| Contracts | `src/types/environment.ts` and `src/services/api/schemas.ts`: exact backend field names, nullable measurements and inference, numeric source cell IDs, actual coordinates, paginated payloads, and bounded monthly series. Zod was already a project dependency. |
| Query state | `src/hooks/useEnvironment.ts`: shared catalog/query keys, 5-minute freshness, 30-minute cache retention, no window-focus refresh, and no automatic retries. Explicit page actions initiate expensive analysis and coverage reads. |
| Analysis state | `src/store/useLabStore.ts`: validates supported configuration, captures exact version/date/cell/bbox request scope, retains real responses locally, prevents concurrent Analyze requests, and cancels the active request. |
| Presentation | Existing components plus `LiveDataState` and `LiveStudyMap`: loading/error/empty states, source-center maps, actual monthly series with gaps, and nullable statistical readouts. |

`VITE_API_BASE_URL` defaults to `http://127.0.0.1:8000`. Both the documented origin and a base accidentally ending in `/api/v1` resolve correctly without duplicating the version prefix. Live behavior is the default; `VITE_DEMO_MODE=false` is shown in `.env.example`. Routed analysis does not switch to a mock implementation even if a request fails.

The browser receives no database credentials, connection strings, or `IMPORT_API_KEY`. Certified public reads require no operator key. Error handling preserves backend `code`, `message`, status, and request ID, including 404, 409, 422, 501, and 503. Timeout and connection failures are actionable errors, never synthetic successful results.

## 2. Pages connected to real APIs

**Status: IMPLEMENTED BUT NOT VERIFIED in the browser.** The underlying bounded HTTP checks listed in section 6 are **VERIFIED COMPLETE**.

| Page | Real behavior |
| --- | --- |
| Overview `/` | Loads real catalogs and the selected certified region's observation/cell/date summary. Regional row coverage and attached-source means load only when requested. HeroPlate plots a bounded page of actual source coordinates. |
| Explorer `/explorer` | Loads actual region metadata and paginated source cell centers. An explicit Apply action requests dated raw observations and monthly descriptive trends. Actual cell IDs, exact dates, pinned version, and an optional visible-extent bbox scope queries. |
| Analyze `/lab` | Three-step Data / Method / Review wizard uses catalog choices and historical date bounds. Analyze calls the real monthly trend endpoint through the store, displays elapsed request time, supports cancellation, and opens the returned local report. |
| Results `/results/:experimentId` | Reads only stored real API responses. Shows actual monthly values, nullable OLS statistics, support counts, warnings, request provenance, a bounded neutral source-center map, and CSV/JSON exports. |
| Compare `/compare` | Submits two explicit, disjoint historical periods for the selected region, indicator, and certified version. Shows actual aggregate summaries, differences, nullable inference, methodology, and warnings. |
| Local history `/experiments` | Lists real responses retained in this browser. Open, configuration copy, and deletion operate locally; they do not call legacy server experiment execution. |
| Evidence companion `/insights` | Describes the actual active response and displays its methodology/warnings. Predictive or generated AI interpretation is marked unavailable. |
| Settings `/settings` | Checks real service readiness; shows public configuration and local browser storage controls. |
| Methodology `/methodology` | Explains the implemented source-month aggregation, exploratory OLS, missingness, and scientific limitations. It does not manufacture API results. |

## 3. Exact endpoint mapping

All routes below are real GET requests. Query names remain those in `backend/docs/FRONTEND_CONTRACT.md` and `backend/docs/openapi.json`.

| Endpoint | Client method / use | Parameters sent by live UI or adapter |
| --- | --- | --- |
| `/api/v1/regions` | `getRegions`; catalogs, Overview, HeroPlate, Explorer, Analyze, Compare, Results | Bounded `page_size=100`. |
| `/api/v1/regions/{region_id}` | `getRegion`; Explorer extent/metadata | Actual encoded region ID. |
| `/api/v1/regions/{region_id}/cells` | `getCells`; HeroPlate, Explorer, Analyze, Results | `page`, `page_size`; Explorer/Results/HeroPlate at most 500, wizard list 100. |
| `/api/v1/datasets` | `getDatasets`; certified source/version and date metadata | Bounded `page_size=100`. |
| `/api/v1/indicators` | `getIndicators`; indicator choices, units, source/temporal meaning | None. |
| `/api/v1/variables` | `getVariables`; shared documented catalog | None. |
| `/api/v1/observations` | `getObservations`; Explorer dated source rows | `region_id`, `dataset_version_id`, exact `start_date`/`end_date`, optional `cell_id`, all four optional bbox coordinates, `page`, `page_size=500`, `sort=cell_id`, `order=asc`. The adapter also supports documented optional `indicator`, `year`, `month`, and `data_source`. |
| `/api/v1/dashboard/summary` | `getDashboardSummary`; Overview | `region_id`, `dataset_version_id`. |
| `/api/v1/dashboard/environmental-overview` | `getEnvironmentalOverview`; requested Overview details | `region_id`, `dataset_version_id`. |
| `/api/v1/dashboard/data-coverage` | `getDataCoverage`; requested Overview details | `region_id`, `dataset_version_id`. |
| `/api/v1/analysis/trends` | `getTrend`; Analyze, Explorer | Required `indicator`; `region_id`, `dataset_version_id`, `start_date`, `end_date`, optional `cell_id`, optional complete `west`/`south`/`east`/`north`. |
| `/api/v1/analysis/trends/{region_id}` | `getRegionTrend` and `useRegionTrend` | Implemented typed alternative accepting required `indicator`, optional `start_date`, `end_date`, `dataset_version_id`. Current main UI uses the general trend endpoint to preserve cell/bbox scope; no duplicate regional request is sent. |
| `/api/v1/analysis/compare` | `comparePeriods`; Compare | `indicator`, `region_id`, `dataset_version_id`, `period_a_start`, `period_a_end`, `period_b_start`, `period_b_end`. No unsupported cell or bbox comparison parameter is invented. |
| `/api/v1/health/readiness` | `getReadiness`; Settings | None. |
| `/api/v1/observations/{id}` | `getObservation`; typed detail adapter | Numeric observation ID; not needed by the bounded main presentation flow. |

Important observation behavior: an `indicator` filter excludes rows whose selected measurement is NULL. Explorer therefore requests complete source rows for an exact date without that filter, then reads the selected indicator from `values`. This keeps an absent Aqua measurement distinguishable from a zero measurement or an unloaded page.

## 4. Remaining mock features

**Live mock fallback: removed.** The routed pages, live API adapter, and Analyze store do not import or invoke the legacy synthetic analysis or mock catalogs. An error does not seed a replacement result.

Preserved, unused legacy assets include:

- `src/services/mock/analyze.ts`.
- `src/data/mock/catalog.ts`, `series.ts`, and `insights.ts`.
- `src/data/mock/hurghada_zone_timeseries.json` and `hurghada_map_cells.json`.
- The legacy `StudyMap.tsx` component, retained for compatibility but not used by the live Explorer or Results routes.
- Legacy result types and an explicitly labeled legacy export branch, retained without being selected by real report pages.

These files were not deleted because useful existing components/assets were to be preserved. There is no live demonstration route that silently opts into them. Source import inspection found the legacy mock imports confined to their own mock modules. `earthtrendApi` legacy experiment/session compatibility methods now call their actual server endpoints and expose the backend's unsupported status; the main flow does not invoke them.

## 5. TypeScript and build results

**Status: IMPLEMENTED BUT NOT VERIFIED for the latest repair; prior build success is supplied by the latest task.** Existing `node_modules`, native dependency repairs, and the lockfile are preserved. Reinstallation is not a routine startup step.

| Check | Current evidence |
| --- | --- |
| Historical installation attempt | Earlier `npm ci` failed with `ECONNRESET`. This is retained as historical evidence, not a current reason to delete or reinstall working dependencies. |
| Runtime | The earlier verification setup used official portable Node.js 24.22.3 and npm 11.19.1. Final commands must record the runtime actually used. No runtime executable is a project source dependency. |
| Existing repaired dependencies | The latest task identifies repaired `lightningcss-win32-x64-msvc` and `@tailwindcss/oxide-win32-x64-msvc` and a successful 2,389-module build. Preserve those repairs. No project dependency was added during the initial integration. |
| Type checking | Latest task reports pre-repair PASS; fresh `npm.cmd run typecheck` pending. |
| Production build | Latest task reports pre-repair PASS; existing production assets were observed. Fresh `npm.cmd run build` pending. |
| Patch whitespace | `git diff --check` passed for Explorer, HeroPlate, and LiveStudyMap at implementation review. Root-wide final check pending. |

`ROOT_FINAL_VERIFICATION`: Record fresh typecheck/build commands, exit codes, output summaries, and production bundle warnings. Distinguish the user-supplied baseline build from commands executed in this repair phase.

## 6. Integration test results

### VERIFIED COMPLETE: recorded bounded checks

The API engineer ran **13 passing low-level client tests** covering base-path normalization, JSON NULL versus zero, absence of operator credentials, structured 404/409/422/501/503 errors, non-JSON error bodies, explicit cancellation, timeout abort, malformed success JSON, network failure, and explicit file response handling.

Read-only HTTP checks against the running FastAPI service verified the real certified catalogs, bounded cells/observations, actual monthly trends, and structured missing-region errors. These are direct service/adapter contract checks, not proof of browser rendering.

An additional Explorer-shaped read check verified:

| Request/assertion | Result |
| --- | --- |
| `GET /api/v1/regions` | Actual `hurghada-study-area` metadata returned. |
| `GET /api/v1/regions/hurghada-study-area/cells?page=1&page_size=500` | 500 actual cell centers from a total of 7,231; measured 38.47 ms in that local check. |
| `GET /api/v1/observations?region_id=hurghada-study-area&dataset_version_id=6&start_date=2022-04-07&end_date=2022-04-07&page=1&page_size=500&sort=cell_id&order=asc` | 500 real source rows; all 500 IDs aligned with the loaded cell page. All 500 Aqua day measurements remained NULL while Terra values were present; measured 272.61 ms. |
| `GET /api/v1/analysis/trends?region_id=hurghada-study-area&cell_id=18&dataset_version_id=6&indicator=terra_lst_day_c&start_date=2022-01-01&end_date=2022-12-31` | 12 actual monthly points, `data_verified=true`, pinned version 6; measured 100.14 ms. |

These timings describe one bounded local check, not a regional-query benchmark or guaranteed latency.

### IMPLEMENTED BUT NOT VERIFIED: final test suite

| Test file | Scope | Final status |
| --- | --- | --- |
| `tests/api-client.test.ts` | The 13 transport regression cases above | Earlier run passed; final suite rerun pending. |
| `tests/environment-schemas.test.ts` | Five runtime-schema cases: null extents, NULL versus zero, unavailable inference, malformed responses, bounded payloads | Pending installed dependencies. |
| `tests/live-workflow.test.mjs` | Main Zustand Analyze flow through the application's Vite SSR loader: exact filters, local namespace isolation, errors, malformed responses, missing slots, cancellation/concurrency, unsupported controls | Pending installed dependencies. These tests use explicitly synthetic HTTP fixtures and are not SQL/browser evidence. |
| `tests/api-live.test.ts` | Two opt-in bounded real adapter tests: certified data/NULL/trend and service errors | Pending `RUN_LIVE_API_TESTS=1` final run. |

There was no existing frontend test script in the original package configuration; the current scripts expose these focused checks. The previous backend suite's 287 passes and 40 HTTP checks are historical backend evidence and are not counted as new frontend tests.

`ROOT_FINAL_VERIFICATION`: Insert final total pass/fail/skip counts and the commands used. Evidence is to be retained in [FRONTEND_VERIFICATION.json](FRONTEND_VERIFICATION.json).

### Database preservation evidence

The bounded baseline in `FRONTEND_VERIFICATION.json` records 7,317,772 observations, 7,231 cells, published version 6, unchanged migration revision `f932c7a14d58`, table counts, certification metadata, registered source hash/size, and the 51-column ML view. No integration action submits an import, creates a server experiment, or trains a model.

`ROOT_FINAL_VERIFICATION`: Record the final bounded after-check and comparison with this baseline. Metadata/count/certificate comparisons establish those properties; they are not a fresh full-table hash of every observation.

## 7. Browser flow results

**Status: BLOCKED.** The browser inventory returned no browsers and reported that its access host was unavailable. Native Edge inspection also stopped because the current browser URL could not be established confidently enough to enforce its policy. No UI action or browser end-to-end pass was performed, and no alternate route was used to bypass that restriction. Direct HTTP and client tests remain separate evidence.

The latest repair check received HTTP 200 from `http://localhost:5173` in 26.13 ms with a 1,200-byte HTML response. That proves HTML transport, not first paint or React/chart/map rendering. The backend initially had no listener on port 8000; after it was started, database health returned 200 and readiness confirmed certified version 6. Detailed final service evidence belongs in the production report.

Required main flow: select Hurghada, choose `terra_lst_day_c`, choose `2022-01-01` through `2022-12-31`, review, click Analyze, receive the actual FastAPI response, and render its monthly chart and statistics. Verify the request's version/date/cell/bbox scope, the resulting URL, units, gaps, and browser console/network errors where tooling permits.

Also verify an error/no-data selection, NULL Aqua data, cancellation, Explorer cell selection and pagination, scope handoff to Lab, comparison, and GHSL trend gating. A single-cell one-year Analyze is a bounded fallback for proving the same real flow if a full regional read exceeds the client deadline; the performance limitation must still be reported.

`ROOT_FINAL_VERIFICATION`: Replace this section with actual browser actions, observed outcomes, screenshots/evidence paths if captured, and precise checks that remained blocked.

## 8. Files modified

The frontend integration patch includes the following files. Existing untracked backend directories predate this task and are not frontend modifications.

| Group | Paths |
| --- | --- |
| Configuration/scripts | `.env.example`, `package.json`, `src/config.ts`. The dependency lock is unchanged. |
| API/contracts | `src/services/api/client.ts`, `earthtrend.ts`, `schemas.ts`; new `src/services/api/environment.ts`, `src/types/environment.ts`; updated `src/types/index.ts`. |
| Queries/state | New `src/hooks/useEnvironment.ts`; updated `src/store/useLabStore.ts`. |
| Existing pages | `src/features/overview/OverviewPage.tsx`, `explorer/ExplorerPage.tsx`, `research-lab/ResearchLabPage.tsx`, `results/ResultsPage.tsx`, `comparison/ComparePage.tsx`, `experiments/ExperimentsPage.tsx`, `ai-insights/AiInsightsPage.tsx`, `methodology/MethodologyPage.tsx`, `settings/SettingsPage.tsx`. |
| Components | `src/components/charts/TimeSeriesChart.tsx`, `common/Field.tsx`, `common/Primitives.tsx`, `feedback/RunProgress.tsx`, `layout/AppShell.tsx`, `layout/CommandPalette.tsx`, `layout/TopBar.tsx`, `maps/HeroPlate.tsx`; new `common/LiveDataState.tsx` and `maps/LiveStudyMap.tsx`. |
| Exports | `src/utils/export.ts`. |
| Tests | New `tests/api-client.test.ts`, `api-live.test.ts`, `environment-schemas.test.ts`, `live-workflow.test.mjs`. |
| Handoff/evidence | New `docs/FRONTEND_INTEGRATION_REPORT.md` and `docs/FRONTEND_VERIFICATION.json`. |

`ROOT_FINAL_VERIFICATION`: Reconcile this list with the final working-tree diff. Generated ignored `node_modules`/`dist` and temporary portable runtime/recovery files are not source patch dependencies.

## 9. Bugs fixed

**Status: IMPLEMENTED BUT NOT VERIFIED end to end unless separately identified in section 6.**

- Removed demo analysis from the real Analyze path and removed mock fallbacks from HTTP adapters. Legacy unsupported endpoints no longer pretend to succeed.
- Corrected API origin/version-prefix handling, live-default configuration, structured errors, runtime response validation, cancellation, and query deadlines.
- Replaced hardcoded environmental dashboard numbers, synthetic HeroPlate values, and illustrative Explorer geometry with actual responses and actual source center coordinates.
- Preserved raw NULL values and observed zero independently. Plotly uses `connectgaps: false`; missing inference remains unavailable. No empty chart receives invented fitted, seasonal, anomaly, or predictive values.
- Corrected units and labels for LST in degrees Celsius, indices, area, observation months, and previous source calendar months. Gray or unloaded markers do not imply a zero or adverse condition.
- Replaced simulated stages/percentages with actual pending state and elapsed time. Concurrent Analyze requests are rejected, route unmount cancels, and the store checks cancellation again after a response resolves before completing it.
- Preserved incoming exact dates, pinned dataset version, cell, and complete bbox when handing a view from Explorer to Lab. An explicit incoming whole-region link clears old cell/bbox draft scope. A changed Lab query string is reprocessed.
- Preserved a linked GHSL selection as unsupported for trend analysis instead of silently changing it to a different indicator. GHSL remains readable as static context in Explorer.
- Selecting a new source cell from the Results region map clears the former report bbox so a cell outside it does not create an unintended empty intersection.
- Kept valid tooltip measurements when observation colors are hidden; the toggle no longer labels a known value as NULL. Unknown monthly coverage does not render a zero-valued meter.
- Isolated live local history from old demo browser data. New analysis storage is `earthtrend-live.v1.analyses.v1`; application preferences use `earthtrend-live.v1.app`. Old local data is neither deleted nor loaded as live observations.
- Corrected CSV export to leave missing values blank; JSON retains the actual response, request configuration, source version, and method metadata. A local copy is not described as a server-saved analysis.

## 10. Remaining problems and limits

| Status | Limit and practical consequence |
| --- | --- |
| BLOCKED | Browser automation cannot establish an allowed browser surface/current URL. Rendering, interaction, responsive layouts, and the complete browser flow cannot be called verified from HTTP checks. |
| IMPLEMENTED BUT NOT VERIFIED | Fresh full suite, production build, performance comparison, and database after-check are pending root verification. Working dependencies are preserved. |
| VERIFIED COMPLETE: backend contract limit | Some regional reads take about 6-14 seconds in prior measurements, and full-history regional reads can take longer. The client deadline is 60 seconds; an actionable shorter-range/single-cell error is shown if it expires. Backend index/schema tuning was not performed. |
| VERIFIED COMPLETE: geometry limit | Cells have source coordinates, not validated cell polygons. The outline is the centroid bounding box, not a surveyed administrative boundary. Neutral Results markers carry no per-cell trend estimate. |
| IMPLEMENTED | Explorer retrieves at most 500 cell centers and 500 raw rows per request; source-cell pages are explicit. Wizard cell choices are the first 100 plus a linked actual ID. Results and HeroPlate show only the first 500 centers and disclose that bound. |
| VERIFIED COMPLETE: selection limit | Cell pages are regional pages. Bbox filters apply to observation and trend requests, while current cell-page points are filtered locally. A bounded observation page may not cover every displayed center; unloaded markers remain neutral. No millions-of-points download or automatic all-page loop occurs. |
| VERIFIED COMPLETE: temporal limit | Available attached observations run from 2003-01-01 through 2024-12-26. Historical inputs use dataset metadata. An exact map date with no acquisition shows no values; the UI does not estimate an intervening observation. |
| VERIFIED COMPLETE: scientific limit | Monthly OLS is descriptive and exploratory. Seasonality, serial dependence, multiple testing, and changing spatial support are not corrected. NULL inference is not evidence of no effect. |
| IMPLEMENTED | Analyses/history are browser-local copies of GET responses. Clearing site data removes them; there is no server experiment execution or durable shared report URL. Only the latest ten completed API responses are persisted. |

## 11. Exact commands to start frontend and backend

Use two PowerShell windows. Reuse the existing SQL Server database, Python environment, backend `.env`, and running service if already available. No initialization, migration, seed, ingestion, or model-training command is needed.

Backend, from the existing prepared environment:

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend\backend'
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Frontend, with Node.js/npm available on PATH:

```powershell
Set-Location 'C:\Users\abdel\Downloads\Backend'
$env:VITE_API_BASE_URL='http://127.0.0.1:8000'
$env:VITE_DEMO_MODE='false'
npm.cmd run dev -- --host localhost --port 5173 --strictPort
```

Open `http://localhost:5173`. The frontend origin is intentional: backend default CORS allows `http://localhost:5173`. The API origin may remain `http://127.0.0.1:8000`. If changing the browser origin, verify the existing backend CORS configuration allows that exact origin. Do not expose private backend settings in `VITE_*` variables.

Use the existing dependencies; do not reinstall them to restart the application. A separate new checkout can use `npm.cmd ci` when dependency installation is actually required. Portable Node users must add their actual extracted runtime directory to PATH in the same shell before these npm commands; no system-wide install is required.

Verification commands from the repository root:

```powershell
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
$env:RUN_LIVE_API_TESTS='1'
npm.cmd run test:integration
Remove-Item Env:RUN_LIVE_API_TESTS
```

The ordinary test command skips opt-in real HTTP tests unless that environment variable is set. Live integration tests read the already running service and do not mutate SQL data.

## 12. Actual environmental features ready for presentation

**IMPLEMENTED BUT NOT VERIFIED as a complete browser presentation** until section 7 records its pass. The following real data paths already have bounded HTTP evidence:

- Certified Hurghada catalog, source version, date coverage, and actual source-center coordinates.
- Dated Terra/Aqua LST observations in degrees Celsius, including truthful Aqua NULLs on `2022-04-07`.
- A bounded `2022-01-01` through `2022-12-31` monthly Terra day-LST series for actual source cell 18, with the service's descriptive statistics and support counts.

The implemented presentation also includes requested regional coverage/attached-source means, historical two-period comparisons, previous-month vegetation/monthly context with source-month labels, GHSL 2020 static snapshot context on 2021+ attachment records, and local CSV/JSON provenance exports. These need their own final browser outcome rather than assuming the one-cell HTTP check verified every page.

## 13. Unimplemented ML and tourism features

**Status: NOT IMPLEMENTED.**

There is no trained tourism prediction model, future forecast, causal tourism impact estimate, real tourism-observation series, generated AI policy recommendation, anomaly detector, seasonal decomposition, Mann-Kendall/Sen analysis, annual analysis mode, per-cell spatial trend layer, GHSL historical urban-growth series, or legacy server experiment/session execution. Related controls are disabled or labeled unavailable, and predictive claims are not synthesized from environmental trends.

The existing backend ML handoff/view is preparation infrastructure, not a trained model or proof of predictive readiness. Nothing was trained during frontend integration.

## 14. Recommended next steps for presentation readiness

1. Run fresh typecheck/build/tests against the preserved dependency installation, and record each result before labeling the latest repair verified.
2. When browser access is available, demonstrate the actual browser Analyze flow against FastAPI, then inspect missing-data, error, cancellation, comparison, and map-to-Lab scope behavior. Use one year and a real cell first for a responsive presentation; separately measure the regional demonstration. Keep the current browser-policy blocker explicit until that occurs.
3. Finish the bounded database after-check and retain final counts/certification evidence and test results in `FRONTEND_VERIFICATION.json`.
4. Keep the presentation within observed environmental data, source/monthly support, descriptive OLS, static GHSL context, and explicit uncertainty. Present predictive and tourism functionality as unavailable.
5. Record exact route/version/filter timings before and after the authorized full-stack performance changes in the production readiness report. Any future polygon product, durable shared report, or ML capability requires its own contract and validation.

## Latest repair scope and branding audit

The 14 November task expands the earlier frontend-only boundary to connectivity, backend/database diagnosis, measured performance, startup reliability, and professional cleanup. The source/documentation audit found no promotional development-tool credit in the UI, metadata, CSS, public SVG assets, API implementation, or configuration. The assistant-specific backend handoff filename and four linking documents were changed to neutral backend documentation naming; technical and scientific contents were retained. See production report section B for the exact affected files and audit scope. Third-party license/copyright text and NASA/MODIS/GHSL/OpenStreetMap provenance remain intact.

