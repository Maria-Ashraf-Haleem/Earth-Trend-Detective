import { useEffect, useMemo, useState } from 'react'
import { CircleMarker, MapContainer, Rectangle, ScaleControl, TileLayer, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import type { ApiRegion, Cell } from '@/types/environment'
import { sequentialTemp } from '@/utils/color'
import 'leaflet/dist/leaflet.css'

export interface VisibleBounds {
  west: number
  south: number
  east: number
  north: number
}

const DEFAULT_PADDING: [number, number, number, number] = [26, 26, 26, 26]

function FitSourceExtent({ bounds, padding, docked }: {
  bounds: LatLngBoundsExpression
  padding: [number, number, number, number]
  docked: boolean
}) {
  const map = useMap()
  useEffect(() => {
    const wide = docked && map.getSize().x >= 1100
    map.fitBounds(bounds, {
      paddingTopLeft: wide ? [370, 105] : [padding[3], padding[0]],
      paddingBottomRight: wide ? [55, 280] : [padding[1], padding[2]],
      maxZoom: 13,
    })
  }, [bounds, docked, map, padding])
  return null
}

function VisibleExtentButton({ onUseVisibleBounds }: { onUseVisibleBounds: (bounds: VisibleBounds) => void }) {
  const map = useMap()
  return (
    <button
      type="button"
      className="absolute top-3 right-3 z-[1000] rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[11px] font-medium text-[var(--ink)] shadow-[var(--shadow-card)] hover:bg-[var(--surface-2)]"
      onClick={(event) => {
        event.stopPropagation()
        const bounds = map.getBounds()
        onUseVisibleBounds({ west: Math.max(-180, bounds.getWest()), south: Math.max(-90, bounds.getSouth()),
          east: Math.min(180, bounds.getEast()), north: Math.min(90, bounds.getNorth()) })
      }}
    >
      Use visible extent
    </button>
  )
}

/** Source cell centers only. The API does not provide validated cell polygons. */
export function LiveStudyMap({ region, cells, values, unit = '', selectedCellId, onSelectCell, dark,
  showValues = true, showExtent = true, docked = false, fitPadding = DEFAULT_PADDING, onUseVisibleBounds }: {
  region: ApiRegion
  cells: Cell[]
  values?: ReadonlyMap<number, number | null>
  unit?: string
  selectedCellId?: number | null
  onSelectCell?: (id: number) => void
  dark: boolean
  showValues?: boolean
  showExtent?: boolean
  docked?: boolean
  fitPadding?: [number, number, number, number]
  onUseVisibleBounds?: (bounds: VisibleBounds) => void
}) {
  const [tileError, setTileError] = useState(false)
  const [tileAttempt, setTileAttempt] = useState(0)
  const tileEvents = useMemo(() => ({ tileerror: () => setTileError(true) }), [])
  const bounds = useMemo<LatLngBoundsExpression | null>(() => region.bounds ? [
    [region.bounds.south, region.bounds.west], [region.bounds.north, region.bounds.east],
  ] : null, [region.bounds])
  const finite = useMemo(() => [...(values?.values() ?? [])].filter((value): value is number =>
    value !== null && Number.isFinite(value)), [values])
  const low = finite.length ? Math.min(...finite) : null
  const high = finite.length ? Math.max(...finite) : null
  const displayUnit = unit === 'degC' ? '\u00b0C' : unit === 'm2' ? 'm\u00b2' : unit
  if (!bounds || !region.centroid) {
    return <div className="flex h-full items-center justify-center bg-[var(--surface-2)] p-6 text-center text-[13px] text-[var(--muted)]">This region has no verified cell-center extent.</div>
  }
  return (
    <MapContainer className={docked ? 'field-map field-map--docked h-full w-full' : 'h-full w-full'}
      center={region.centroid} zoom={11} scrollWheelZoom zoomControl={false} attributionControl>
      <TileLayer key={tileAttempt} eventHandlers={tileEvents} url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors. Source markers are cell centers'
        className={dark ? 'basemap-tiles basemap-dark' : 'basemap-tiles basemap-light'} />
      <FitSourceExtent bounds={bounds} padding={fitPadding} docked={docked} />
      <ZoomControl position="bottomright" />
      <ScaleControl position="bottomright" imperial={false} />
      {tileError ? <div role="status" className="absolute bottom-7 left-3 z-[1000] max-w-[270px] rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] p-3 text-[11px] text-[var(--muted)]">
        Some OpenStreetMap background tiles could not load. Source coordinates remain available.
        <button type="button" className="mt-2 block underline" onClick={() => { setTileError(false); setTileAttempt(n => n + 1) }}>Retry background map</button>
      </div> : null}
      {onUseVisibleBounds ? <VisibleExtentButton onUseVisibleBounds={onUseVisibleBounds} /> : null}
      {showExtent ? <Rectangle bounds={bounds} pathOptions={{ color: '#827d9a', weight: 1.3, fillOpacity: 0, dashArray: '5 4', interactive: false }} /> : null}
      {cells.map((cell) => {
        const value = values?.get(cell.id)
        const hasValue = value !== undefined && value !== null && Number.isFinite(value)
        const fill = showValues && hasValue && low !== null && high !== null ? sequentialTemp((value - low) / (high - low || 1)) : '#8c9691'
        const selected = selectedCellId === cell.id
        return (
          <CircleMarker key={cell.id} center={[cell.latitude, cell.longitude]} radius={selected ? 6.5 : 3.5}
            pathOptions={{ color: selected ? '#746293' : fill, weight: selected ? 2 : 0.5, fillColor: fill,
              fillOpacity: showValues && hasValue ? 0.85 : 0.5 }}
            eventHandlers={{ click: () => onSelectCell?.(cell.id) }}>
            <Tooltip sticky>
              <div className="max-w-[250px] font-sans text-[11px]">
                <p className="font-medium">Source cell {cell.id}</p>
                <p className="break-all text-[10px]">{cell.grid_id}</p>
                <p>{cell.latitude.toFixed(5)}&deg;N | {cell.longitude.toFixed(5)}&deg;E</p>
                <p className="mt-1">{hasValue ? `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} ${displayUnit}` :
                  values?.has(cell.id) ? 'Measurement missing (NULL)' : 'No measurement in loaded observation page'}</p>
                <p className="mt-1 text-[10px]">Cell center; no validated polygon supplied.</p>
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}

