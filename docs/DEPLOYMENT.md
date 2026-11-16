# Deployment: connecting the frontend to a live API

Verified as of November 2026.

## Why "API unavailable" appears on GitHub Pages

GitHub Pages is **static hosting** — it serves the built frontend (`dist/`) and can
never run the FastAPI backend or reach SQL Server. The deploy workflow
(`.github/workflows/deploy-pages.yml`) builds and publishes the React app only.

The app reads its data-service address from the `VITE_API_BASE_URL` build
variable (`src/config.ts`). When that repository variable is missing, the build
falls back to `http://127.0.0.1:8000`, which on a deployed site points at the
**visitor's own machine** — a place where no backend is running. The workspace
therefore reports "API unavailable" and "Could not connect to the environmental
data service". A plain-`http://` endpoint is additionally blocked as mixed
content, because the Pages origin is served over HTTPS.

## The fix path (once)

1. **Host the FastAPI service** on any platform that runs Python containers —
   Render, Railway, Fly.io, Azure App Service, a VPS behind Caddy/nginx. The
   service needs:
   - network access to the SQL Server holding `earthtrend_db`
   - `CORS_ORIGINS` set to the Pages origins that may call it, e.g.

     ```
     CORS_ORIGINS=https://mohammed-emad2004.github.io,https://maria-ashraf-haleem.github.io
     ```

     (accepts comma/semicolon-separated strings, a JSON array, or `*` for any
     origin; requests are unauthenticated reads with no cookies, so `*` is safe
     for this API.)
   - the same SQL/settings env vars used locally (see `.env.example` and
     `backend/README.md`)

2. **Point the frontend build at the hosted service.** In the GitHub repo:
   *Settings → Secrets and variables → Actions → **Variables** → add*
   `VITE_API_BASE_URL` = `https://your-hosted-api.example.com`
   (must be `https://`; the deploy workflow now **fails** with an explanatory
   error when this variable is missing, loopback, or plain http — that guard is
   what prevents shipping the "API unavailable" state again).

3. **Re-run the deploy workflow.** The site build embeds the hosted endpoint.

## Repair an already-deployed site at runtime (no rebuild)

Visitors (and you) can repoint a deployed site immediately:

*Open the site → **Settings → Data service endpoint***, paste the hosted API
URL, press **Test connection** (it checks `/api/v1/health/readiness`), then
**Save endpoint**. The workspace refetches from the new service instantly and
remembers the choice in that browser. This override is per-browser and never
part of the shipped build.

The status pill in the top bar polls every 30 s while the API is unreachable,
so once the endpoint comes back the app reconnects on its own.

## Local development

Nothing changes: `VITE_API_BASE_URL` defaults to `http://127.0.0.1:8000`, the
backend defaults to allowing `http://localhost:5173` and
`http://127.0.0.1:5173`, and the Settings page still lets you point a local
frontend at a remote service while testing.

## Running the API 24/7 on this PC

The live site is served by the supervisor stack (set up once, runs forever):

- **Scheduled task "EarthTrend Live API"** (starts at logon, restarts itself on
  failure, no time limit) runs `scripts/serve-live.py`, which owns everything:
  - spawns `uvicorn` on `127.0.0.1:8000` with the right `CORS_ORIGINS`,
  - runs a `cloudflared` quick tunnel and reads its public `https://*.trycloudflare.com` URL,
  - probes readiness locally and through the tunnel every 30 s, restarting the
    backend or tunnel when either stops answering,
  - publishes the tunnel URL to the `VITE_API_BASE_URL` repository variable and
    dispatches the Pages deployment, retrying until the run succeeds,
  - writes its state to `backend/.state/live/status.json` and logs to
    `backend/.state/live/supervisor.log`.

**What to check when the site is down**: `backend/.state/live/status.json`
(update time, `api_url`, `deployment_completed`) and the tail of
`backend/.state/live/supervisor.log`. The task is `\EarthTrend Live API`
(`schtasks /run /tn "\EarthTrend Live API"` restarts it manually).

**Requirements for true 24/7**: the PC must stay powered. Sleep on AC is
disabled; `scripts/Set-Up-AlwaysOn.ps1` (run once, elevates itself) also turns
off lid-close sleep and hibernation and re-registers the scheduled task so it
starts **at boot, headless** - after a reboot the API, tunnel and Pages update
come back before anyone logs in. Task Scheduler stores the account password
encrypted for the boot start; if the Windows password changes, run the script
again. On battery power the machine may still sleep by design - keep it
plugged in for 24/7.

**Moving to hosted 24/7 (no PC needed)**: the backend is SQL Server-only by
design (`pyodbc` + ODBC Driver 18 + `Trusted_Connection=yes`, see
`backend/app/core/database.py`). A Linux PaaS free tier cannot run that stack,
so the realistic paths are a small VPS/Azure VM (SQL Server Express + FastAPI
in containers) or adapting `database_url()` to SQL authentication first. Until
then, the supervisor stack above keeps the site online whenever the PC is on.

## Checklist when the site shows "API unavailable"

1. Open `/settings` and read **Active endpoint** (shows the effective URL).
2. Press **Test connection** — the result names the failure (timeout, HTTP
   status, or unreachable host).
3. If the endpoint is a loopback address → the deployment was built without
   `VITE_API_BASE_URL`; follow "The fix path" above.
4. If the endpoint is correct but unreachable → the hosted service is down or
   its `CORS_ORIGINS` does not include the Pages origin (check the browser
   console for a CORS error).
