import type { Experiment } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import Plot from 'react-plotly.js'

const DARK_PALETTE = ['#afcba6', '#b0a2ce', '#eee9d8', '#78bfbe', '#8faf93', '#d9b578']
const LIGHT_PALETTE = ['#1f5138', '#3e2e5c', '#10251c', '#2a6c70', '#4f6b57', '#7a5410']

// Series are separated by line style as well as hue, so the comparison
// survives greyscale, colour blindness and printed exports. The fitted
// trend line is always dotted and never borrows one of these patterns.
const LINE_DASHES = ['solid', 'dash', 'dashdot', 'longdash', 'longdashdot'] as const

export function MultiSeriesChart({
  experiments,
  normalize = false,
  height = 410,
}: {
  experiments: Experiment[]
  normalize?: boolean
  height?: number
}) {
  const theme = useAppStore((s) => s.theme)
  const dark = theme === 'dark'
  const ink = dark ? '#eee9d8' : '#10251c'
  const muted = dark ? '#a9b5a9' : '#3d5347'
  const grid = dark ? 'rgba(238,233,216,0.12)' : 'rgba(16,37,28,0.12)'
  const palette = dark ? DARK_PALETTE : LIGHT_PALETTE

  const traces = experiments.flatMap((experiment, index) => {
    const points = (experiment.results?.monthlySeries ?? experiment.results?.series ?? []).filter((point) => point.value !== null)
    const color = palette[index % palette.length]
    const dash = LINE_DASHES[index % LINE_DASHES.length]
    const mean = points.length ? points.reduce((sum, point) => sum + (point.value as number), 0) / points.length : 0
    const label = experiment.configuration.name
    const observed = points.map((point) => (normalize ? (point.value as number) - mean : (point.value as number)))
    const trendPoints = (experiment.results?.monthlySeries ?? []).filter((point) => point.trend !== null)
    const trendMean = trendPoints.length ? trendPoints.reduce((sum, point) => sum + (point.trend as number), 0) / trendPoints.length : 0
    const trendY = trendPoints.map((point) => (normalize ? (point.trend as number) - trendMean : (point.trend as number)))
    return [
      {
        x: points.map((point) => point.date),
        y: observed,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: label,
        line: { color, width: 1.3, dash },
        hovertemplate: `${label}<br>%{x}<br>%{y:.2f} °C<extra></extra>`,
      },
      {
        x: trendPoints.map((point) => point.date),
        y: trendY,
        type: 'scatter' as const,
        mode: 'lines' as const,
        name: `${label} trend`,
        showlegend: false,
        line: { color, width: 2.2, dash: 'dot' as const },
        hovertemplate: `Trend ${label}<br>%{y:.2f} °C<extra></extra>`,
      },
    ]
  })

  return (
    <div style={{ minHeight: height }}>
      <Plot
        data={traces}
        layout={{
          autosize: true,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { family: 'Public Sans, sans-serif', color: muted, size: 10.5 },
          margin: { l: 54, r: 16, t: 10, b: 54 },
          showlegend: true,
          legend: { orientation: 'h', x: 0, y: 1.12, font: { size: 10, color: muted }, bgcolor: 'rgba(0,0,0,0)' },
          xaxis: {
            gridcolor: grid,
            zeroline: false,
            tickfont: { size: 10, color: muted },
            title: { text: 'Observation date', font: { size: 10.5, color: muted }, standoff: 12 },
          },
          yaxis: {
            gridcolor: grid,
            zeroline: false,
            tickfont: { size: 10, color: muted },
            title: {
              text: normalize ? 'Departure from series mean (°C)' : 'Land surface temperature (°C)',
              font: { size: 10.5, color: muted },
              standoff: 10,
            },
            ticksuffix: '°',
          },
          hovermode: 'x unified',
          hoverlabel: {
            bgcolor: dark ? '#14241c' : '#fbf8ee',
            bordercolor: dark ? '#2a3a31' : '#cfc7ae',
            font: { family: 'IBM Plex Mono, monospace', size: 10.5, color: dark ? '#eee9d8' : '#10251c' },
          },
        }}
        config={{ responsive: true, displaylogo: false, displayModeBar: 'hover', modeBarButtonsToRemove: ['lasso2d', 'select2d'], scrollZoom: true }}
        style={{ width: '100%', height }}
      />
      <p className="sr-only" style={{ color: ink }}>
        Overlaid comparison of {experiments.length} illustrative temperature series.
      </p>
    </div>
  )
}
