/** Real Analyze store -> HTTP -> SQL Server. No browser or rendered-chart claim. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

test('actual Analyze store completes SQL-backed analysis and preserves a real all-missing selection', {
  skip: process.env.RUN_LIVE_API_TESTS !== '1', timeout: 60_000,
}, async () => {
  const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const memory = new Map()
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key),
  } })
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: globalThis.localStorage } })
  const server = await createServer({ configFile: false,
    root: fileURLToPath(new URL('..', import.meta.url)), mode: 'test', appType: 'custom', logLevel: 'silent',
    resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } },
    server: { middlewareMode: true, hmr: false },
  })
  try {
    const { useLabStore: store } = await server.ssrLoadModule('/src/store/useLabStore.ts')
    const { environmentApi: api } = await server.ssrLoadModule('/src/services/api/environment.ts')
    const datasets = await api.getDatasets()
    const dataset = datasets.find(d => d.dataVerified)
    assert.ok(dataset?.datasetVersionId)
    const region = (await api.getRegions()).find(r => r.id === 'hurghada-study-area')
    assert.ok(region)
    const cell = (await api.getCells(region.id, { page_size: 1 })).items[0]
    assert.ok(cell)
    store.getState().setDraft({ name: 'Live SQL verification', datasetId: dataset.id,
      datasetVersionId: dataset.datasetVersionId, regionId: region.id, cellId: cell.id,
      variableId: 'terra_lst_day_c', startDate: '2022-01-01', endDate: '2022-12-31' })
    const id = await store.getState().runDraft()
    const record = store.getState().experiments.find(r => r.id === id)
    assert.equal(record.status, 'completed')
    assert.equal(record.source, 'api')
    assert.equal(record.isDemo, false)
    assert.equal(record.liveResult.data_verified, true)
    assert.equal(record.liveResult.series.length, 12)
    assert.equal(record.liveResult.observation_count, 12)
    assert.ok(Number.isFinite(record.liveResult.slope_per_year))
    assert.equal(record.liveResult.percentage_change, null)
    assert.ok(memory.get('earthtrend-live.v1.analyses.v1').includes(id))

    store.getState().setDraft({ variableId: 'aqua_lst_day_c', startDate: '2022-04-07', endDate: '2022-04-07' })
    const missingId = await store.getState().runDraft()
    const missing = store.getState().experiments.find(r => r.id === missingId).liveResult
    assert.equal(missing.observation_count, 0)
    assert.equal(missing.mean, null)
    assert.equal(missing.slope_per_year, null)
    assert.ok(missing.series.every(p => p.value === null))
    assert.equal(missing.availability, 'unavailable')
  } finally {
    await server.close()
    if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage)
    else delete globalThis.localStorage
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow)
    else delete globalThis.window
  }
})
