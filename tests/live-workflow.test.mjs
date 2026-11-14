/** Main Analyze action through the real Zustand store and validated HTTP adapter.
 * Synthetic HTTP fixtures are explicit; these tests never contact SQL or create server jobs.
 * Vite's SSR loader supplies the application's own aliases/TypeScript transform.
 */
import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const savedFetch = globalThis.fetch
const savedStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
const savedWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'window')
const stored = new Map()
const oldDemoKey = 'earthtrend-lab.v2'
const oldDemoValue = JSON.stringify({ state: { experiments: [{ id: 'legacy-mock-result', source: 'demo' }] }, version: 0 })
stored.set(oldDemoKey, oldDemoValue)
let server
let store
let defaults
let initialState
let calls = []
let handleFetch

const fixture = (changes = {}) => ({
  dataset_version_id: 6, import_complete: true, warning: null, data_verified: true,
  observation_count: 2, total_slots: 3, missing_data_ratio: 1 / 3,
  start_date: '2022-01-01', end_date: '2022-03-01', mean: 1,
  availability: 'insufficient_data', unit: 'degC', absolute_change: 2, percentage_change: null,
  slope_per_year: null, p_value: null, significant: null, confidence_interval: null,
  confidence_level: 0.95, alpha: 0.05, method: 'ordinary_least_squares_elapsed_years',
  methodology: 'Explicit synthetic monthly HTTP fixture.', warnings: ['Only two nonmissing months in this fixture.'],
  indicator: 'terra_lst_day_c', analysis_id: 'ephemeral-http-fixture',
  series: [
    { date: '2022-01-01', value: 0, observed_cells: 1, contributing_cells: 1, source_rows: 1 },
    { date: '2022-02-01', value: null, observed_cells: 1, contributing_cells: 0, source_rows: 1 },
    { date: '2022-03-01', value: 2, observed_cells: 1, contributing_cells: 1, source_rows: 1 },
  ],
  ...changes,
})
const response = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json', 'X-Request-ID': 'workflow-fixture-request' },
})

before(async () => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: key => stored.delete(key), clear: () => stored.clear(),
    key: index => [...stored.keys()][index] ?? null,
    get length() { return stored.size },
  } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: globalThis.localStorage } })
  server = await createServer({
    configFile: false, root: projectRoot, mode: 'test', appType: 'custom', logLevel: 'silent',
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, hmr: false },
  })
  // Install one transport wrapper before loading the real API module, then vary
  // only the HTTP boundary per test. Store and schema logic are not replaced.
  globalThis.fetch = async (url, options) => {
    calls.push({ url: new URL(String(url)), options })
    return handleFetch(url, options)
  }
  const module = await server.ssrLoadModule('/src/store/useLabStore.ts')
  store = module.useLabStore
  defaults = module.defaultLiveConfiguration
  initialState = { experiments: [...store.getState().experiments], activeId: store.getState().activeId }
})

after(async () => {
  await server?.close()
  globalThis.fetch = savedFetch
  if (savedStorageDescriptor === undefined) delete globalThis.localStorage
  else Object.defineProperty(globalThis, 'localStorage', savedStorageDescriptor)
  if (savedWindowDescriptor === undefined) delete globalThis.window
  else Object.defineProperty(globalThis, 'window', savedWindowDescriptor)
})

beforeEach(() => {
  calls = []
  handleFetch = async () => response(fixture())
  store.getState().resetWorkspace()
  store.setState({ draft: defaults(), experiments: [], activeId: null, toast: null })
})

function readyDraft(patch = {}) {
  store.getState().setDraft({
    name: 'HTTP fixture analysis', regionId: 'hurghada-study-area', datasetId: 'earthtrend-spatial-fusion-v2',
    datasetVersionId: 6, variableId: 'terra_lst_day_c', startDate: '2022-01-01', endDate: '2022-03-31',
    ...patch,
  })
}

test('fresh live workspace never hydrates or seeds old demo analysis', () => {
  assert.deepEqual(initialState.experiments, [])
  assert.equal(initialState.activeId, null)
  assert.equal(stored.get(oldDemoKey), oldDemoValue)
  assert.equal(calls.length, 0)
})

