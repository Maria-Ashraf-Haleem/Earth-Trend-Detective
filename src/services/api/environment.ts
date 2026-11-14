import { z } from 'zod'
import { ApiError, request } from './client.ts'
import type { RequestOptions } from './client.ts'
import {
  cellSchema, comparisonSchema, coverageSchema, datasetSchema, indicatorSchema, observationPageSchema,
  observationSchema, overviewSchema, pageSchema, readinessSchema, regionSchema, summarySchema, trendSchema, variableSchema,
} from './schemas.ts'
import type {
  ApiDataset, ApiRegion, ApiVariable, Cell, ComparisonFilters, ComparisonResponse, DashboardSummary, DataCoverage,
  EnvironmentalOverview, Indicator, Observation, ObservationFilters, ObservationPage, Page, Pagination,
  Readiness, RegionTrendFilters, TrendFilters, TrendResponse, VersionScope,
} from '../../types/environment.ts'

function query(filters: object = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}
async function validated<T>(path: string, schema: z.ZodType<T>, options?: RequestOptions): Promise<T> {
  const payload = await request<unknown>(path, options)
  const parsed = schema.safeParse(payload)
  if (!parsed.success) throw new ApiError({
    code: 'invalid_response', status: 200,
    message: 'The environmental service returned data that does not match the supported response format.',
  })
  return parsed.data
}
const prefix = '/api/v1'
// Small catalog/health reads should fail promptly; analytical reads keep their
// longer budget. Per-call overrides and cancellation continue to take precedence.
const catalogOptions = (options?: RequestOptions): RequestOptions => ({ timeoutMs: 15_000, ...options })
/** These methods always use real HTTP. There is no generated-data fallback. */
export const environmentApi = {
  getRegions: (options?: RequestOptions): Promise<ApiRegion[]> => validated(`${prefix}/regions?page_size=100`, z.array(regionSchema), catalogOptions(options)),
  getRegion: (id: string, options?: RequestOptions): Promise<ApiRegion> => validated(`${prefix}/regions/${encodeURIComponent(id)}`, regionSchema, catalogOptions(options)),
  getCells: (id: string, pagination: Pagination = {}, options?: RequestOptions): Promise<Page<Cell>> =>
    validated(`${prefix}/regions/${encodeURIComponent(id)}/cells${query({ page: 1, page_size: 500, ...pagination })}`, pageSchema(cellSchema), options),
  getDatasets: (options?: RequestOptions): Promise<ApiDataset[]> => validated(`${prefix}/datasets?page_size=100`, z.array(datasetSchema), catalogOptions(options)),
  getIndicators: (options?: RequestOptions): Promise<Indicator[]> => validated(`${prefix}/indicators`, z.array(indicatorSchema), catalogOptions(options)),
  getVariables: (options?: RequestOptions): Promise<ApiVariable[]> => validated(`${prefix}/variables`, z.array(variableSchema), catalogOptions(options)),
  getObservations: (filters: ObservationFilters = {}, options?: RequestOptions): Promise<ObservationPage> =>
    validated(`${prefix}/observations${query({ page: 1, page_size: 100, ...filters })}`, observationPageSchema, options),
  getObservation: (id: number, options?: RequestOptions): Promise<Observation> => validated(`${prefix}/observations/${id}`, observationSchema, options),
  getDashboardSummary: (scope: VersionScope = {}, options?: RequestOptions): Promise<DashboardSummary> =>
    validated(`${prefix}/dashboard/summary${query(scope)}`, summarySchema, options),
  getEnvironmentalOverview: (scope: VersionScope = {}, options?: RequestOptions): Promise<EnvironmentalOverview> =>
    validated(`${prefix}/dashboard/environmental-overview${query(scope)}`, overviewSchema, options),
  getDataCoverage: (scope: VersionScope = {}, options?: RequestOptions): Promise<DataCoverage> =>
    validated(`${prefix}/dashboard/data-coverage${query(scope)}`, coverageSchema, options),
  getTrend: (filters: TrendFilters, options?: RequestOptions): Promise<TrendResponse> =>
    validated(`${prefix}/analysis/trends${query(filters)}`, trendSchema, options),
  getRegionTrend: (id: string, filters: RegionTrendFilters, options?: RequestOptions): Promise<TrendResponse> =>
    validated(`${prefix}/analysis/trends/${encodeURIComponent(id)}${query(filters)}`, trendSchema, options),
  comparePeriods: (filters: ComparisonFilters, options?: RequestOptions): Promise<ComparisonResponse> =>
    validated(`${prefix}/analysis/compare${query(filters)}`, comparisonSchema, options),
  getReadiness: (options?: RequestOptions): Promise<Readiness> => validated(`${prefix}/health/readiness`, readinessSchema, catalogOptions(options)),
}
