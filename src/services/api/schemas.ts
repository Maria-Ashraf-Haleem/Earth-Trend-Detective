import { z } from 'zod'

const n = z.number()
const nullableNumber = n.nullable()
const count = n.int().nonnegative()
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
export const availabilitySchema = z.enum(['available', 'unavailable', 'insufficient_data'])
export const boundsSchema = z.object({ west: n, south: n, east: n, north: n })
export const regionSchema = z.object({
  id: z.string(), name: z.string(), country: z.string(), description: z.string(),
  centroid: z.tuple([n, n]).nullable(), bounds: boundsSchema.nullable(),
  boundary: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(z.array(n))) }).nullable(),
  boundaryKind: z.string(), availability: availabilitySchema,
}).passthrough()
export const datasetSchema = z.object({
  id: z.string(), name: z.string(), shortName: z.string(), provider: z.string(), version: z.string(),
  datasetVersionId: count.nullable(), importComplete: z.boolean(), dataVerified: z.boolean(),
  spatialResolution: z.string(), temporalResolution: z.string(), availableBands: z.array(z.string()),
  studyPeriod: z.object({ start: date.nullable(), end: date.nullable() }).nullable(),
  documentationUrl: z.string(), notes: z.array(z.string()), availability: availabilitySchema,
}).passthrough()
export const indicatorSchema = z.object({
  id: z.string(), name: z.string(), unit: z.string(), data_source: z.string(),
  temporal_support: z.string(), description: z.string(),
}).passthrough()
export const variableSchema = z.object({
  id: z.string(), name: z.string(), shortName: z.string(), unit: z.string(), datasetId: z.string(),
  observationWindow: z.enum(['daytime', 'nighttime']), description: z.string(), scaleFactor: n,
  nativeUnit: z.string(), temporalSupport: z.string(),
}).passthrough()
export const cellSchema = z.object({
  id: count, grid_id: z.string(), longitude: n, latitude: n, region_id: z.string(),
}).passthrough()
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item).max(500), total: count, page: count, page_size: n.int().min(1).max(500) }).passthrough()
}
export const observationSchema = z.object({
  id: count, cell_id: count, dataset_version_id: count, date,
  values: z.record(z.string(), nullableNumber), quality: z.record(z.string(), z.string().nullable()),
})
export const observationPageSchema = pageSchema(observationSchema).extend({
  availability: z.string(), dataset_version_id: count.nullable(),
})
const versionFields = {
  dataset_version_id: count.nullable(), import_complete: z.boolean(), warning: z.string().nullable(), data_verified: z.boolean(),
}
export const summarySchema = z.object({
  ...versionFields, observation_rows: count, spatial_cells: count,
  start_date: date.nullable(), end_date: date.nullable(), availability: availabilitySchema,
  air_temperature: z.literal('unavailable'), tourism: z.literal('unavailable'), predictions: z.literal('unavailable'),
}).passthrough()
export const overviewSchema = z.object({
  ...versionFields, items: z.array(z.object({
    indicator: z.string(), mean_attached_source_value: nullableNumber, availability: availabilitySchema,
  })), methodology: z.string(),
}).passthrough()
export const coverageSchema = z.object({
  ...versionFields, source_rows: count, denominator: z.string(), items: z.array(z.object({
    indicator: z.string(), present_rows: count, missing_rows: count, present_ratio: nullableNumber,
  })),
}).passthrough()
export const aggregateSchema = z.object({
  observation_count: count, total_slots: count, missing_data_ratio: nullableNumber,
  start_date: date.nullable(), end_date: date.nullable(), mean: nullableNumber,
}).passthrough()
export const monthlyPointSchema = z.object({
  date, value: nullableNumber, observed_cells: count, contributing_cells: count, source_rows: count,
}).passthrough()
export const trendSchema = aggregateSchema.extend({
  ...versionFields, availability: availabilitySchema, unit: z.string(), absolute_change: nullableNumber,
  percentage_change: nullableNumber, slope_per_year: nullableNumber, p_value: nullableNumber,
  significant: z.boolean().nullable(), confidence_interval: z.tuple([n, n]).nullable(),
  confidence_level: n, alpha: n, method: z.string(), methodology: z.string(), warnings: z.array(z.string()),
  indicator: z.string(), series: z.array(monthlyPointSchema).max(1200), analysis_id: z.string(),
})
export const comparisonSchema = z.object({
  ...versionFields, availability: availabilitySchema, unit: z.string(), period_a: aggregateSchema, period_b: aggregateSchema,
  absolute_change: nullableNumber, percentage_change: nullableNumber, p_value: nullableNumber, significant: z.boolean().nullable(),
  method: z.string(), methodology: z.string(), warnings: z.array(z.string()), indicator: z.string(), analysis_id: z.string(),
}).passthrough()
export const readinessSchema = z.object({
  status: z.enum(['ready', 'not_ready']), checks: z.record(z.string(), z.boolean()), dataset_version_id: count.nullable(),
}).passthrough()

export const experimentConfigSchema = z.object({
  name: z.string().min(1),
  regionId: z.string(),
  datasetId: z.string(),
  variableId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  aggregation: z.enum(['monthly', 'seasonal', 'annual']),
  observationWindow: z.enum(['daytime', 'nighttime']),
  qualityFilter: z.enum(['all', 'good', 'best']),
  minValidRatio: z.number().min(0).max(1),
  missingDataHandling: z.enum(['pairwise', 'interpolate', 'drop_month']),
  trendMethods: z.array(z.enum(['mann_kendall', 'sens_slope', 'seasonal_mann_kendall', 'linear_regression'])),
  anomalyMethods: z.array(z.enum(['stl', 'robust_zscore', 'isolation_forest'])),
})

export type ExperimentConfigInput = z.infer<typeof experimentConfigSchema>
