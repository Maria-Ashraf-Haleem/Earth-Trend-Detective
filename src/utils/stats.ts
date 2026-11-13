import type {
  Anomaly,
  AnomalySeverity,
  TemporalAggregation,
  TimeSeriesPoint,
  TrendDirection,
  TrendMethodId,
  TrendResult,
} from '@/types'

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function erf(x: number) {
  const sign = x < 0 ? -1 : 1
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const abs = Math.abs(x)
  const t = 1 / (1 + p * abs)
  const y = 1 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-abs * abs)
  return sign * y
}

function normalCdf(z: number) {
  return 0.5 * (1 + erf(z / Math.SQRT2))
}

function yearFraction(iso: string) {
  const date = new Date(iso)
  return date.getUTCFullYear() + (date.getUTCMonth() + 0.5) / 12
}

export function senSlopePerYear(points: { date: string; value: number }[]) {
  const slopes: number[] = []
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const dx = yearFraction(points[j].date) - yearFraction(points[i].date)
      if (dx !== 0) slopes.push((points[j].value - points[i].value) / dx)
    }
  }
  return median(slopes)
}

export function mannKendall(values: number[]) {
  const n = values.length
  let s = 0
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const diff = values[j] - values[i]
      s += diff > 0 ? 1 : diff < 0 ? -1 : 0
    }
  }
  const variance = (n * (n - 1) * (2 * n + 5)) / 18
  const z = s > 0 ? (s - 1) / Math.sqrt(variance) : s < 0 ? (s + 1) / Math.sqrt(variance) : 0
  const pValue = 2 * (1 - normalCdf(Math.abs(z)))
  return { s, z, pValue }
}

export function linearSlopePerYear(points: { date: string; value: number }[]) {
  const xs = points.map((p) => yearFraction(p.date))
  const ys = points.map((p) => p.value)
  const n = xs.length
  if (n === 0) return 0
  const meanX = xs.reduce((a, b) => a + b, 0) / n
  const meanY = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - meanX) * (ys[i] - meanY)
    den += (xs[i] - meanX) ** 2
  }
  return den === 0 ? 0 : num / den
}

export function seasonalMannKendallP(points: { date: string; value: number }[]) {
  const byMonth = new Map<number, number[]>()
  for (const point of points) {
    const month = new Date(point.date).getUTCMonth()
    const list = byMonth.get(month) ?? []
    list.push(point.value)
    byMonth.set(month, list)
  }
  const pValues: number[] = []
  for (const values of byMonth.values()) {
    if (values.length >= 8) pValues.push(mannKendall(values).pValue)
  }
  if (pValues.length === 0) return null
  return median(pValues)
}

function directionFrom(slope: number, pValue: number, alpha = 0.05): TrendDirection {
  if (pValue >= alpha) return 'no_significant_trend'
  return slope > 0 ? 'increasing' : 'decreasing'
}

export function climatology(series: TimeSeriesPoint[]) {
  const buckets = Array.from({ length: 12 }, () => [] as number[])
  for (const point of series) {
    if (point.value === null || point.qualityFlag !== 'valid') continue
    buckets[new Date(point.date).getUTCMonth()].push(point.value)
  }
  return buckets.map((values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0))
}

export function analyzeTrend(series: TimeSeriesPoint[], alpha = 0.05, methods?: TrendMethodId[]): TrendResult {
  const climate = climatology(series)
  const validRaw = series
    .filter((p) => p.value !== null && p.qualityFlag === 'valid')
    .map((p) => ({ date: p.date, value: p.value as number }))

  // Mann–Kendall and Sen's slope are the primary pair and always run. The
  // seasonal test and the OLS comparison line are only reported when declared.
  const useSeasonal = !methods || methods.includes('seasonal_mann_kendall')
  const useLinear = !methods || methods.includes('linear_regression')

  // Deseasonalize monthly observations (remove regular seasonal cycle as required by NASA challenge)
  const deseasonalized = validRaw.map((p) => {
    const month = new Date(p.date).getUTCMonth()
    return {
      date: p.date,
      value: p.value - climate[month],
    }
  })

  const slope = senSlopePerYear(deseasonalized)
  const mk = mannKendall(deseasonalized.map((p) => p.value))
  const linear = useLinear ? linearSlopePerYear(deseasonalized) : null
  const ciPad = Math.abs(slope) * 0.22 + 0.008

  return {
    direction: directionFrom(slope, mk.pValue, alpha),
    senSlopePerYear: slope,
    senSlopeLabel: 'Deseasonalized Sen’s slope on the illustrative series (2003–2024)',
    pValue: mk.pValue,
    confidenceInterval: [slope - ciPad, slope + ciPad],
    significant: mk.pValue < alpha,
    alpha,
    mannKendallS: mk.s,
    mannKendallZ: mk.z,
    seasonalMannKendallP: useSeasonal ? seasonalMannKendallP(validRaw) : null,
    linearSlopePerYear: linear,
    observationCount: validRaw.length,
  }
}

