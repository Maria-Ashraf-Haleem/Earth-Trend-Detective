import { datasets, HURGHADA_BOUNDS } from '@/data/mock/catalog'
import { buildSpatialLayers } from '@/data/mock/series'
import { sequentialTemp, TEMPERATURE_RAMP } from '@/utils/color'
import { useMemo } from 'react'

const W = 760
const H = 560
const PAD = { left: 54, right: 34, top: 34, bottom: 40 }
const MAP_W = W - PAD.left - PAD.right
const MAP_H = H - PAD.top - PAD.bottom

/**
 * Survey plate built from the same illustrative spatial field used by Explore.
 * It is a designed visualisation, not satellite imagery.
 */
export function HeroPlate() {
  const layer = useMemo(() => buildSpatialLayers('daytime').find((item) => item.kind === 'mean_temperature')!, [])
  const bounds = HURGHADA_BOUNDS

  const x = (lon: number) => PAD.left + ((lon - bounds.west) / (bounds.east - bounds.west)) * MAP_W
  const y = (lat: number) => PAD.top + ((bounds.north - lat) / (bounds.north - bounds.south)) * MAP_H

  const rows = useMemo(() => {
    const map = new Map<number, number>()
    for (const cell of layer.cells) {
      const key = Number(cell.bounds.south.toFixed(4))
      map.set(key, Math.max(map.get(key) ?? 0, cell.bounds.east))
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0])
  }, [layer])

  const coastPoints = rows.map(([south, east]) => {
    const lat = south + (bounds.north - bounds.south) / 32
    return `${x(east).toFixed(1)},${y(lat).toFixed(1)}`
  })

  const seaPath = `M ${x(bounds.east)} ${PAD.top} L ${coastPoints[0]} ${coastPoints
    .slice(1)
    .map((point) => `L ${point}`)
    .join(' ')} L ${x(bounds.east)} ${PAD.top + MAP_H} Z`

  const landPath = `M ${PAD.left} ${PAD.top} L ${coastPoints[0]} ${coastPoints
    .slice(1)
    .map((point) => `L ${point}`)
    .join(' ')} L ${PAD.left} ${PAD.top + MAP_H} Z`

  const cellW = MAP_W / 20
  const cellH = MAP_H / 16
  const markerX = x(33.8116)
  const markerY = y(27.2579)

  return (
    <figure className="overflow-hidden rounded-[var(--r-panel)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--ink)]">Hurghada extent</span>
          <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium tracking-[0.05em] uppercase text-[var(--faint)]">
            Plate 01
          </span>
        </span>
        <span className="text-[11.5px] text-[var(--faint)]">
          Daytime LST · {datasets[0].shortName} · 2003–2024
        </span>
      </figcaption>

      <div className="relative mx-2 overflow-hidden rounded-[14px] border border-[var(--line)]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="relative h-auto w-full"
          role="img"
          aria-label="Illustrative land surface temperature field over the Hurghada study extent, with a stylised Red Sea coastline."
        >
          <clipPath id="hero-land">
            <path d={landPath} />
          </clipPath>

          <rect x={PAD.left} y={PAD.top} width={MAP_W} height={MAP_H} fill="var(--map-land)" />
          <path d={seaPath} fill="var(--map-sea)" />

          {/* Temperature field */}
          {layer.cells.map((cell) => {
            const t = (cell.meanValue - layer.min) / (layer.max - layer.min || 1)
            return (
              <rect
                key={cell.id}
                x={x(cell.bounds.west) + 0.5}
                y={y(cell.bounds.north) + 0.5}
                width={cellW - 1}
                height={cellH - 1}
                fill={sequentialTemp(t)}
                opacity="0.94"
                rx="1.5"
              >
                <title>{`Illustrative mean LST ${cell.meanValue.toFixed(1)} °C`}</title>
              </rect>
            )
          })}

          {/* Graticule */}
          {[0.25, 0.5, 0.75].map((tick) => (
            <g key={tick} stroke="var(--ink)" strokeOpacity="0.08">
              <line x1={PAD.left + MAP_W * tick} y1={PAD.top} x2={PAD.left + MAP_W * tick} y2={PAD.top + MAP_H} />
              <line x1={PAD.left} y1={PAD.top + MAP_H * tick} x2={PAD.left + MAP_W} y2={PAD.top + MAP_H * tick} />
            </g>
          ))}

          {/* Extent */}
          <polygon
            points={[
              [33.68, 27.05],
              [33.93, 27.05],
              [33.96, 27.18],
              [33.94, 27.32],
              [33.86, 27.4],
              [33.72, 27.38],
              [33.64, 27.24],
              [33.66, 27.12],
            ]
              .map(([lon, lat]) => `${x(lon)},${y(lat)}`)
              .join(' ')}
            fill="none"
            stroke="var(--bg)"
            strokeOpacity="0.8"
            strokeWidth="1.2"
            strokeDasharray="7 5"
          />

          {/* Target marker */}
          <g>
            <circle cx={markerX} cy={markerY} r="18" fill="none" stroke="var(--bg)" strokeOpacity="0.3" />
            <circle cx={markerX} cy={markerY} r="4" fill="var(--bg)" />
            <circle cx={markerX} cy={markerY} r="9" fill="none" stroke="var(--bg)" strokeOpacity="0.55" />
            <g transform={`translate(${markerX + 14}, ${markerY - 40})`}>
              <rect width="132" height="44" rx="8" fill="var(--surface)" fillOpacity="0.96" />
              <text x="11" y="18" fill="var(--ink)" fontSize="12" fontWeight="600" fontFamily="Inter, sans-serif">
                Hurghada
              </text>
              <text x="11" y="32" fill="var(--faint)" fontSize="9" fontFamily="Inter, sans-serif">
                27.26°N · 33.81°E
              </text>
            </g>
          </g>

          {/* Sea label */}
          <text
            x={W - PAD.right - 16}
            y={PAD.top + MAP_H / 2}
            fill="var(--bg)"
            fillOpacity="0.55"
            fontSize="9"
            fontWeight="500"
            letterSpacing="6"
            fontFamily="Inter, sans-serif"
            textAnchor="middle"
            transform={`rotate(90 ${W - PAD.right - 16} ${PAD.top + MAP_H / 2})`}
          >
            RED SEA
          </text>

          {/* North arrow */}
          <g transform={`translate(${W - PAD.right - 20}, ${PAD.top + 24})`}>
            <path d="M0 -11 L4 3.5 L0 1 L-4 3.5 Z" fill="var(--ink)" fillOpacity="0.65" />
            <text y="17" fill="var(--faint)" fontSize="8" fontWeight="500" fontFamily="Inter, sans-serif" textAnchor="middle">
              N
            </text>
          </g>

          {/* Scale bar */}
          <g transform={`translate(${W - PAD.right - 108}, ${PAD.top + MAP_H - 18})`}>
            <line x1="0" y1="0" x2="88" y2="0" stroke="var(--bg)" strokeOpacity="0.8" strokeWidth="1.3" />
            <line x1="0" y1="-3" x2="0" y2="3" stroke="var(--bg)" strokeOpacity="0.8" strokeWidth="1.3" />
            <line x1="44" y1="-2" x2="44" y2="2" stroke="var(--bg)" strokeOpacity="0.8" strokeWidth="1" />
            <line x1="88" y1="-3" x2="88" y2="3" stroke="var(--bg)" strokeOpacity="0.8" strokeWidth="1.3" />
            <text x="0" y="14" fill="var(--bg)" fillOpacity="0.75" fontSize="8" fontFamily="Inter, sans-serif">
              0
            </text>
            <text x="88" y="14" fill="var(--bg)" fillOpacity="0.75" fontSize="8" fontFamily="Inter, sans-serif" textAnchor="end">
              5 km
            </text>
          </g>
        </svg>
      </div>

      {/* Legend rail, in HTML so the type stays crisp. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
        <span className="text-[11.5px] text-[var(--muted)]">Mean LST</span>
        <div className="flex h-1.5 w-full max-w-[168px] overflow-hidden rounded-full sm:w-[168px]">
          {TEMPERATURE_RAMP.map((color, index) => (
            <span key={color} className="flex-1" style={{ background: sequentialTemp(index / 6) }} aria-hidden />
          ))}
        </div>
        <span className="num text-[11px] text-[var(--muted)]">{layer.min.toFixed(1)} °C</span>
        <span className="num text-[11px] text-[var(--faint)]">{layer.max.toFixed(1)} °C</span>
        <span className="ml-auto hidden text-[11px] text-[var(--faint)] md:block">
          20 × 16 sample grid · not a satellite granule
        </span>
      </div>
    </figure>
  )
}
