import { datasets, regions, variables } from '@/data/mock/catalog'
import { buildInsight, LIMITATIONS } from '@/data/mock/insights'
import { buildSpatialLayers, nighttimeSeries, sliceSeries, daytimeSeries } from '@/data/mock/series'
import type { AnalysisResults, DataQualityMetrics, ExperimentConfiguration } from '@/types'
import { aggregateSeries, analyzeTrend, attachDecomposition, detectAnomalies } from '@/utils/stats'

export function catalog() {
  return { regions, datasets, variables }
}

export function qualityMetrics(config: ExperimentConfiguration, total: number, valid: number, rejected: number, missing: number): DataQualityMetrics {
  return {
    totalSlots: total,
    validObservations: valid,
    rejectedObservations: rejected,
    missingValues: missing,
    validRatio: total === 0 ? 0 : valid / total,
    qcMethod:
      config.qualityFilter === 'best'
        ? 'Keep highest-quality QC bits only (demo rule)'
        : config.qualityFilter === 'good'
          ? 'Exclude poor QC flags (demo rule)'
          : 'No extra QC filter (demo)',
    datasetId: config.datasetId,
  }
}

export function runAnalysis(experimentId: string, config: ExperimentConfiguration): AnalysisResults {
  const source = config.observationWindow === 'nighttime' ? nighttimeSeries : daytimeSeries
  let series = sliceSeries(source, config.startDate, config.endDate)

  if (config.qualityFilter === 'best') {
    series = series.map((point, index) =>
      point.qualityFlag === 'valid' && index % 17 === 0 ? { ...point, qualityFlag: 'rejected', value: null } : point,
    )
  }

  const total = series.length
  const valid = series.filter((p) => p.qualityFlag === 'valid').length
  const rejected = series.filter((p) => p.qualityFlag === 'rejected').length
  const missing = series.filter((p) => p.qualityFlag === 'missing').length
  const quality = qualityMetrics(config, total, valid, rejected, missing)

  const trend = analyzeTrend(series)
  const decomposed = attachDecomposition(series, trend.senSlopePerYear)
  const { series: withAnomalies, anomalies } = detectAnomalies(decomposed)
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
      'Trend statistics are computed in the browser on an illustrative monthly series so the interface can stay internally consistent. They are not NASA-processed Earth observations.',
  }
}

export const defaultConfiguration = (): ExperimentConfiguration => ({
  name: 'Hurghada LST 2003–2024',
  regionId: 'hurghada',
  datasetId: 'mod11a2-061',
  variableId: 'lst-day',
  startDate: '2003-01-01',
  endDate: '2024-12-31',
  aggregation: 'monthly',
  observationWindow: 'daytime',
  qualityFilter: 'good',
  minValidRatio: 0.7,
  missingDataHandling: 'pairwise',
  trendMethods: ['mann_kendall', 'sens_slope', 'seasonal_mann_kendall'],
  anomalyMethods: ['stl', 'robust_zscore'],
})
