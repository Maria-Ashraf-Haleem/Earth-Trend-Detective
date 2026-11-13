import type { Experiment } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { LazyPlot } from '@/components/charts/LazyPlot'
import { chartTheme, CHART_FONT } from '@/utils/chartTheme'

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
  const paletteTheme = chartTheme(dark)
  const ink = paletteTheme.ink
  const muted = paletteTheme.muted
  const grid = paletteTheme.grid
  const palette = paletteTheme.series

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
      <LazyPlot
        height={height}
        data={traces}
        layout={{
          autosize: true,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { family: CHART_FONT, color: muted, size: 10.5 },
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
            bgcolor: paletteTheme.hoverBg,
            bordercolor: paletteTheme.hoverBorder,
            font: { family: CHART_FONT, size: 10.5, color: ink },
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
