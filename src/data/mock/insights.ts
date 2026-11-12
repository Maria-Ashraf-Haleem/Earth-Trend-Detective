import { formatNumber, formatPValue, formatPercent, formatSlope, trendLabel } from '@/utils/format'
import type { AIInsight, AnalysisResults, ExperimentConfiguration } from '@/types'

export function buildInsight(
  experimentId: string,
  config: ExperimentConfiguration,
  results: Pick<AnalysisResults, 'trend' | 'quality' | 'anomalies' | 'spatial'>,
): AIInsight {
  const { trend, quality, spatial } = results
  const window = config.observationWindow
  const variable = window === 'daytime' ? 'daytime land surface temperature' : 'nighttime land surface temperature'
  const slope = formatSlope(trend.senSlopePerYear)
  const direction = trendLabel(trend.direction).toLowerCase()
  const warmCells = spatial
    .find((layer) => layer.kind === 'trend')
    ?.cells.slice()
    .sort((a, b) => b.slopePerYear - a.slopePerYear)[0]

  return {
    id: `insight-${experimentId}`,
    experimentId,
    summary: `On this illustrative ${window} LST series for ${config.startDate.slice(0, 4)}–${config.endDate.slice(0, 4)}, Sen’s slope is ${slope} with Mann–Kendall p = ${formatPValue(trend.pValue)}. The test ${trend.significant ? 'rejects' : 'does not reject'} a no-trend null at α = ${trend.alpha}. This is an analysis of demo data, not a NASA finding.`,
    whatChanged: `The fitted monotonic change is ${direction}. ${trend.significant ? `A slope of ${slope} implies a multi-decadal shift in the illustrative ${variable} series, with summer months remaining the hottest part of the seasonal cycle.` : 'The estimated slope is small relative to month-to-month variability, so the demo series does not support a confident directional claim.'}`,
    whereChanged: warmCells
      ? `In the demo spatial field, steeper positive slopes concentrate toward inland cells (example ${formatNumber(warmCells.slopePerYear, 3)} °C/yr), while coastal cells are milder. This pattern is constructed for exploration, not retrieved from MODIS granules.`
      : 'Spatial structure is unavailable for this run.',
    significance: `Mann–Kendall S = ${formatNumber(trend.mannKendallS, 0)}, Z = ${formatNumber(trend.mannKendallZ, 2)}, p = ${formatPValue(trend.pValue)}. Sen’s slope 90%-style interval on the demo series is ${formatNumber(trend.confidenceInterval[0], 3)} to ${formatNumber(trend.confidenceInterval[1], 3)} °C/yr. ${trend.significant ? 'The result is statistically significant at 5% on this illustrative sample.' : 'The result is not statistically significant at 5% on this illustrative sample.'}`,
    seasonal: `Seasonal Mann–Kendall (month-wise) p ≈ ${trend.seasonalMannKendallP === null ? 'n/a' : formatPValue(trend.seasonalMannKendallP)}. Summer (JJA) remains the warm peak in the climatology. Seasonal interpretation should not be read as a tourism forecast.`,
    tourism: `Tourism planning can use LST only as a surface-heat context layer. It is not air temperature, comfort, or UV. If the illustrative daytime series is warming, outdoor scheduling may need more attention to midday shade and hydration — still a planning hypothesis, not a measured visitor-impact result.`,
    limitations: `Valid slots are ${formatPercent(quality.validRatio)} after QC (${quality.validObservations} of ${quality.totalSlots}). LST ≠ air temperature; MOD11A2 is ~1 km and 8-day; Terra overpass time can drift; demo values are not NASA observations.`,
    evidenceLinks: [
      { label: 'Trend metrics', target: 'finding' },
      { label: 'Time series', target: 'series' },
      { label: 'Spatial field', target: 'spatial' },
      { label: 'Anomaly timeline', target: 'anomalies' },
      { label: 'Data quality', target: 'quality' },
    ],
    suggestedQuestions: [
      'How does nighttime temperature compare with daytime temperature?',
      'Which season shows the strongest trend?',
      'How does the trend change when the study period is shortened?',
      'Are the detected anomalies concentrated in particular months?',
    ],
  }
}

export const LIMITATIONS = [
  'LST is not air temperature. It measures land surface radiometric temperature.',
  'Spatial resolution is approximately 1 km, so neighborhood and beach-scale features are not resolved.',
  'MOD11A2 is an 8-day composite product, not a daily time series.',
  'Quality filtering reduces the valid sample and can bias months with persistent cloud or aerosol.',
  'Terra observation time is not constant over 2003–2024; long-term trends require caution.',
  'Values shown in demo mode are illustrative and must not be cited as NASA results.',
]
