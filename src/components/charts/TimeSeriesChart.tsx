import type { Anomaly, TimeSeriesPoint } from '@/types'
import { useAppStore } from '@/store/useAppStore'
import { formatDate, formatNumber } from '@/utils/format'
import { lazy } from 'react'
import { AsyncPanel } from '@/components/common/AsyncPanel'

const Plot = lazy(() => import('./Plot'))

export function TimeSeriesChart({
  series,
  anomalies,
  selectedAnomalyId,
  onSelectAnomaly,
  height = 400,
  showRangeSlider = true,
  compact = false,
  unit = 'degC',
  axisLabel,
  temporalLabel = 'Source month',
}: {
  series: TimeSeriesPoint[]
  anomalies?: Anomaly[]
  selectedAnomalyId?: string | null
  onSelectAnomaly?: (id: string) => void
  height?: number
  showRangeSlider?: boolean
  compact?: boolean
  unit?: string
  axisLabel?: string
  temporalLabel?: string
}) {
  const theme = useAppStore((s) => s.theme)
  const dark = theme === 'dark'
  const ink = dark ? '#eee9d8' : '#10251c'
  const muted = dark ? '#a9b5a9' : '#3d5347'
  const grid = dark ? 'rgba(238,233,216,0.12)' : 'rgba(16,37,28,0.12)'
  const observedColor = dark ? '#eee9d8' : '#10251c'
  const trendColor = dark ? '#b0a2ce' : '#3e2e5c'
  const seasonalColor = dark ? '#8faf93' : '#4f6b57'
  const anomalyColor = dark ? '#78bfbe' : '#2a6c70'
  const accent = dark ? '#b0a2ce' : '#3e2e5c'

  const observed = series
  const displayUnit = unit === 'degC' ? '°C' : unit === 'm2' ? 'm²' : unit
  const selected = anomalies?.find((item) => item.id === selectedAnomalyId)
  const trendPoints = series.filter((point) => point.trend !== null)
  const seasonalPoints = series.filter((point) => point.seasonal !== null)

  return (
    <div style={{ minHeight: height }} className="w-full">
      <AsyncPanel label="Observed chart" height={height}><Plot
        data={[
          {
            x: observed.map((point) => point.date),
            y: observed.map((point) => point.value),
            type: 'scatter',
            mode: 'lines',
            name: 'Observed',
            connectgaps: false,
            line: { color: observedColor, width: compact ? 1.1 : 1.35 },
            hovertemplate: `%{x}<br><b>%{y:.3f} ${displayUnit}</b><extra></extra>`,
          },
          {
            x: trendPoints.map((point) => point.date),
            y: trendPoints.map((point) => point.trend),
            type: 'scatter',
            mode: 'lines',
            name: 'Fitted trend',
            showlegend: trendPoints.length > 0,
            line: { color: trendColor, width: compact ? 1.5 : 2, dash: 'dash' },
            hovertemplate: `Trend %{y:.3f} ${displayUnit}<extra></extra>`,
          },
          {
            x: seasonalPoints.map((point) => point.date),
            y: seasonalPoints.map((point) => point.seasonal),
            type: 'scatter',
            mode: 'lines',
            name: 'Seasonal norm',
            showlegend: seasonalPoints.length > 0,
            line: { color: seasonalColor, width: 1, dash: 'dot' },
            visible: 'legendonly',
            hovertemplate: `Seasonal norm %{y:.3f} ${displayUnit}<extra></extra>`,
          },
          {
            x: anomalies?.map((point) => point.date) ?? [],
            y: anomalies?.map((point) => point.observed) ?? [],
            type: 'scatter',
            mode: 'markers',
            name: 'Anomaly',
            showlegend: Boolean(anomalies?.length),
            marker: { color: anomalyColor, size: compact ? 6 : 8, symbol: 'diamond', line: { color: dark ? '#0a1310' : '#f7f3e7', width: 0.6 } },
            hovertemplate: `%{x}<br>Anomaly %{y:.3f} ${displayUnit}<extra></extra>`,
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
          font: { family: 'Public Sans, sans-serif', color: muted, size: 10.5 },
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
            title: compact ? undefined : { text: temporalLabel, font: { size: 10.5, color: muted }, standoff: 12 },
            rangeslider: { visible: showRangeSlider, thickness: 0.09, bgcolor: 'rgba(0,0,0,0)', bordercolor: grid, borderwidth: 1 },
            rangebreaks: [],
          },
          yaxis: {
            gridcolor: grid,
            zeroline: false,
            tickfont: { size: 10, color: muted },
            title: compact ? undefined : { text: axisLabel ?? `Observed value (${displayUnit})`, font: { size: 10.5, color: muted }, standoff: 10 },
          },
          hovermode: 'x unified',
          hoverlabel: {
            bgcolor: dark ? '#14241c' : '#fbf8ee',
            bordercolor: dark ? '#2a3a31' : '#cfc7ae',
            font: { family: 'IBM Plex Mono, monospace', size: 10.5, color: dark ? '#eee9d8' : '#10251c' },
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
                  font: { family: 'IBM Plex Mono, monospace', size: 9, color: accent },
                  bgcolor: dark ? '#0f1b15' : '#f7f3e7',
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
      /></AsyncPanel>
      <p className="sr-only">
        {ink
          ? `Observed monthly series in ${displayUnit}, containing ${observed.filter(p => p.value !== null).length} nonmissing values. Missing months remain gaps.`
          : ''}
      </p>
    </div>
  )
}
