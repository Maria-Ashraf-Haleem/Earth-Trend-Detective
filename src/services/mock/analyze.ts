import { datasets, regions, variables } from '@/data/mock/catalog'
import { buildInsight, LIMITATIONS } from '@/data/mock/insights'
import {
  buildSpatialLayers,
  nighttimeSeries,
  sliceSeries,
  daytimeSeries,
  urbanDaytimeSeries,
  urbanNighttimeSeries,
} from '@/data/mock/series'
import type { AnalysisResults, DataQualityMetrics, ExperimentConfiguration } from '@/types'
import { aggregateSeries, analyzeTrend, attachDecomposition, detectAnomalies } from '@/utils/stats'

export function catalog() {
  return { regions, datasets, variables }
}

export function qualityMetrics(
  config: ExperimentConfiguration,
  total: number,
  valid: number,
  rejected: number,
  missing: number,
): DataQualityMetrics {
  return {
    totalSlots: total,
    validObservations: valid,
    rejectedObservations: rejected,
    missingValues: missing,
    validRatio: total === 0 ? 0 : valid / total,
    qcMethod:
      config.qualityFilter === 'best'
        ? 'NASA Error_K < 1.5 K strict physical filter (133 granules)'
        : config.qualityFilter === 'good'
          ? 'NASA Error_K < 3.0 K validated retrieval filter'
          : 'All valid raw MODIS retrievals',
    datasetId: config.datasetId,
  }
}

export function runAnalysis(experimentId: string, config: ExperimentConfiguration): AnalysisResults {
  const isUrban = config.regionId === 'urban-resorts'
  const source =
    config.observationWindow === 'nighttime'
      ? isUrban
        ? urbanNighttimeSeries
        : nighttimeSeries
      : isUrban
        ? urbanDaytimeSeries
        : daytimeSeries

  const series = sliceSeries(source, config.startDate, config.endDate)

  const total = series.length
  const valid = series.filter((p) => p.qualityFlag === 'valid').length
  const rejected = series.filter((p) => p.qualityFlag === 'rejected').length
  const missing = series.filter((p) => p.qualityFlag === 'missing').length
  const quality = qualityMetrics(config, total, valid, rejected, missing)

  const trend = analyzeTrend(series, 0.05, config.trendMethods)
  const rawDecomposed = attachDecomposition(series, trend.senSlopePerYear)
  // STL supplies the seasonal and expected series. Without it the fitted Sen
  // trend still draws, but there is no remainder to score.
  const decomposed = config.anomalyMethods.includes('stl')
    ? rawDecomposed
    : rawDecomposed.map((point) => ({ ...point, seasonal: null, expected: null }))
  // The demo implements one scorer: the MAD-based robust z-score. Isolation
  // Forest is a protocol option only and never runs in the browser.
  const { series: withAnomalies, anomalies } = config.anomalyMethods.includes('robust_zscore')
    ? detectAnomalies(decomposed)
    : { series: decomposed.map((point) => ({ ...point, isAnomaly: false })), anomalies: [] }
  const displayed = aggregateSeries(withAnomalies, config.aggregation)
  const spatial = buildSpatialLayers(config.observationWindow)

  const partial = { trend, quality, anomalies, spatial }
  const insight = buildInsight(experimentId, config, partial)

  return {
    experimentId,
    generatedAt: new Date().toISOString(),
    isIllustrative: true,
    trend,
    series: displayed,
    monthlySeries: withAnomalies,
    anomalies,
    quality,
    spatial,
    insight,
    limitations: LIMITATIONS,
    methodologyNote:
      'Computed in the browser on an illustrative monthly series shaped to the Hurghada study grid (2003–2024). Methods follow the declared protocol; the series is synthetic and is not a NASA retrieval.',
  }
}

export const defaultConfiguration = (): ExperimentConfiguration => ({
  name: 'Hurghada Nighttime LST Warming (2003–2024)',
  regionId: 'hurghada',
  datasetId: 'mod11a2-061',
  variableId: 'lst-night',
  startDate: '2003-01-01',
  endDate: '2024-12-31',
  aggregation: 'monthly',
  observationWindow: 'nighttime',
  qualityFilter: 'good',
  minValidRatio: 0.9,
  missingDataHandling: 'pairwise',
  trendMethods: ['mann_kendall', 'sens_slope', 'seasonal_mann_kendall'],
  anomalyMethods: ['stl', 'robust_zscore'],
})