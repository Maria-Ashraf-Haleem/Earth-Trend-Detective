import { Suspense, lazy, useEffect, useRef, useState, type CSSProperties } from 'react'

interface PlotProps {
  data: Record<string, unknown>[]
  layout?: Record<string, unknown>
  config?: Record<string, unknown>
  style?: CSSProperties
  onClick?: (event: { points?: { x?: string | number }[] }) => void
}

// Plotly is ~4.5 MB. Loading it with the route would put that cost in front of
// every first visit, so the library is fetched only when a chart is near the
// viewport.
const Plot = lazy(() => import('react-plotly.js'))

function ChartPlaceholder({ height }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse rounded-[var(--r-inner)] bg-[var(--surface-2)]"
      style={{ height: height ?? 320 }}
      aria-hidden
    />
  )
}

export function LazyPlot({ height, ...props }: PlotProps & { height?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = hostRef.current
    if (!node || inView) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: '240px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [inView])

  return (
    <div ref={hostRef} className="w-full">
      {inView ? (
        <Suspense fallback={<ChartPlaceholder height={height} />}>
          <Plot {...props} />
        </Suspense>
      ) : (
        <ChartPlaceholder height={height} />
      )}
    </div>
  )
}
