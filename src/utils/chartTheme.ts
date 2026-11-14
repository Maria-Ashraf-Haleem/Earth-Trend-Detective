/**
 * Plotly cannot read CSS custom properties reliably, so the chart surfaces
 * mirror the tokens in `src/index.css` here. Keep the two files in step: these
 * are the same values the UI uses, not a separate palette.
 */

export const CHART_FONT = "'Inter', ui-sans-serif, system-ui, sans-serif"

export interface ChartTheme {
  ink: string
  muted: string
  grid: string
  trend: string
  seasonal: string
  anomaly: string
  hoverBg: string
  hoverBorder: string
  /** Categorical series colours for comparison charts. */
  series: string[]
}

const LIGHT: ChartTheme = {
  ink: '#0e1526',
  muted: '#5b6478',
  grid: 'rgba(14, 21, 38, 0.08)',
  trend: '#3b4fe0',
  seasonal: '#64708c',
  anomaly: '#0ea5e9',
  hoverBg: '#ffffff',
  hoverBorder: 'rgba(14, 21, 38, 0.13)',
  series: ['#3b4fe0', '#0e7490', '#b45309', '#4d7c0f', '#7c3aed', '#9f1239'],
}

const DARK: ChartTheme = {
  ink: '#e8ecf5',
  muted: '#9aa5bc',
  grid: 'rgba(255, 255, 255, 0.08)',
  trend: '#8ea0ff',
  seasonal: '#94a3b8',
  anomaly: '#38bdf8',
  hoverBg: '#141b2b',
  hoverBorder: 'rgba(255, 255, 255, 0.14)',
  series: ['#8ea0ff', '#38bdf8', '#f0b46a', '#a3e635', '#c4b5fd', '#fb7185'],
}

export function chartTheme(dark: boolean): ChartTheme {
  return dark ? DARK : LIGHT
}
