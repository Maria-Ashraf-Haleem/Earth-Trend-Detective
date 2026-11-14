# Frontend verification baseline — 14 November 2026

These results were captured from the existing installed dependency tree before the current performance repairs. They are a working-tree baseline, not proof of a reproducible locked installation. The dependency audit found 17 installed versions different from `package-lock.json`; the lock itself is unchanged. See `DEPENDENCY_INTEGRITY_AUDIT.json` for package-level evidence and the final verification report for repair results.

Runtime: portable Node 24.22.3 at `%TEMP%\earthtrend-tools\node-v24.22.3-win-x64\node.exe`. Commands ran from the repository root. The portable runtime's `npm.cmd` and npm CLI entry point were absent, so the existing package executables were invoked directly.

| Check | Command after `node.exe` | Observed result |
|---|---|---|
| TypeScript | `node_modules\typescript\bin\tsc -b --noEmit --pretty false` | Exit 0; command wall time 1.09 s |
| Production bundle | `node_modules\vite\bin\vite.js build` | Exit 0; Vite 8.3.8; 2,389 modules; Vite reported 2.06 s, command wall time 3.10 s |
| Unit and workflow fixtures | `--test tests/*.test.ts tests/*.test.mjs` | Exit 0; 25 passed, 2 live-service tests skipped; 5.80 s test duration |
| Lint | `node_modules\oxlint\bin\oxlint` | Exit 0; 19 warnings, no errors |

The test run used HTTP fixtures for client/store cases; it is not live SQL or browser evidence. The live tests require their explicit environment opt-in. Workflow fixtures also emitted browser-storage-unavailable warnings under Node.

## Production assets before optimization

| Asset | Uncompressed | Gzip |
|---|---:|---:|
| Main JavaScript `index-BoHi4rK2.js` | 450.57 kB | 143.48 kB |
| Environment/API chunk | 145.25 kB | 44.05 kB |
| `LiveStudyMap-Dsytwtki.js` shared heavy chunk | 4,862.42 kB | 1,481.73 kB |
| Overview route | 13.22 kB | 4.64 kB |
| Explorer route | 17.58 kB | 5.54 kB |
| Analyze route | 15.71 kB | 5.37 kB |
| Results route | 10.68 kB | 3.98 kB |
| Main stylesheet | 52.88 kB | 10.89 kB |
| Leaflet stylesheet | 15.09 kB | 6.36 kB |

Vite emitted its chunk-size warning for the shared heavy asset. Its filename does not establish that all bytes belong to Leaflet; the default React Plotly component also imported the full Plotly distribution into this shared dependency graph.

Initial HTML, development startup, FCP/LCP, dashboard/API latency, and map initialization were not measured by these CLI commands. They must be recorded separately from browser/service measurements; the build duration is not a rendering metric.
