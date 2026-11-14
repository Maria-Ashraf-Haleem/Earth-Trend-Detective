import assert from 'node:assert/strict'
import test from 'node:test'
import { observationPageSchema, regionSchema, trendSchema } from '../src/services/api/schemas.ts'

const emptyTrend = {
  dataset_version_id: 6, import_complete: true, warning: null, data_verified: true,
  observation_count: 0, total_slots: 1, missing_data_ratio: 1, start_date: null, end_date: null, mean: null,
  availability: 'unavailable', unit: 'degC', absolute_change: null, percentage_change: null,
  slope_per_year: null, p_value: null, significant: null, confidence_interval: null,
  confidence_level: 0.95, alpha: 0.05, method: 'ordinary_least_squares_elapsed_years',
  methodology: 'Observed monthly descriptive values.', warnings: ['No observed values.'], indicator: 'aqua_lst_day_c',
  series: [{ date: '2022-04-01', value: null, observed_cells: 1, contributing_cells: 0, source_rows: 1 }], analysis_id: 'ephemeral-test',
}

test('empty region extents remain null rather than invented coordinates', () => {
  const parsed = regionSchema.parse({ id: 'empty', name: 'Empty', country: 'Egypt', description: '',
    centroid: null, bounds: null, boundary: null, boundaryKind: 'source_centroid_bounding_box', availability: 'unavailable' })
  assert.equal(parsed.centroid, null)
  assert.equal(parsed.boundary, null)
})

test('nullable observations preserve unknown QA and observed zero independently', () => {
  const page = observationPageSchema.parse({ items: [{ id: 1, cell_id: 1, dataset_version_id: 6, date: '2022-04-07',
    values: { aqua_lst_day_c: null, ghsl_2020_built_surface_m2_sum: 0 }, quality: { aqua_day_valid: null } }],
    page: 1, page_size: 2, total: 1, availability: 'available', dataset_version_id: 6 })
  assert.equal(page.items[0].values.aqua_lst_day_c, null)
  assert.equal(page.items[0].quality.aqua_day_valid, null)
  assert.equal(page.items[0].values.ghsl_2020_built_surface_m2_sum, 0)
})

test('unavailable analytical inference remains null and source support stays explicit', () => {
  const parsed = trendSchema.parse(emptyTrend)
  assert.equal(parsed.mean, null)
  assert.equal(parsed.p_value, null)
  assert.equal(parsed.confidence_interval, null)
  assert.equal(parsed.series[0].value, null)
  assert.equal(parsed.series[0].contributing_cells, 0)
  assert.equal(parsed.series[0].observed_cells, 1)
})

test('response validation rejects string measurements and missing statistical fields', () => {
  assert.equal(trendSchema.safeParse({ ...emptyTrend, slope_per_year: 'not-a-number' }).success, false)
  const { confidence_interval: _omitted, ...missing } = emptyTrend
  assert.equal(trendSchema.safeParse(missing).success, false)
})

test('series and page validation enforce bounded browser payloads', () => {
  assert.equal(trendSchema.safeParse({ ...emptyTrend, series: Array(1201).fill(emptyTrend.series[0]) }).success, false)
  assert.equal(observationPageSchema.safeParse({ items: [], total: 0, page: 1, page_size: 501,
    availability: 'unavailable', dataset_version_id: 6 }).success, false)
})
