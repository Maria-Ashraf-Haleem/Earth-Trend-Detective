import type { TimeSeriesPoint } from '@/types'

interface PlotPoint {
  x: number
  y: number
}

/**
 * Reduce a dense series to at most `limit` points by averaging inside even
 * time buckets, keeping the first and last observation. A sparkline is a
 * shape, not a data table: more vertices than pixels only adds work.
 */
function downsample(points: PlotPoint[], limit: number): PlotPoint[] {
  if (points.length <= limit) return points
  const bucketSize = points.length / limit
  const reduced: PlotPoint[] = []
  for (let index = 0; index < limit; index += 1) {
    const start = Math.floor(index * bucketSize)
    const end = Math.max(start + 1, Math.floor((index + 1) * bucketSize))
    const bucket = points.slice(start, end)
    const y = bucket.reduce((sum, point) => sum + point.y, 0) / bucket.length
    reduced.push({ x: points[start].x, y })
  }
  reduced[reduced.length - 1] = points[points.length - 1]
  return reduced
}

/**
 * Lightweight inline SVG sparkline for lists and dossier cards.
 * Plotly is reserved for the analytical chart surfaces.
 */
export function Sparkline({
  series,
  width = 220,
  height = 48,
  stroke = 'var(--chart-observed)',
  fill = true,
  className,
}: {
  series: TimeSeriesPoint[]
  width?: number
  height?: number
  stroke?: string
  fill?: boolean
  className?: string
}) {
  const values = series.filter((point) => point.value !== null)
  if (values.length < 2) return <div className={className} style={{ height }} aria-hidden />

  const raw = values.map((point) => ({ x: new Date(point.date).getTime(), y: point.value as number }))
  const points = downsample(raw, Math.max(48, Math.round(width)))

  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 3
  const spanX = maxX - minX || 1
  const spanY = maxY - minY || 1

  const coords = points.map((point) => {
    const x = pad + ((point.x - minX) / spanX) * (width - pad * 2)
    const y = height - pad - ((point.y - minY) / spanY) * (height - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })

  const id = `spark-${Math.round(minX)}-${points.length}`
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={`Time-series preview with ${values.length} observations`}
      preserveAspectRatio="none"
    >
      {fill ? (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.18" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`${pad},${height - pad} ${coords.join(' ')} ${width - pad},${height - pad}`}
            fill={`url(#${id})`}
          />
        </>
      ) : null}
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth="1.4"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
