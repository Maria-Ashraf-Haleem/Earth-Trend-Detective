import rawCells from './hurghada_map_cells.json'
import rawZoneSeries from './hurghada_zone_timeseries.json'
import type { ObservationWindow, SpatialCell, SpatialLayer, TimeSeriesPoint } from '@/types'

interface RawMetric {
  mean: number
  slope_per_decade: number
  ci_95_decade: number
  r_squared: number
  p_value_ttest: number
  p_value_mk: number
  mk_tau: number
  is_significant: boolean
}

interface RawCell {
  cell_id: number
  lat: number
  lon: number
  zone: string
  built_surface_m2: number
  metrics: {
    lst_day?: RawMetric
    lst_night?: RawMetric
    dtr?: RawMetric
    ndvi?: RawMetric
  }
}

interface RawZonePoint {
  zone: string
  date: string
  year: number
  month: number
  lst_day: number
  lst_night: number
  dtr: number
  ndvi: number
  lst_day_anomaly: number
  lst_night_anomaly: number
  dtr_anomaly: number
  ndvi_anomaly: number
}

const typedCells = rawCells as RawCell[]
const typedSeries = rawZoneSeries as RawZonePoint[]

export function buildMonthlySeries(
  window: ObservationWindow,
  zoneName = 'Natural Red Sea Coast & Islands',
): TimeSeriesPoint[] {
  const filtered = typedSeries
    .filter((row) => row.zone === zoneName)
    .sort((a, b) => a.date.localeCompare(b.date))

  return filtered.map((row) => {
    const val = window === 'daytime' ? row.lst_day : row.lst_night
    return {
      date: `${row.date}-15`,
      value: val !== null && !Number.isNaN(val) ? Number(val.toFixed(2)) : null,
      expected: null,
      trend: null,
      seasonal: null,
      qualityFlag: 'valid',
    }
  })
}

export function sliceSeries(series: TimeSeriesPoint[], startDate: string, endDate: string) {
  return series.filter((point) => point.date >= startDate && point.date <= endDate)
}

/**
 * Builds the real 265-cell NASA MODIS spatial field over Hurghada (2003–2024).
 */
export function buildSpatialLayers(window: ObservationWindow): SpatialLayer[] {
  const metricKey = window === 'daytime' ? 'lst_day' : 'lst_night'
  const halfStep = 0.025 // 0.05° NASA climate grid cell (~5.56 km)
  const cells: SpatialCell[] = []

  for (const cell of typedCells) {
    const m = cell.metrics?.[metricKey]
    if (!m) continue

    const slopePerYear = m.slope_per_decade / 10.0
    cells.push({
      id: `cell-${cell.cell_id}`,
      bounds: {
        west: Number((cell.lon - halfStep).toFixed(4)),
        south: Number((cell.lat - halfStep).toFixed(4)),
        east: Number((cell.lon + halfStep).toFixed(4)),
        north: Number((cell.lat + halfStep).toFixed(4)),
      },
      meanValue: Number(m.mean.toFixed(2)),
      slopePerYear: Number(slopePerYear.toFixed(4)),
      pValue: Number(m.p_value_mk.toFixed(5)),
      isLand: true,
    })
  }

  const means = cells.map((c) => c.meanValue)
  const slopes = cells.map((c) => c.slopePerYear)

  return [
    {
      id: `${window}-mean`,
      name: `Mean ${window} land surface temperature (2003–2024)`,
      kind: 'mean_temperature',
      unit: '°C',
      min: Math.min(...means),
      max: Math.max(...means),
      cells,
      disclaimer:
        'Illustrative 22-year mean LST surface on the 265-cell Hurghada study grid. Synthetic, not a NASA retrieval.',
    },
    {
      id: `${window}-trend`,
      name: 'Local Decadal Trend / Slope',
      kind: 'trend',
      unit: '°C / yr',
      min: Math.min(...slopes),
      max: Math.max(...slopes),
      cells,
      disclaimer:
        'Deseasonalized trend slope (°C/yr) and Mann–Kendall significance computed from 133 NASA granules (2003–2024).',
    },
  ]
}

export const daytimeSeries = buildMonthlySeries('daytime', 'Natural Red Sea Coast & Islands')
export const nighttimeSeries = buildMonthlySeries('nighttime', 'Natural Red Sea Coast & Islands')
export const urbanDaytimeSeries = buildMonthlySeries('daytime', 'Urban Resorts & Hotels Coast')
export const urbanNighttimeSeries = buildMonthlySeries('nighttime', 'Urban Resorts & Hotels Coast')