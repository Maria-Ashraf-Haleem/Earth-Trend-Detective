# EarthTrend Lab

A frontend for an Earth observation intelligence workspace, built around an **illustrative** land surface temperature (LST) case study for Hurghada, Egypt (2003–2024) using the MODIS/Terra MOD11A2 product family.

> **Demo integrity:** every series, map cell, statistic and interpretation in this build is generated in the browser. None of it is a NASA observation, a published retrieval, or a citable finding. The interface states this in the demo banner, on data-bearing surfaces, in exports, and in the methodology page.

## Stack

- React 19, TypeScript 7, Vite 8
- Tailwind CSS 4 with custom design tokens
- React Router 7
- Zustand 5 with `persist` (localStorage)
- TanStack Query 5 (provider wiring for future API work)
- Leaflet 1.9 + React Leaflet 5
- Plotly 4 (lazy-loaded) + `react-plotly.js`
- Zod 4 for configuration validation
- Lucide icons
- shadcn-style primitives where useful (button, dialog, tooltip, field)

## Run

```bash
npm install
npm run dev
```

The dev server prints a local URL, normally `http://localhost:5173`.

Production build and local preview:

```bash
npm run build
npm run preview
```

Lint:

```bash
npm run lint
```

## Demo mode

`.env` values (defaults shown):

```bash
VITE_DEMO_MODE=true
VITE_API_BASE_URL=http://localhost:8000
```

- `VITE_DEMO_MODE=true` uses the bundled catalogue, synthetic monthly series, designed spatial fields, and template-generated interpretation. A deterministic six-step run animation is used in Research Lab.
- `VITE_DEMO_MODE=false` sends typed requests to the FastAPI base URL through `src/services/api/earthtrend.ts`. Requests are validated with Zod before they leave the browser.

The workspace persists locally under `earthtrend-lab.v2.app` and `earthtrend-lab.v2.lab`. Three completed Hurghada runs are seeded on first load so Compare, Results and AI Insights are usable immediately.

## Screens

| Route | Purpose |
| --- | --- |
| `/` | Overview: thesis, featured Hurghada plate, study metrics, methods, recent runs |
| `/explorer` | Map-first exploration with variable, extent, period, aggregation, quality and layer controls plus a live series preview |
| `/lab` | Research protocol builder (study area, variable, period, aggregation, QC, missing-data policy, trend and anomaly methods) with a simulated run overlay |
| `/results` `/results/:experimentId` | Full analysis report: finding, time series, spatial field, statistics, anomalies, quality, limitations; CSV/JSON export and report link copy |
| `/insights` | Evidence-linked interpretation companion with a citation rail and suggested questions that actually change the workspace context |
| `/experiments` | Local research ledger: search, window/status filters, sort, open, duplicate, delete, comparison staging |
| `/compare` | Side-by-side comparison bench with compatibility warnings, a synchronized multi-series chart and a protocol-vs-result matrix |
| `/methodology` | Dataset dossier, processing chain, statistical estimators, guardrails, backend contract and official LP DAAC references |
| `/settings` | Theme and working-mode selection, runtime status, workspace export, draft reset and full demo workspace restore |

Global interactions:

- `Ctrl/Cmd + K` opens the command palette; search navigates screens and experiments.
- Basalt night (default) and limestone day themes persist and re-style charts and maps.
- Toast feedback for runs, saves, exports, duplicates, deletes and resets.
- Hash links from AI Insights scroll to the corresponding report section.
- Responsive layouts from mobile sidebar to wide desktop rails.

## Project structure

```text
src/
  app/                 Router and query client
  components/
    charts/            Plotly time series, multi-series and SVG sparklines
    common/            Shared primitives, field controls, empty states
    layout/            App shell, sidebar, top bar, command palette
    maps/              Leaflet study map and custom SVG hero plate
    ui/                Small shadcn-style primitives
  data/
    mock/              Catalogue, synthetic series, designed spatial field, insight templates
    methods.ts         Trend and anomaly method descriptions
  features/
    overview/ explorer/ research-lab/ results/ ai-insights/
    experiments/ comparison/ methodology/ settings/
  services/
    api/               Typed client, fetch wrapper, Zod schemas
    mock/              Analysis simulation and demo catalogue
  store/               Zustand app and lab stores
  types/               Shared data contracts
  utils/               Aggregation, statistics, colour ramps, exports, formatting
```

