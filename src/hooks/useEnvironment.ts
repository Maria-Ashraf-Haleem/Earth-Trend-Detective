import { useQuery } from '@tanstack/react-query'
import { environmentApi } from '../services/api/environment'
import type { ComparisonFilters, ObservationFilters, Pagination, RegionTrendFilters, TrendFilters, VersionScope } from '../types/environment'

export const environmentQueryOptions = {
  staleTime: 5 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: false,
  retry: false,
} as const
export const environmentKeys = {
  regions: ['environment', 'regions'] as const,
  datasets: ['environment', 'datasets'] as const,
  indicators: ['environment', 'indicators'] as const,
  variables: ['environment', 'variables'] as const,
  readiness: ['environment', 'readiness'] as const,
}
interface Options { enabled?: boolean }
export function useRegions(options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: environmentKeys.regions,
    queryFn: ({ signal }) => environmentApi.getRegions({ signal }), ...options })
}
export function useRegion(id: string | undefined, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'region', id],
    queryFn: ({ signal }) => environmentApi.getRegion(id!, { signal }), enabled: Boolean(id) && options.enabled !== false })
}
export function useDatasets(options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: environmentKeys.datasets,
    queryFn: ({ signal }) => environmentApi.getDatasets({ signal }), ...options })
}
export function useIndicators(options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: environmentKeys.indicators,
    queryFn: ({ signal }) => environmentApi.getIndicators({ signal }), ...options })
}
export function useVariables(options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: environmentKeys.variables,
    queryFn: ({ signal }) => environmentApi.getVariables({ signal }), ...options })
}
export function useCatalog() {
  const regions = useRegions()
  const datasets = useDatasets()
  const indicators = useIndicators()
  const variables = useVariables()
  const queries = [regions, datasets, indicators, variables]
  return {
    regions: regions.data ?? [], datasets: datasets.data ?? [], indicators: indicators.data ?? [], variables: variables.data ?? [],
    isPending: queries.some((q) => q.isPending), isFetching: queries.some((q) => q.isFetching),
    error: queries.find((q) => q.error)?.error ?? null,
    refetch: () => Promise.all(queries.map((q) => q.refetch())),
  }
}
export function useCells(regionId: string | undefined, pagination: Pagination = {}, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'cells', regionId, pagination],
    queryFn: ({ signal }) => environmentApi.getCells(regionId!, pagination, { signal }),
    enabled: Boolean(regionId) && options.enabled !== false })
}
export function useObservations(filters: ObservationFilters, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'observations', filters],
    queryFn: ({ signal }) => environmentApi.getObservations(filters, { signal }), ...options })
}
export function useDashboardSummary(scope: VersionScope = {}, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'dashboard-summary', scope],
    queryFn: ({ signal }) => environmentApi.getDashboardSummary(scope, { signal }), ...options })
}
export function useEnvironmentalOverview(scope: VersionScope = {}, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'environmental-overview', scope],
    queryFn: ({ signal }) => environmentApi.getEnvironmentalOverview(scope, { signal }), ...options })
}
export function useDataCoverage(scope: VersionScope = {}, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'coverage', scope],
    queryFn: ({ signal }) => environmentApi.getDataCoverage(scope, { signal }), ...options })
}
export function useTrend(filters: TrendFilters | null, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'trend', filters],
    queryFn: ({ signal }) => environmentApi.getTrend(filters!, { signal }), enabled: Boolean(filters?.indicator) && options.enabled !== false })
}
export function useRegionTrend(regionId: string | undefined, filters: RegionTrendFilters | null, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'region-trend', regionId, filters],
    queryFn: ({ signal }) => environmentApi.getRegionTrend(regionId!, filters!, { signal }),
    enabled: Boolean(regionId && filters?.indicator) && options.enabled !== false })
}
export function useComparison(filters: ComparisonFilters | null, options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: ['environment', 'comparison', filters],
    queryFn: ({ signal }) => environmentApi.comparePeriods(filters!, { signal }), enabled: Boolean(filters) && options.enabled !== false })
}
export function useReadiness(options: Options = {}) {
  return useQuery({ ...environmentQueryOptions, queryKey: environmentKeys.readiness,
    queryFn: ({ signal }) => environmentApi.getReadiness({ signal }), ...options })
}