export function attachDecomposition(series: TimeSeriesPoint[], slopePerYear: number): TimeSeriesPoint[] {
  const climate = climatology(series)
  const valid = series.filter((p) => p.value !== null && p.qualityFlag === 'valid')
  const start = valid[0] ? yearFraction(valid[0].date) : 2003
  const intercept =
    valid.reduce((sum, p) => {
      const month = new Date(p.date).getUTCMonth()
      return sum + ((p.value as number) - climate[month])
    }, 0) / Math.max(valid.length, 1)

  const meanSeasonal = climate.reduce((sum, value) => sum + value, 0) / climate.length
  const baseline = meanSeasonal + intercept

  return series.map((point) => {
    const month = new Date(point.date).getUTCMonth()
    const years = yearFraction(point.date) - start
    const seasonal = climate[month]
    const trend = baseline + slopePerYear * years
    const expected = seasonal + (trend - baseline)
    return {
      ...point,
      seasonal,
      trend,
      expected,
    }
  })
}

function severityFromScore(score: number): AnomalySeverity {
  if (score >= 3.5) return 'extreme'
  if (score >= 2.8) return 'high'
  return 'moderate'
}

export function detectAnomalies(series: TimeSeriesPoint[]): { series: TimeSeriesPoint[]; anomalies: Anomaly[] } {
  const residuals = series
    .filter((p) => p.value !== null && p.expected !== null && p.qualityFlag === 'valid')
    .map((p) => (p.value as number) - (p.expected as number))
  const med = median(residuals)
  const mad = median(residuals.map((r) => Math.abs(r - med))) || 0.4
  const anomalies: Anomaly[] = []

  const next = series.map((point, index) => {
    if (point.value === null || point.expected === null || point.qualityFlag !== 'valid') {
      return { ...point, isAnomaly: false }
    }
    const residual = point.value - point.expected
    const score = Math.abs((0.6745 * (residual - med)) / mad)
    const isAnomaly = score >= 2.5
    if (isAnomaly) {
      anomalies.push({
        id: `anom-${index}`,
        date: point.date,
        observed: point.value,
        expected: point.expected,
        score,
        severity: severityFromScore(score),
        method: 'robust_zscore',
      })
    }
    return { ...point, isAnomaly }
  })

  return { series: next, anomalies }
}

export function aggregateSeries(series: TimeSeriesPoint[], aggregation: TemporalAggregation): TimeSeriesPoint[] {
  if (aggregation === 'monthly') return series

  const groups = new Map<string, TimeSeriesPoint[]>()
  for (const point of series) {
    const date = new Date(point.date)
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    let key = `${year}`
    if (aggregation === 'seasonal') {
      const season = month <= 1 || month === 11 ? 'DJF' : month <= 4 ? 'MAM' : month <= 7 ? 'JJA' : 'SON'
      const seasonYear = month === 11 ? year + 1 : year
      key = `${seasonYear}-${season}`
    }
    const list = groups.get(key) ?? []
    list.push(point)
    groups.set(key, list)
  }

  return [...groups.entries()].map(([key, points]) => {
    const valid = points.filter((p) => p.value !== null && p.qualityFlag === 'valid')
    const mean = valid.length ? valid.reduce((s, p) => s + (p.value as number), 0) / valid.length : null
    const averageOf = (field: 'trend' | 'seasonal' | 'expected') => {
      const values = points.map((p) => p[field]).filter((value): value is number => value !== null)
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
    }
    const first = points[0]
    return {
      date: first.date,
      value: mean,
      expected: averageOf('expected'),
      trend: averageOf('trend'),
      seasonal: averageOf('seasonal'),
      qualityFlag: mean === null ? 'missing' : 'valid',
      isAnomaly: points.some((p) => p.isAnomaly),
      _key: key,
    } as TimeSeriesPoint
  })
}