import type { TrendResponse } from './environment'

export type ThemeMode = 'light' | 'dark'
export type TemporalAggregation = 'monthly' | 'seasonal' | 'annual'
export type ObservationWindow = 'daytime' | 'nighttime'
export type TrendDirection = 'increasing' | 'decreasing' | 'no_significant_trend'
export type ExperimentStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
export type AnomalySeverity = 'moderate' | 'high' | 'extreme'
export type QualityFilter = 'all' | 'good' | 'best'
export type MissingDataHandling = 'pairwise' | 'interpolate' | 'drop_month'

export interface GeoBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface Region {
  id: string
  name: string
  country: string
  description: string
  centroid: [number, number]
  bounds: GeoBounds
  boundary: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

export interface Dataset {
  id: string
  name: string
  shortName: string
  provider: string
  version: string
  spatialResolution: string
  temporalResolution: string
  availableBands: string[]
  studyPeriod: { start: string; end: string }
  documentationUrl: string
  notes: string[]
}

export interface Variable {
  id: string
  name: string
  shortName: string
  unit: string
  datasetId: string
  observationWindow: ObservationWindow
  description: string
  scaleFactor: number
  nativeUnit: string
}

export interface ExperimentConfiguration {
  name: string
  regionId: string
  datasetId: string
  variableId: string
  startDate: string
  endDate: string
  aggregation: TemporalAggregation
  observationWindow: ObservationWindow
  qualityFilter: QualityFilter
  minValidRatio: number
  missingDataHandling: MissingDataHandling
  trendMethods: TrendMethodId[]
  anomalyMethods: AnomalyMethodId[]
  datasetVersionId?: number
  cellId?: number
  bounds?: GeoBounds
}

export type TrendMethodId =
  | 'mann_kendall'
  | 'sens_slope'
  | 'seasonal_mann_kendall'
  | 'linear_regression'

export type AnomalyMethodId = 'stl' | 'robust_zscore' | 'isolation_forest'

export interface TimeSeriesPoint {
  date: string
  value: number | null
  expected: number | null
  trend: number | null
  seasonal: number | null
  qualityFlag: 'valid' | 'rejected' | 'missing'
  isAnomaly?: boolean
}

export interface TrendResult {
  direction: TrendDirection
  senSlopePerYear: number
  senSlopeLabel: string
  pValue: number
  confidenceInterval: [number, number]
  significant: boolean
  alpha: number
  mannKendallS: number
  mannKendallZ: number
  seasonalMannKendallP: number | null
  /** Null when the OLS comparison line is not declared in the protocol. */
  linearSlopePerYear: number | null
  observationCount: number
}

export interface Anomaly {
  id: string
  date: string
  observed: number
  expected: number
  score: number
  severity: AnomalySeverity
  method: AnomalyMethodId
}

export interface DataQualityMetrics {
  totalSlots: number
  validObservations: number
  rejectedObservations: number
  missingValues: number
  validRatio: number
  qcMethod: string
  datasetId: string
}

export interface SpatialCell {
  id: string
  bounds: GeoBounds
  meanValue: number
  slopePerYear: number
  pValue: number
  isLand?: boolean
}

export interface SpatialLayer {
  id: string
  name: string
  kind: 'mean_temperature' | 'trend'
  unit: string
  min: number
  max: number
  cells: SpatialCell[]
  disclaimer: string
}

export interface AIInsight {
  id: string
  experimentId: string
  summary: string
  whatChanged: string
  whereChanged: string
  significance: string
  seasonal: string
  tourism: string
  limitations: string
  evidenceLinks: { label: string; target: string }[]
  suggestedQuestions: string[]
}

export interface Experiment {
  id: string
  configuration: ExperimentConfiguration
  status: ExperimentStatus
  createdAt: string
  updatedAt: string
  runStartedAt: string | null
  runCompletedAt: string | null
  progressStep: string | null
  progressIndex: number
  results: AnalysisResults | null
  isDemo: boolean
  source?: 'api'
  liveResult?: TrendResponse
  error?: string | null
  context?: {
    regionName: string
    indicatorName: string
    indicatorUnit: string
    datasetName: string
    temporalSupport: string
  }
}

export interface AnalysisResults {
  experimentId: string
  generatedAt: string
  isIllustrative: boolean
  trend: TrendResult
  series: TimeSeriesPoint[]
  monthlySeries: TimeSeriesPoint[]
  anomalies: Anomaly[]
  quality: DataQualityMetrics
  spatial: SpatialLayer[]
  insight: AIInsight
  limitations: string[]
  methodologyNote: string
}

export interface ResearchSession {
  id: string
  label: string
  createdAt: string
  lastActiveAt: string
}

export interface ExportFile {
  filename: string
  mimeType: string
  contents: string
}

export interface ApiErrorShape {
  message: string
  code: string
  status: number
}
