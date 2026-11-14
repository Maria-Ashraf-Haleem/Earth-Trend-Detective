/** HTTP/server and bundle measurements only. This does not measure browser paint. */
import { createServer } from 'vite'
import { performance } from 'node:perf_hooks'
import { writeFile, readFile, readdir } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const started = performance.now()
const server = await createServer({ root, logLevel: 'warn',
  server: { host: 'localhost', port: 5174, strictPort: true, open: false } })
const results = { measured_at: new Date().toISOString(), environment: 'Local Windows, existing dependency cache; no browser',
  startup_ms: null, http: [], assets: [],
  browser_metrics: { fcp: null, lcp: null, tti: null, react_initialization: null, map_initialization: null,
    reason: 'Browser verification tool unavailable; HTTP timings are not paint or interaction measurements.' } }
try {
  await server.listen()
  results.startup_ms = +(performance.now() - started).toFixed(2)
  for (const path of ['/', '/src/main.tsx', '/lab', '/explorer', '/results', '/compare', '/settings']) {
    const begin = performance.now()
    const response = await fetch(`http://localhost:5174${path}`)
    const body = await response.arrayBuffer()
    results.http.push({ path, status: response.status, ms: +(performance.now() - begin).toFixed(2), bytes: body.byteLength })
    if (!response.ok) throw new Error(`Unexpected HTTP ${response.status}: ${path}`)
  }
  for (const name of await readdir(`${root}/dist/assets`)) {
    if (!/\.(js|css)$/.test(name)) continue
    const body = await readFile(`${root}/dist/assets/${name}`)
    results.assets.push({ name, bytes: body.length, gzip_bytes: gzipSync(body).length })
  }
  results.assets.sort((a, b) => b.bytes - a.bytes)
  await writeFile(`${root}/docs/FRONTEND_PERFORMANCE_AFTER.json`, JSON.stringify(results, null, 2) + '\n')
  console.log(JSON.stringify({ startup_ms: results.startup_ms, http: results.http,
    largest_assets: results.assets.slice(0, 5), browser_metrics: results.browser_metrics }, null, 2))
} finally { await server.close() }
