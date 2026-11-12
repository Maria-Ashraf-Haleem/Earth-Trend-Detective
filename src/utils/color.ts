type Stop = { at: number; color: string }

function parseHex(hex: string) {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

export function lerpColor(t: number, a: string, b: string) {
  const clamped = Math.min(1, Math.max(0, t))
  const [ar, ag, ab] = parseHex(a)
  const [br, bg, bb] = parseHex(b)
  const mix = (x: number, y: number) => Math.round(x + (y - x) * clamped)
  return `rgb(${mix(ar, br)}, ${mix(ag, bg)}, ${mix(ab, bb)})`
}

function ramp(t: number, stops: Stop[]) {
  const clamped = Math.min(1, Math.max(0, t))
  for (let index = 0; index < stops.length - 1; index += 1) {
    const start = stops[index]
    const end = stops[index + 1]
    if (clamped >= start.at && clamped <= end.at) {
      const local = (clamped - start.at) / (end.at - start.at || 1)
      return lerpColor(local, start.color, end.color)
    }
  }
  return stops[stops.length - 1].color
}

/** Perceptually ordered thermal scale for land surface temperature. */
const TEMPERATURE_STOPS: Stop[] = [
  { at: 0, color: '#3d5bd9' },
  { at: 0.2, color: '#8fa6ef' },
  { at: 0.4, color: '#c7d3f6' },
  { at: 0.56, color: '#eef2fa' },
  { at: 0.74, color: '#f2c078' },
  { at: 0.9, color: '#e0873f' },
  { at: 1, color: '#c9453b' },
]

/** Diverging scale for signed change (cooling ↔ warming). */
const TREND_STOPS: Stop[] = [
  { at: 0, color: '#2e5fd0' },
  { at: 0.25, color: '#9db8f0' },
  { at: 0.5, color: '#eef1f7' },
  { at: 0.75, color: '#f3c07d' },
  { at: 1, color: '#c7443a' },
]

export const TEMPERATURE_RAMP = TEMPERATURE_STOPS.map((stop) => stop.color)
export const TREND_RAMP = TREND_STOPS.map((stop) => stop.color)

export function sequentialTemp(t: number) {
  return ramp(t, TEMPERATURE_STOPS)
}

export function divergingTrend(t: number) {
  return ramp(t, TREND_STOPS)
}

export function dataColor(kind: 'mean_temperature' | 'trend', t: number) {
  return kind === 'trend' ? divergingTrend(t) : sequentialTemp(t)
}

export function gradientCss(stops: string[]) {
  return `linear-gradient(90deg, ${stops
    .map((color, index) => `${color} ${Math.round((index / (stops.length - 1)) * 100)}%`)
    .join(', ')})`
}
