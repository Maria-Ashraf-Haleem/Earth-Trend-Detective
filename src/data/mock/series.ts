import { DAY_CLIMATE, NIGHT_CLIMATE, HURGHADA_BOUNDS } from '@/data/mock/catalog'
import type { ObservationWindow, SpatialCell, SpatialLayer, TimeSeriesPoint } from '@/types'

function rng(seed: number) {
  let state = seed % 2147483647
  if (state <= 0) state += 2147483646
  return () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
}

/** Deterministic value noise used only to shape the illustrative demo field. */
function noise2d(x: number, y: number, seed: number) {
  const value = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453
  return (value - Math.floor(value)) * 2 - 1
}

export function buildMonthlySeries(window: ObservationWindow): TimeSeriesPoint[] {
  const climate = window === 'daytime' ? DAY_CLIMATE : NIGHT_CLIMATE
  const trend = window === 'daytime' ? 0.038 : 0.052
  const noiseScale = window === 'daytime' ? 0.85 : 0.68
  const random = rng(window === 'daytime' ? 11 : 29)
  const points: TimeSeriesPoint[] = []

  for (let year = 2003; year <= 2024; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-15`
      const years = year - 2003 + month / 12
      const noise = (random() - 0.5) * 2 * noiseScale
      let quality: TimeSeriesPoint['qualityFlag'] = 'valid'
      if (random() < 0.032) quality = 'missing'
      else if (random() < 0.052) quality = 'rejected'

      let value = climate[month] + trend * years + noise
      if (year === 2010 && month === 7) value += window === 'daytime' ? 3.4 : 2.1
      if (year === 2015 && month === 7) value += window === 'daytime' ? 2.8 : 1.7
      if (year === 2021 && month === 0) value -= window === 'daytime' ? 2.6 : 1.9
      if (year === 2023 && month === 7) value += window === 'daytime' ? 3.1 : 2.4

      points.push({
        date,
        value: quality === 'missing' ? null : Number(value.toFixed(2)),
        expected: null,
        trend: null,
        seasonal: null,
        qualityFlag: quality,
      })
    }
  }
  return points
}

export function sliceSeries(series: TimeSeriesPoint[], startDate: string, endDate: string) {
  return series.filter((point) => point.date >= startDate && point.date <= endDate)
}

/**
 * Builds an illustrative, statically generated spatial field.
 * The coastline is approximate and the values are designed — not retrieved.
 */
export function buildSpatialLayers(window: ObservationWindow): SpatialLayer[] {
  const { west, south, east, north } = HURGHADA_BOUNDS
  const cols = 20
  const rows = 16
  const dx = (east - west) / cols
  const dy = (north - south) / rows
  const meanBase = window === 'daytime' ? 32.4 : 20.6
  const slopeBase = window === 'daytime' ? 0.026 : 0.039
  const cells: SpatialCell[] = []

  for (let r = 0; r < rows; r += 1) {
    const latN = r / (rows - 1)
    // Stylised Red Sea coastline: land to the west, water to the east.
    const coast =
      0.61 +
      0.055 * Math.sin(latN * Math.PI * 1.7 + 0.5) +
      0.018 * Math.cos(latN * Math.PI * 4.2)
    for (let c = 0; c < cols; c += 1) {
      const inlandN = c / (cols - 1)
      const isLand = inlandN < coast
      const n = noise2d(c * 0.8, r * 0.8, window === 'daytime' ? 3 : 7)
      const urban = Math.exp(-((inlandN - 0.48) ** 2 / 0.018 + (latN - 0.52) ** 2 / 0.05))
      const ridge = Math.max(0, inlandN - 0.58) * 1.9
      const meanValue =
        meanBase +
        inlandN * 2.6 +
        urban * 1.55 +
        ridge * 0.55 -
        latN * 0.45 +
        n * 0.24
      const slopePerYear = slopeBase + inlandN * 0.016 + urban * 0.011 - latN * 0.004 + n * 0.0035

      cells.push({
        id: `cell-${r}-${c}`,
        bounds: {
          west: west + c * dx,
          south: south + r * dy,
          east: west + (c + 1) * dx,
          north: south + (r + 1) * dy,
        },
        meanValue: Number(meanValue.toFixed(2)),
        slopePerYear: Number(slopePerYear.toFixed(4)),
        pValue: Number(Math.max(0.0004, 0.05 - urban * 0.044 - inlandN * 0.01).toFixed(4)),
        isLand,
      })
    }
  }

  const land = cells.filter((cell) => cell.isLand)
  const means = land.map((c) => c.meanValue)
  const slopes = land.map((c) => c.slopePerYear)

  return [
    {
      id: `${window}-mean`,
      name: 'Mean land surface temperature',
      kind: 'mean_temperature',
      unit: '°C',
      min: Math.min(...means),
      max: Math.max(...means),
      cells: land,
      disclaimer: 'Designed demo field. Not a NASA LST retrieval or granule mosaic.',
    },
    {
      id: `${window}-trend`,
      name: 'Local Sen’s slope',
      kind: 'trend',
      unit: '°C / yr',
      min: Math.min(...slopes),
      max: Math.max(...slopes),
      cells: land,
      disclaimer: 'Cell slopes are simulated spatial structure for interface demonstration.',
    },
  ]
}

export const daytimeSeries = buildMonthlySeries('daytime')
export const nighttimeSeries = buildMonthlySeries('nighttime')