test('Analyze sends one real-contract GET with exact version/date/cell/bounds and preserves NULL/zero', async () => {
  readyDraft({ cellId: 42, bounds: { west: 33.7, south: 27.1, east: 33.9, north: 27.3 } })
  const context = { regionName: 'Fixture region', indicatorName: 'Fixture surface temperature', unit: 'degC' }
  const pending = store.getState().runDraft(context)
  // Request dispatch is immediate; there is no legacy POST or staged timer.
  assert.equal(calls.length, 1)
  const call = calls[0]
  assert.equal(call.url.pathname, '/api/v1/analysis/trends')
  assert.equal(call.options.method ?? 'GET', 'GET')
  assert.deepEqual(Object.fromEntries(call.url.searchParams), {
    region_id: 'hurghada-study-area', indicator: 'terra_lst_day_c', start_date: '2022-01-01',
    end_date: '2022-03-31', dataset_version_id: '6', west: '33.7', south: '27.1', east: '33.9', north: '27.3', cell_id: '42',
  })
  assert.equal(new Headers(call.options.headers).has('X-Import-Key'), false)
  assert.equal(call.options.body, undefined)
  const id = await pending
  const record = store.getState().experiments.find(item => item.id === id)
  assert.equal(record.source, 'api')
  assert.equal(record.status, 'completed')
  assert.equal(record.isDemo, false)
  assert.equal(record.results, null)
  assert.equal(record.liveResult.analysis_id, 'ephemeral-http-fixture')
  assert.deepEqual(record.liveResult.series.map(p => p.value), [0, null, 2])
  assert.equal(record.liveResult.p_value, null)
  assert.equal(record.liveResult.confidence_interval, null)
  assert.equal(calls.length, 1)
})

test('service failure records the structured error without a result or demo fallback', async () => {
  readyDraft()
  handleFetch = async () => response({ status: 409, code: 'http_error',
    message: 'Fixture selection is not certified for publication.', request_id: 'workflow-fixture-409' }, 409)
  await assert.rejects(store.getState().runDraft(), error => error.status === 409 && error.requestId === 'workflow-fixture-409')
  const record = store.getState().experiments[0]
  assert.equal(record.status, 'failed')
  assert.equal(record.error, 'Fixture selection is not certified for publication.')
  assert.equal(record.liveResult, undefined)
  assert.equal(record.results, null)
  assert.equal(record.isDemo, false)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url.pathname, '/api/v1/analysis/trends')
})

test('malformed success JSON fails response validation instead of fabricating usable results', async () => {
  readyDraft()
  handleFetch = async () => response({ ...fixture(), series: [{ date: '2022-01-01', value: 'not-a-number' }] })
  await assert.rejects(store.getState().runDraft(), error => error.code === 'invalid_response')
  const record = store.getState().experiments[0]
  assert.equal(record.status, 'failed')
  assert.equal(record.liveResult, undefined)
  assert.equal(record.results, null)
  assert.equal(calls.length, 1)
})

test('missing-data success retains NULL slots and exposes the no-observation message', async () => {
  readyDraft()
  handleFetch = async () => response(fixture({ availability: 'unavailable', mean: null, observation_count: 0,
    absolute_change: null, missing_data_ratio: 1, start_date: null, end_date: null,
    series: fixture().series.map(p => ({ ...p, value: null, contributing_cells: 0 })) }))
  const id = await store.getState().runDraft()
  const record = store.getState().experiments.find(item => item.id === id)
  assert.equal(record.status, 'completed')
  assert.equal(record.liveResult.availability, 'unavailable')
  assert.ok(record.liveResult.series.every(p => p.value === null))
  assert.equal(record.liveResult.mean, null)
  assert.match(store.getState().toast, /No observations/)
})

test('concurrent Analyze is rejected; cancellation has no fallback and releases the next request', async () => {
  readyDraft()
  handleFetch = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Fixture cancellation', 'AbortError')), { once: true })
  })
  const first = store.getState().runDraft()
  await assert.rejects(store.getState().runDraft(), /already running/)
  assert.equal(calls.length, 1)
  assert.equal(store.getState().experiments.length, 1)
  store.getState().cancelRun()
  await assert.rejects(first, { name: 'AbortError' })
  const stopped = store.getState().experiments[0]
  assert.equal(stopped.status, 'failed')
  assert.equal(stopped.error, 'Analysis cancelled.')
  assert.equal(stopped.liveResult, undefined)
  handleFetch = async () => response(fixture())
  const nextId = await store.getState().runDraft()
  assert.equal(store.getState().experiments.find(item => item.id === nextId).status, 'completed')
  assert.equal(calls.length, 2)
})

test('invalid controls fail before requests, progress records or generated data', async () => {
  await assert.rejects(store.getState().runDraft(), /Select a published dataset/)
  readyDraft({ startDate: '2023-01-01', endDate: '2022-01-01' })
  await assert.rejects(store.getState().runDraft(), /valid historical date range/)
  assert.equal(calls.length, 0)
  assert.deepEqual(store.getState().experiments, [])
})
