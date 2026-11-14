/** Opt-in bounded reads through the same validated API used by the UI. No writes. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { environmentApi } from '../src/services/api/environment.ts'
import { ApiError } from '../src/services/api/client.ts'

const live = process.env.RUN_LIVE_API_TESTS === '1'

test('real certified SQL data reaches the browser adapter without mock fallback', { skip: !live, timeout: 60_000 }, async () => {
  const [regions, datasets, indicators, variables] = await Promise.all([
    environmentApi.getRegions(), environmentApi.getDatasets(), environmentApi.getIndicators(), environmentApi.getVariables(),
  ])
  const region = regions.find((r) => r.id === 'hurghada-study-area')
  const dataset = datasets.find((d) => d.dataVerified)
  assert.ok(region?.centroid)
  assert.ok(dataset?.datasetVersionId)
  assert.equal(indicators.length, 14)
  assert.equal(variables.length, 8)
  assert.equal(dataset.studyPeriod?.end?.slice(0, 4), '2024')
  const cells = await environmentApi.getCells(region.id, { page_size: 2 })
  assert.equal(cells.items.length, 2)
  assert.equal(cells.total, 7231)
  const filters = { dataset_version_id: dataset.datasetVersionId, cell_id: cells.items[0].id,
    start_date: '2022-04-07', end_date: '2022-04-07', page_size: 2 }
  const observations = await environmentApi.getObservations(filters)
  assert.equal(observations.total, 1)
  assert.equal(observations.items[0].values.aqua_lst_day_c, null)
  const next = await environmentApi.getObservations({ ...filters, page: 2 })
  assert.equal(next.items.length, 0)
  const trend = await environmentApi.getTrend({ dataset_version_id: dataset.datasetVersionId,
    cell_id: cells.items[0].id, indicator: 'terra_lst_day_c', start_date: '2022-01-01', end_date: '2022-12-31' })
  assert.equal(trend.series.length, 12)
  assert.equal(trend.data_verified, true)
  assert.equal(trend.dataset_version_id, dataset.datasetVersionId)
  assert.equal(trend.percentage_change, null)
  assert.equal(trend.method, 'ordinary_least_squares_elapsed_years')
  assert.ok(trend.series.some((p) => p.value !== null))
})

test('real service validation errors survive the frontend adapter', { skip: !live }, async () => {
  await assert.rejects(environmentApi.getRegion('definitely-missing-live-test'), (error: unknown) =>
    error instanceof ApiError && error.status === 404 && error.message === 'Region not found' && Boolean(error.requestId))
  await assert.rejects(environmentApi.getTrend({ indicator: 'ghsl_2020_built_surface_m2_sum' }), (error: unknown) =>
    error instanceof ApiError && error.status === 422 && /snapshot|time/i.test(error.message))
})
