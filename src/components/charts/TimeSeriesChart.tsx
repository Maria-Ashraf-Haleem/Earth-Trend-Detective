import type { Anomaly, TimeSeriesPoint } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { LazyPlot } from '@/components/charts/LazyPlot'
import { chartTheme, CHART_FONT } from '@/utils/chartTheme'
import { formatDate, formatNumber } from '@/utils/format'

export function TimeSeriesChart({
  series,
  anomalies,
  selectedAnomalyId,
  onSelectAnomaly,
  height = 400,
  showRangeSlider = true,
  compact = false,
}: {
  series: TimeSeriesPoint[]
  anomalies?: Anomaly[]
  selectedAnomalyId?: string | null
  onSelectAnomaly?: (id: string) => void
  height?: number
  showRangeSlider?: boolean
  compact?: boolean
}) {
  const theme = useAppStore((s) => s.theme)
  const dark = theme === 'dark'
  const palette = chartTheme(dark)
  const ink = palette.ink
  const muted = palette.muted
  const grid = palette.grid
  const observedColor = palette.ink
  const trendColor = palette.trend
  const seasonalColor = palette.seasonal
  const anomalyColor = palette.anomaly
  const accent = palette.trend

  const observed = series.filter((point) => point.value !== null)
  const selected = anomalies?.find((item) => item.id === selectedAnomalyId)
  const trendPoints = series.filter((point) => point.trend !== null)
  const seasonalPoints = series.filter((point) => point.seasonal !== null)

  return (
    <div style={{ minHeight: height }} className="w-full">
      <LazyPlot
        height={height}
        data={[
          {
            x: observed.map((point) => point.date),
            y: observed.map((point) => point.value),
            type: 'scatter',
            mode: 'lines',
            name: 'Observed',
            line: { color: observedColor, width: compact ? 1.1 : 1.35 },
            hovertemplate: '%{x}<br><b>%{y:.2f} °C</b><extra></extra>',
          },
          {
            x: trendPoints.map((point) => point.date),
            y: trendPoints.map((point) => point.trend),
            type: 'scatter',
            mode: 'lines',
            name: 'Fitted trend',
            line: { color: trendColor, width: compact ? 1.5 : 2, dash: 'dash' },
            hovertemplate: 'Trend %{y:.2f} °C<extra></extra>',
          },
          {
            x: seasonalPoints.map((point) => point.date),
            y: seasonalPoints.map((point) => point.seasonal),
            type: 'scatter',
            mode: 'lines',
            name: 'Seasonal norm',
            line: { color: seasonalColor, width: 1, dash: 'dot' },
            visible: 'legendonly',
            hovertemplate: 'Seasonal norm %{y:.2f} °C<extra></extra>',
          },
          {
            x: anomalies?.map((point) => point.date) ?? [],
            y: anomalies?.map((point) => point.observed) ?? [],
            type: 'scatter',
            mode: 'markers',
            name: 'Anomaly',
            marker: { color: anomalyColor, size: compact ? 6 : 8, symbol: 'diamond', line: { color: palette.hoverBg, width: 0.6 } },
            hovertemplate: '%{x}<br>Anomaly %{y:.2f} °C<extra></extra>',
          },
          ...(selected
            ? [
                {
                  x: [selected.date],
                  y: [selected.observed],
                  type: 'scatter' as const,
                  mode: 'markers' as const,
                  name: 'Selected',
                  marker: { color: accent, size: 15, symbol: 'circle-open', line: { width: 2 } },
                  hovertemplate: `Selected anomaly, ${formatNumber(selected.score, 2)} σ<extra></extra>`,
                },
              ]
            : []),
        ]}
        layout={{
          autosize: true,
          paper_bgcolor: 'rgba(0,0,0,0)',
          plot_bgcolor: 'rgba(0,0,0,0)',
          font: { family: CHART_FONT, color: muted, size: 10.5 },
          margin: { l: compact ? 38 : 54, r: 16, t: 8, b: compact ? 34 : showRangeSlider ? 62 : 46 },
          showlegend: !compact,
          legend: {
            orientation: 'h',
            x: 0,
            y: 1.14,
            font: { size: 10, color: muted },
            bgcolor: 'rgba(0,0,0,0)',
          },
          xaxis: {
            gridcolor: grid,
            zeroline: false,
            linecolor: grid,
            tickfont: { size: 10, color: muted },
            title: compact ? undefined : { text: 'Observation date', font: { size: 10.5, color: muted }, standoff: 12 },
            rangeslider: { visible: showRangeSlider, thickness: 0.09, bgcolor: 'rgba(0,0,0,0)', bordercolor: grid, borderwidth: 1 },
            rangebreaks: [],
          },
          yaxis: {
            gridcolor: grid,
            zeroline: false,
            tickfont: { size: 10, color: muted },
            title: compact ? undefined : { text: 'Land surface temperature (°C)', font: { size: 10.5, color: muted }, standoff: 10 },
            ticksuffix: '°',
          },
          hovermode: 'x unified',
          hoverlabel: {
            bgcolor: palette.hoverBg,
            bordercolor: palette.hoverBorder,
            font: { family: CHART_FONT, size: 10.5, color: ink },
          },
          shapes: selected
            ? [
                {
                  type: 'line' as const,
                  x0: selected.date,
                  x1: selected.date,
                  y0: 0,
                  y1: 1,
                  yref: 'paper' as const,
                  line: { color: accent, width: 1, dash: 'dot' },
                },
              ]
            : [],
          annotations: selected
            ? [
                {
                  x: selected.date,
                  y: 1,
                  yref: 'paper' as const,
                  text: `Anomaly, ${formatDate(selected.date)}`,
                  showarrow: false,
                  xanchor: 'left' as const,
                  yanchor: 'bottom' as const,
                  font: { family: CHART_FONT, size: 9, color: accent },
                  bgcolor: palette.hoverBg,
                  borderpad: 3,
                },
              ]
            : [],
        }}
        config={{
          responsive: true,
          displaylogo: false,
          displayModeBar: compact ? false : 'hover',
          scrollZoom: true,
          modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d'],
        }}
        style={{ width: '100%', height }}
        onClick={(event) => {
          const date = event.points?.[0]?.x
          if (typeof date === 'string' && anomalies) {
            const match = anomalies.find((item) => item.date === date)
            if (match) onSelectAnomaly?.(match.id)
          }
        }}
      />
      <p className="sr-only">
        {ink
          ? `Illustrative land surface temperature time series containing ${observed.length} plotted observations, a fitted Sen's slope trend line, and ${anomalies?.length ?? 0} flagged anomalies.`
          : ''}
      </p>
    </div>
  )
}
