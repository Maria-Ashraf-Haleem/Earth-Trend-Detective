import { divergingTrend, gradientCss, sequentialTemp, TREND_RAMP, TEMPERATURE_RAMP } from '@/utils/color'
import type { Region, SpatialLayer } from '@/types'
import { useEffect, useMemo } from 'react'
import { GeoJSON, MapContainer, Rectangle, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'

const DEFAULT_PAD: [number, number, number, number] = [26, 26, 26, 26]

function Fit({
  bounds,
  pad = DEFAULT_PAD,
}: {
  bounds: LatLngBoundsExpression
  /** [top, right, bottom, left] clearance for the narrow-layout map overlays. */
  pad?: [number, number, number, number]
}) {
  const map = useMap()
  useEffect(() => {
    const { x } = map.getSize()
    // On the full-bleed Explore layout the control rail and preview dock cover
    // the map, so fit the study extent into the clear field instead of the
    // whole container.
    if (x >= 1100) {
      map.fitBounds(bounds, {
        paddingTopLeft: [390, 80],
        paddingBottomRight: [80, 300],
      })
      return
    }
    map.fitBounds(bounds, {
      paddingTopLeft: [pad[3], pad[0]],
      paddingBottomRight: [pad[1], pad[2]],
    })
  }, [bounds, map, pad])
  return null
}

export function StudyMap({
  region,
  layer,
  dark,
  selectedCellId,
  onSelectCell,
  interactive = true,
  showBoundary = true,
  docked = false,
  fitPadding,
}: {
  region: Region
  layer: SpatialLayer | null
  dark: boolean
  selectedCellId?: string | null
  onSelectCell?: (id: string) => void
  interactive?: boolean
  showBoundary?: boolean
  /** Keep Leaflet chrome clear of the Explore control rail and preview dock. */
  docked?: boolean
  /** [top, right, bottom, left] clearance for overlay headers on narrow screens. */
  fitPadding?: [number, number, number, number]
}) {
  const bounds: LatLngBoundsExpression = useMemo(
    () => [
      [region.bounds.south, region.bounds.west],
      [region.bounds.north, region.bounds.east],
    ],
    [region],
  )

  const tiles = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

  const geojson = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: {},
      geometry: region.boundary,
    }),
    [region],
  )

  return (
    <MapContainer
      className={docked ? 'field-map field-map--docked h-full w-full' : 'h-full w-full'}
      center={region.centroid}
      zoom={11}
      scrollWheelZoom
      zoomControl={false}
      attributionControl
      dragging={interactive}
      keyboard={interactive}
    >
      <TileLayer
        key={dark ? 'basemap-dark' : 'basemap-light'}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Basemap is not NASA data'
        url={tiles}
        className={dark ? 'basemap-tiles basemap-dark' : 'basemap-tiles basemap-light'}
      />
      <Fit bounds={bounds} pad={fitPadding} />
      <ZoomControl position="bottomright" />
      <ScaleControl position={docked ? 'bottomright' : 'bottomleft'} imperial={false} />
      {showBoundary ? (
        <GeoJSON
          key={`${region.id}-${dark}`}
          data={geojson}
          pathOptions={{ color: 'var(--accent)', weight: 1.4, fillOpacity: 0.02, dashArray: '5 4' }}
        />
      ) : null}
      {layer?.cells.map((cell) => {
        const t =
          layer.kind === 'trend'
            ? (cell.slopePerYear - layer.min) / (layer.max - layer.min || 1)
            : (cell.meanValue - layer.min) / (layer.max - layer.min || 1)
        const fill = layer.kind === 'trend' ? divergingTrend(t) : sequentialTemp(t)
        const selected = selectedCellId === cell.id
        return (
          <Rectangle
            key={cell.id}
            bounds={[
              [cell.bounds.south, cell.bounds.west],
              [cell.bounds.north, cell.bounds.east],
            ]}
            pathOptions={{
              color: selected ? 'var(--accent)' : fill,
              weight: selected ? 2 : 0.3,
              opacity: selected ? 1 : 0.15,
              fillColor: fill,
              fillOpacity: selected ? 0.88 : 0.7,
            }}
            eventHandlers={{
              click: () => onSelectCell?.(cell.id),
            }}
          >
            <Tooltip sticky>
              <div className="min-w-[132px] font-sans">
                <p className="label text-[var(--faint)]">Illustrative cell</p>
                <p className="mt-1 flex justify-between gap-4 text-[11px]">
                  <span className="text-[var(--muted)]">Mean LST</span>
                  <span className="num">{cell.meanValue.toFixed(1)} °C</span>
                </p>
                <p className="flex justify-between gap-4 text-[11px]">
                  <span className="text-[var(--muted)]">Sen’s slope</span>
                  <span className="num">{cell.slopePerYear.toFixed(3)} °C/yr</span>
                </p>
              </div>
            </Tooltip>
          </Rectangle>
        )
      })}
    </MapContainer>
  )
}

export function MapLegend({ layer, compact = false }: { layer: SpatialLayer; compact?: boolean }) {
  const stops = layer.kind === 'trend' ? TREND_RAMP : TEMPERATURE_RAMP
  const mid = (layer.min + layer.max) / 2
  return (
    <div className="w-full max-w-[300px] border border-[var(--line-strong)] bg-[color-mix(in_srgb,var(--surface)_96%,transparent)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-3 py-2">
        <p className="font-mono text-[8.5px] tracking-[0.14em] uppercase text-[var(--faint)]">
          {layer.kind === 'trend' ? 'Diverging change' : 'Sequential thermal'}
        </p>
        <span className="num text-[9px] text-[var(--muted)]">{layer.unit}</span>
      </div>
      <div className="px-3 py-2.5">
        <p className="text-[11.5px] leading-tight text-[var(--ink)]">{layer.name}</p>
        <div className="relative mt-2.5 h-2 w-full" style={{ background: gradientCss(stops) }}>
          <span className="absolute inset-0 border border-[color-mix(in_srgb,var(--ink)_14%,transparent)]" />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8.5px] text-[var(--muted)]">
          <span>{layer.min.toFixed(2)}</span>
          {!compact ? <span>{mid.toFixed(2)}</span> : null}
          <span>{layer.max.toFixed(2)}</span>
        </div>
        <div className="tick-rule mt-1" aria-hidden />
        {!compact ? (
          <p className="mt-2 text-[9px] leading-relaxed text-[var(--faint)]">{layer.disclaimer}</p>
        ) : null}
      </div>
    </div>
  )
}
