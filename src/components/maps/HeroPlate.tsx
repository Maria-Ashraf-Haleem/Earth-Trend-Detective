import { environmentApi } from '@/services/api/earthtrend'
import { useQuery } from '@tanstack/react-query'

const W = 760
const H = 560
const PAD = { left: 64, right: 34, top: 34, bottom: 48 }
const MAP_W = W - PAD.left - PAD.right
const MAP_H = H - PAD.top - PAD.bottom
const queryPolicy = { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } as const

/** A bounded page of actual source centroids. No synthetic environmental field. */
export function HeroPlate() {
  const regions = useQuery({ queryKey: ['environment', 'regions'],
    queryFn: ({ signal }) => environmentApi.getRegions({ signal }), ...queryPolicy })
  const datasets = useQuery({ queryKey: ['environment', 'datasets'],
    queryFn: ({ signal }) => environmentApi.getDatasets({ signal }), ...queryPolicy })
  const region = regions.data?.find((item) => item.bounds && item.availability === 'available')
  const dataset = datasets.data?.find((item) => item.dataVerified)
  const cells = useQuery({ queryKey: ['environment', 'cells', region?.id || '', { page: 1, page_size: 500 }],
    queryFn: ({ signal }) => environmentApi.getCells(region!.id, { page: 1, page_size: 500 }, { signal }),
    enabled: Boolean(region), ...queryPolicy })
  const bounds = region?.bounds
  const x = (longitude: number) => PAD.left + ((longitude - bounds!.west) / (bounds!.east - bounds!.west)) * MAP_W
  const y = (latitude: number) => PAD.top + ((bounds!.north - latitude) / (bounds!.north - bounds!.south)) * MAP_H
  const error = regions.error || datasets.error || cells.error
  const pending = regions.isFetching || cells.isFetching
  const validBounds = bounds && bounds.west < bounds.east && bounds.south < bounds.north
  return (
    <figure className="overflow-hidden rounded-[var(--r-panel)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
      <figcaption className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 pt-4 pb-3">
        <span className="flex items-center gap-2"><span className="text-[13px] font-medium text-[var(--ink)]">{region?.name || 'Study area'}</span><span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium tracking-[0.05em] uppercase text-[var(--faint)]">Source grid</span></span>
        <span className="text-[11.5px] text-[var(--faint)]">{dataset ? `Certified version ${dataset.datasetVersionId}` : 'Awaiting certified data'}</span>
      </figcaption>
      <div className="relative mx-2 overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--surface-2)]">
        {error ? <div role="alert" className="flex min-h-[300px] items-center justify-center p-6 text-center text-[13px] text-[var(--danger)]">{error.message}</div> : validBounds ? (
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img"
            aria-label={`${cells.data?.items.length || 0} actual source cell centers in the ${region?.name} centroid bounding box. This is not an environmental-value map or validated cell polygons.`}>
            <rect x={PAD.left} y={PAD.top} width={MAP_W} height={MAP_H} fill="var(--map-land)" opacity="0.4" />
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}>
              <line x1={PAD.left + MAP_W * tick} y1={PAD.top} x2={PAD.left + MAP_W * tick} y2={PAD.top + MAP_H} stroke="var(--ink)" strokeOpacity="0.1" />
              <line x1={PAD.left} y1={PAD.top + MAP_H * tick} x2={PAD.left + MAP_W} y2={PAD.top + MAP_H * tick} stroke="var(--ink)" strokeOpacity="0.1" />
              <text x={PAD.left + MAP_W * tick} y={H - 22} textAnchor="middle" fill="var(--faint)" fontSize="10" fontFamily="IBM Plex Mono, monospace">{(bounds.west + (bounds.east - bounds.west) * tick).toFixed(3)}&deg;E</text>
              <text x={PAD.left - 9} y={PAD.top + MAP_H * tick + 3} textAnchor="end" fill="var(--faint)" fontSize="10" fontFamily="IBM Plex Mono, monospace">{(bounds.north - (bounds.north - bounds.south) * tick).toFixed(3)}&deg;N</text>
            </g>)}
            <rect x={PAD.left} y={PAD.top} width={MAP_W} height={MAP_H} fill="none" stroke="var(--accent)" strokeOpacity="0.6" strokeWidth="1.2" strokeDasharray="7 5" />
            {(cells.data?.items || []).map((cell) => <circle key={cell.id} cx={x(cell.longitude)} cy={y(cell.latitude)} r="2.2" fill="var(--accent)" opacity="0.8"><title>{`Source cell ${cell.id}: ${cell.latitude.toFixed(5)}\u00b0N, ${cell.longitude.toFixed(5)}\u00b0E`}</title></circle>)}
            <g transform={`translate(${PAD.left + 18}, ${PAD.top + 20})`}>
              <rect x="-8" y="-13" width="246" height="56" rx="8" fill="var(--surface)" fillOpacity="0.94" />
              <text fill="var(--ink)" fontSize="12" fontWeight="600" fontFamily="Public Sans, sans-serif">{pending ? 'Loading source centers...' : `${cells.data?.items.length.toLocaleString() || '0'} of ${cells.data?.total.toLocaleString() || '0'} centers`}</text>
              <text y="19" fill="var(--faint)" fontSize="10" fontFamily="Public Sans, sans-serif">First bounded page | geographic coordinates</text>
            </g>
          </svg>
        ) : <div role="status" className="flex min-h-[300px] items-center justify-center p-6 text-center text-[13px] text-[var(--muted)]">{pending ? 'Loading actual source extent...' : 'No verified spatial extent is available.'}</div>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[11px] text-[var(--faint)]">
        <span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> Actual source cell centers</span>
        <span>Centroid bounds, not surveyed polygons. No environmental values are inferred.</span>
      </div>
    </figure>
  )
}