The `AnalysisResults` contract carries both `series` (the configured aggregation) and `monthlySeries` (the full monthly record with decomposition and anomaly flags), so Results and Compare can re-aggregate without losing the raw series.

## Design system

The full contract lives in [`DESIGN.md`](./DESIGN.md). In short:

- **Direction:** a field instrument, not a mission-control console. Matte basalt and limestone surfaces, measured rules, engraved scale marks.
- **Type:** Archivo for display, Public Sans for interface and prose, IBM Plex Mono only for real numeric readouts.
- **Palette:** basalt night (default) and limestone day; one copper signal for action and fitted trend; sage for seasonal structure. Violet is fully retired.
- **Surfaces:** flat panels with hairline borders and 12px corners. Shadows only on genuinely floating layers. No glassmorphism, no gradients as decoration.
- **Readouts:** one shared `ReadoutStrip` band for key figures. No grid of icon-topped stat cards.
- **Language:** sentence-case labels, concrete headlines, and explicit caveats. “Illustrative data” and demo marks stay attached to data-bearing surfaces.
- **Navigation:** Mission (Overview, Explore, Analyze), Study (Results, Library, Compare, Companion), Reference (Data & method, Settings).

The codebase was audited against the `avoid-ai-design` tell catalogue and polished with the `make-interfaces-feel-better` principles: specific transitions, 0.96 press feedback, 40px+ hit targets, tabular numerals, balanced headings, pretty paragraph wrapping, and visible focus rings.

## Backend integration

The client already expects these FastAPI routes when demo mode is off:

| Method | Path | Returns |
| --- | --- | --- |
| `GET` | `/api/v1/datasets` | Dataset catalogue and documentation metadata |
| `GET` | `/api/v1/regions` | Study extents, centroid and GeoJSON boundary |
| `GET` | `/api/v1/variables` | Variable metadata, native unit and scale factor |
| `POST` | `/api/v1/experiments` | Created experiment (`queued`) |
| `GET` | `/api/v1/experiments/{id}` | Experiment record |
| `POST` | `/api/v1/experiments/{id}/run` | Run acknowledgement |
| `GET` | `/api/v1/experiments/{id}/status` | Status plus current pipeline step |
| `GET` | `/api/v1/experiments/{id}/results` | Trend, series, anomalies, quality and insight payload |
| `GET` | `/api/v1/experiments/{id}/map` | Spatial layers with per-cell values |
| `POST` | `/api/v1/experiments/{id}/insights` | Evidence-linked interpretation |
| `GET` | `/api/v1/experiments/{id}/export?format=csv\|json` | Export blob |
| `POST` | `/api/v1/sessions` | Research session |
| `GET` | `/api/v1/sessions` | Session list |
| `GET` | `/api/v1/sessions/{id}` | Session detail |

To go live, the backend must reproduce the documented chain: MOD11A2 acquisition, QC screening, 0.02 scaling and Kelvin→Celsius conversion, land masking, monthly/seasonal/annual aggregation with the chosen missing-data policy, Mann–Kendall and Sen’s slope, STL/robust-Z anomaly scoring, and spatial layer generation. It should also attach provenance and citation metadata to every export.

## Limitations carried by the interface

- LST is a radiometric surface temperature, not air temperature, comfort or UV.
- MOD11A2 is an approximately 1 km, 8-day composite product.
- QC filtering changes the valid sample and can bias cloudy or aerosol-heavy months.
- Terra overpass time is not constant across 2003–2024.
- The demo approximates the pipeline with a synthetic monthly series; it is not a substitute for granule-level processing.

## Official references

- Product page: [NASA LP DAAC — MOD11A2 V6.1](https://lpdaac.usgs.gov/products/mod11a2v061/)
- User guide: [MOD11 User Guide V6.1 (PDF)](https://lpdaac.usgs.gov/documents/1199/MOD11_User_Guide_V61.pdf)
- Provider: [NASA Earthdata](https://www.earthdata.nasa.gov/)
#   E a r t h - T r e n d - D e t e c t i v e  
 