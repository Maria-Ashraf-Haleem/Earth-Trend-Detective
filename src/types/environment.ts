/** Public certified-data wire contracts. No operator keys or unpublished previews. */
export type Availability = 'available' | 'unavailable' | 'insufficient_data'
export interface Bounds { west: number; south: number; east: number; north: number }
export interface ApiRegion {
  id: string; name: string; country: string; description: string
  centroid: [number, number] | null
  bounds: Bounds | null
  boundary: { type: 'Polygon'; coordinates: number[][][] } | null
  boundaryKind: string; availability: Availability
}
export interface ApiDataset {
  id: string; name: string; shortName: string; provider: string; version: string
  datasetVersionId: number | null; importComplete: boolean; dataVerified: boolean
  spatialResolution: string; temporalResolution: string; availableBands: string[]
  studyPeriod: { start: string | null; end: string | null } | null
  documentationUrl: string; notes: string[]; availability: Availability
}
export interface Indicator { id: string; name: string; unit: string; data_source: string; temporal_support: string; description: string }
export interface ApiVariable {
  id: string; name: string; shortName: string; unit: string; datasetId: string
  observationWindow: 'daytime' | 'nighttime'; description: string
  scaleFactor: number; nativeUnit: string; temporalSupport: string
}
export interface Cell { id: number; grid_id: string; longitude: number; latitude: number; region_id: string }
export interface Page<T> { items: T[]; total: number; page: number; page_size: number }
export interface Pagination { page?: number; page_size?: number }
export interface VersionScope { region_id?: string; dataset_version_id?: number }
export interface ObservationFilters extends VersionScope, Pagination, Partial<Bounds> {
  cell_id?: number; indicator?: string; start_date?: string; end_date?: string
  year?: number; month?: number; data_source?: 'terra' | 'aqua' | 'ghsl'
  sort?: 'date' | 'id' | 'cell_id'; order?: 'asc' | 'desc'
}
export interface Observation {
  id: number; cell_id: number; dataset_version_id: number; date: string
  values: Record<string, number | null>; quality: Record<string, string | null>
}
export interface ObservationPage extends Page<Observation> { availability: string; dataset_version_id: number | null }
export interface VersionStatus { dataset_version_id: number | null; import_complete: boolean; warning: string | null; data_verified: boolean }
export interface DashboardSummary extends VersionStatus {
  observation_rows: number; spatial_cells: number; start_date: string | null; end_date: string | null
  availability: Availability; air_temperature: 'unavailable'; tourism: 'unavailable'; predictions: 'unavailable'
}
export interface EnvironmentalOverview extends VersionStatus {
  items: { indicator: string; mean_attached_source_value: number | null; availability: Availability }[]
  methodology: string
}
export interface DataCoverage extends VersionStatus {
  source_rows: number; denominator: string
  items: { indicator: string; present_rows: number; missing_rows: number; present_ratio: number | null }[]
}
export interface TrendFilters extends Omit<ObservationFilters, 'page' | 'page_size' | 'sort' | 'order'> { indicator: string }
export interface RegionTrendFilters { indicator: string; start_date?: string; end_date?: string; dataset_version_id?: number }
export interface AggregateSummary {
  observation_count: number; total_slots: number; missing_data_ratio: number | null
  start_date: string | null; end_date: string | null; mean: number | null
}
export interface MonthlyPoint { date: string; value: number | null; observed_cells: number; contributing_cells: number; source_rows: number }
export interface TrendResponse extends VersionStatus, AggregateSummary {
  availability: Availability; unit: string; absolute_change: number | null; percentage_change: number | null
  slope_per_year: number | null; p_value: number | null; significant: boolean | null
  confidence_interval: [number, number] | null; confidence_level: number; alpha: number
  method: string; methodology: string; warnings: string[]; indicator: string
  series: MonthlyPoint[]; analysis_id: string
}
export interface ComparisonFilters extends VersionScope {
  indicator: string; period_a_start: string; period_a_end: string; period_b_start: string; period_b_end: string
}
export interface ComparisonResponse extends VersionStatus {
  availability: Availability; unit: string; period_a: AggregateSummary; period_b: AggregateSummary
  absolute_change: number | null; percentage_change: number | null; p_value: number | null
  significant: boolean | null; method: string; methodology: string; warnings: string[]; indicator: string; analysis_id: string
}
export interface Readiness { status: 'ready' | 'not_ready'; checks: Record<string, boolean>; dataset_version_id: number | null }
