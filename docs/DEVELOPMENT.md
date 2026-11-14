# Development Guide

Practical workflow for working on this repository. All commands verified 2026-11-14.

## Prerequisites

- Node.js ≥ 24 / npm ≥ 11 (frontend)
- Python 3.13 virtual environment at `backend/.venv` (see `backend/README.md`)
- SQL Server 2025 reachable as `localhost` with the certified `earthtrend_db`
- ODBC Driver 18

## Daily workflow

```powershell
# Terminal 1 — API on http://127.0.0.1:8000 (docs at /docs)
.\scripts\Start-Backend.ps1

# Terminal 2 — Vite dev server on http://localhost:5173
.\scripts\Start-Frontend.ps1
```

The frontend pins `VITE_API_BASE_URL=http://127.0.0.1:8000` and `VITE_DEMO_MODE=false` (the scripts set these; the committed `.env.example` documents them). Keep the 5173 origin — the backend CORS list allows exactly it.

## Quality gates (all verified green)

| Check | Command | Result 2026-11-14 |
|---|---|---|
| Typecheck + production build | `npm run build` | PASS — 2,366 modules, ~15 s |
| Typecheck only | `npx tsc -b --noEmit` | PASS |
| Lint | `npm run lint` | PASS (4 advisory warnings) |
| Frontend unit tests | `npm test` | PASS — 25/25 run (3 live tests skip by default) |
| Frontend live integration | `$env:RUN_LIVE_API_TESTS='1'; npm run test:integration` | PASS — 3/3 (needs the backend running) |
| Backend lint | `cd backend; .\.venv\Scripts\python.exe -m ruff check app tests alembic` | PASS |
| Backend tests (no DB) | `cd backend; .\.venv\Scripts\python.exe -m pytest -q` | PASS — unit/API portions |
| Backend tests (live SQL) | `$env:RUN_SQL_TESTS='1'; .\.venv\Scripts\python.exe -m pytest -q` | PASS — 305/305, ~31 s |

## Test layout

- `tests/` (root) — frontend: node:test suites for the API client, Zod schemas, and store flow; `RUN_LIVE_API_TESTS=1` opts into live HTTP against the running backend.
- `backend/tests/` — pytest: API contract tests (FastAPI TestClient), unit tests for analytics/aggregation, and `integration`-marked SQL tests (skip unless `RUN_SQL_TESTS=1`).
- CI (`.github/workflows/`) runs the non-database paths on push/PR; database integration runs locally against the certified database only.

## Conventions

- **Frontend**: feature-first structure (`src/features/*`), shared primitives in `src/components/*`, all HTTP through `src/services/api/environment.ts` with Zod validation, server state via the `useEnvironment` hooks (stable query keys, cancellation via the router signal).
- **Backend**: routes in `main.py` delegate to `repositories.py` (query construction) and `services/*` (computations). Pydantic schemas in `schemas.py` are the single contract surface; `extra='forbid'` on request bodies.
- **Errors**: backend returns the uniform `{code, message, status, request_id}` envelope; frontend maps codes to human messages in `LiveDataState`.
- **Scientific rules**: see `docs/METHODOLOGY.md`. Never zero-fill, never rescale, never forecast.

## Database work

- Migrations are additive Alembic revisions in `backend/alembic/versions/`.
- Run migrations explicitly (`alembic upgrade head`) — never at startup.
- Never modify certified version 6 rows in place; new data means a new version.
- Verify a backup before any schema change (latest full backup: 2026-11-14).

## Releasing the workspace

1. Confirm both services start with the scripts and readiness returns `ready`.
2. Run the full quality-gate table above.
3. Exercise the demo flow: Overview → Explorer (snapshot) → Research Lab (Hurghada + `terra_lst_day_c` + 2015–2024) → Results export.

## Known workspace cautions

- `npm ci` must not be interrupted mid-install; the optional native packages (`@rolldown/binding-win32-x64-msvc`, `@typescript/typescript-win32-x64`) are required for Vite 8/tsc on Windows.
- First dashboard load after a backend restart may take seconds if the SQL Server buffer pool is cold (the backend pre-warms the aggregate cache at startup).
