import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { Field, SelectField, TextInput } from '@/components/common/Field'
import { Meter, Tag } from '@/components/common/Primitives'
import { LiveMapLegend } from '@/components/maps/LiveMapLegend'
import type { VisibleBounds } from '@/components/maps/LiveStudyMap'
import { AsyncPanel } from '@/components/common/AsyncPanel'
import { Button } from '@/components/ui/button'
import { environmentApi } from '@/services/api/earthtrend'
import { useAppStore } from '@/store/useAppStore'
import type { ObservationFilters, TrendFilters } from '@/types/environment'
import type { TimeSeriesPoint } from '@/types'
import { useQuery } from '@tanstack/react-query'
import { Crosshair, Eye, EyeOff, LoaderCircle, MoveRight, RotateCcw } from 'lucide-react'
import { lazy, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const LiveStudyMap = lazy(() => import('@/components/maps/LiveStudyMap').then(m => ({ default: m.LiveStudyMap })))

const PAGE_SIZE = 500
const MAP_FIT_PADDING: [number, number, number, number] = [108, 20, 36, 20]
const queryPolicy = { staleTime: 5 * 60_000, retry: false, refetchOnWindowFocus: false } as const

interface ExplorerSelection {
  regionId: string
  indicatorId: string
  startDate: string
  endDate: string
  snapshotDate: string
}
interface AppliedSelection extends ExplorerSelection {
  versionId: number
  bounds?: VisibleBounds
}
const initialSelection: ExplorerSelection = {
  regionId: '', indicatorId: 'terra_lst_day_c', startDate: '2022-01-01',
  endDate: '2022-12-31', snapshotDate: '2022-04-07',
}
const displayNumber = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: digits })
const displayUnit = (unit: string) => unit === 'degC' ? '\u00b0C' : unit === 'm2' ? 'm\u00b2' : unit

export function ExplorerPage() {
  const theme = useAppStore((state) => state.theme)
  const [draft, setDraft] = useState<ExplorerSelection>(initialSelection)
  const [applied, setApplied] = useState<AppliedSelection | null>(null)
  const [cellPage, setCellPage] = useState(1)
  const [cellId, setCellId] = useState<number | null>(null)
  const [showValues, setShowValues] = useState(true)
  const [showExtent, setShowExtent] = useState(true)
  const regions = useQuery({ queryKey: ['environment', 'regions'], queryFn: ({ signal }) => environmentApi.getRegions({ signal }), ...queryPolicy })
  const datasets = useQuery({ queryKey: ['environment', 'datasets'], queryFn: ({ signal }) => environmentApi.getDatasets({ signal }), ...queryPolicy })
  const indicators = useQuery({ queryKey: ['environment', 'indicators'], queryFn: ({ signal }) => environmentApi.getIndicators({ signal }), ...queryPolicy })
  const dataset = datasets.data?.find((item) => item.dataVerified && item.datasetVersionId !== null)
  const draftRegionId = draft.regionId || regions.data?.[0]?.id || ''
  const regionId = applied?.regionId || draftRegionId
  const region = useQuery({ queryKey: ['environment', 'region', regionId],
    queryFn: ({ signal }) => environmentApi.getRegion(regionId, { signal }), enabled: Boolean(regionId), ...queryPolicy })
  const cells = useQuery({ queryKey: ['environment', 'cells', regionId, { page: cellPage, page_size: PAGE_SIZE }],
    queryFn: ({ signal }) => environmentApi.getCells(regionId, { page: cellPage, page_size: PAGE_SIZE }, { signal }),
    enabled: Boolean(regionId), ...queryPolicy })
  const indicator = indicators.data?.find((item) => item.id === (applied?.indicatorId || draft.indicatorId))
  const draftIndicator = indicators.data?.find((item) => item.id === draft.indicatorId)
  const staticSnapshot = Boolean(indicator?.id.startsWith('ghsl_') || indicator?.temporal_support.startsWith('snapshot'))
  const minimumDate = dataset?.studyPeriod?.start || '2003-01-01'
  const maximumDate = dataset?.studyPeriod?.end || '2024-12-26'
  const invalidRange = !draft.startDate || !draft.endDate || draft.startDate > draft.endDate ||
    draft.startDate < minimumDate || draft.endDate > maximumDate
  const invalidSnapshot = !draft.snapshotDate || draft.snapshotDate < minimumDate || draft.snapshotDate > maximumDate ||
    (draft.indicatorId.startsWith('ghsl_') && draft.snapshotDate < '2021-01-01')

  const observationFilters = useMemo<ObservationFilters>(() => applied ? {
    region_id: applied.regionId, dataset_version_id: applied.versionId,
    start_date: applied.snapshotDate, end_date: applied.snapshotDate,
    cell_id: cellId ?? undefined, page: cellId === null ? cellPage : 1,
    page_size: PAGE_SIZE, sort: 'cell_id', order: 'asc', ...applied.bounds,
    // Keep complete source rows so NULL measurements remain distinguishable.
  } : {}, [applied, cellId, cellPage])
  const observations = useQuery({ queryKey: ['environment', 'observations', observationFilters],
    queryFn: ({ signal }) => environmentApi.getObservations(observationFilters, { signal }),
    enabled: Boolean(applied), ...queryPolicy })
  const trendFilters = useMemo<TrendFilters>(() => ({
    indicator: applied?.indicatorId || '', region_id: applied?.regionId,
    dataset_version_id: applied?.versionId, start_date: applied?.startDate,
    end_date: applied?.endDate, cell_id: cellId ?? undefined, ...applied?.bounds,
  }), [applied, cellId])
  const trend = useQuery({ queryKey: ['environment', 'trend', trendFilters],
    queryFn: ({ signal }) => environmentApi.getTrend(trendFilters, { signal }),
    enabled: Boolean(applied && indicator && !staticSnapshot), ...queryPolicy })
  const values = useMemo(() => new Map((observations.data?.items || []).map((item) =>
    [item.cell_id, item.values[applied?.indicatorId || ''] ?? null])), [observations.data, applied?.indicatorId])
  const visibleCells = useMemo(() => (cells.data?.items || []).filter((cell) => !applied?.bounds ||
    (cell.longitude >= applied.bounds.west && cell.longitude <= applied.bounds.east &&
      cell.latitude >= applied.bounds.south && cell.latitude <= applied.bounds.north)), [cells.data, applied])
  const selectedCell = cells.data?.items.find((item) => item.id === cellId)
  const series = useMemo<TimeSeriesPoint[]>(() => (trend.data?.series || []).map((point) => ({
    date: point.date, value: point.value, expected: null, trend: null, seasonal: null,
    qualityFlag: point.value === null ? 'missing' : 'valid',
  })), [trend.data])
  const totalPages = Math.max(1, Math.ceil((cells.data?.total || 0) / PAGE_SIZE))
  const catalogError = regions.error || datasets.error || indicators.error || region.error
  const pending = observations.isFetching || (Boolean(applied) && !staticSnapshot && trend.isFetching)
  const pendingChanges = applied && (draftRegionId !== applied.regionId || draft.indicatorId !== applied.indicatorId ||
    draft.startDate !== applied.startDate || draft.endDate !== applied.endDate || draft.snapshotDate !== applied.snapshotDate)
  const unit = displayUnit(indicator?.unit || '')
  const labQuery = new URLSearchParams({ region_id: regionId, indicator: applied?.indicatorId || draft.indicatorId,
    start_date: applied?.startDate || draft.startDate, end_date: applied?.endDate || draft.endDate })
  if (cellId !== null) labQuery.set('cell_id', String(cellId))
  if (applied) labQuery.set('dataset_version_id', String(applied.versionId))
  if (applied?.bounds) Object.entries(applied.bounds).forEach(([key, value]) => labQuery.set(key, String(value)))

  function submit() {
    if (!dataset?.datasetVersionId || invalidRange || invalidSnapshot || !draftRegionId) return
    if (regionId !== draftRegionId) { setCellId(null); setCellPage(1) }
    setApplied({ ...draft, regionId: draftRegionId, versionId: dataset.datasetVersionId,
      bounds: regionId === draftRegionId ? applied?.bounds : undefined })
  }
  function reset() {
    setDraft(initialSelection); setApplied(null); setCellId(null); setCellPage(1)
    setShowValues(true); setShowExtent(true)
  }

  return (
    <div className="relative xl:h-[calc(100dvh-var(--shell-offset,64px))] xl:overflow-hidden">
      <div className="relative h-[68vh] min-h-[440px] xl:h-full">
        <div className="absolute inset-0">
          {region.data ? <AsyncPanel label="Source map"><LiveStudyMap region={region.data} cells={visibleCells} values={values}
            unit={indicator?.unit} dark={theme === 'dark'} selectedCellId={cellId} onSelectCell={setCellId}
            showValues={showValues} showExtent={showExtent} docked fitPadding={MAP_FIT_PADDING}
            onUseVisibleBounds={applied ? (bounds) => { setCellId(null); setCellPage(1); setApplied((current) => current ? { ...current, bounds } : current) } : undefined} /></AsyncPanel> :
            <div className="flex h-full items-center justify-center bg-[var(--surface-2)] p-6 text-[13px] text-[var(--muted)]">
              {catalogError ? catalogError.message : regions.isPending || region.isFetching ? 'Loading actual study extent...' : 'No study region is available.'}
            </div>}
        </div>
        <div className="pointer-events-none absolute top-3 left-3 z-[500] md:top-5 md:left-5">
          <div className="pointer-events-auto max-w-[380px] rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-pop)]">
            <div className="flex flex-wrap items-center gap-2"><span className="label text-[var(--accent)]">Explore</span><Tag tone={dataset ? 'ok' : 'warn'}>{dataset ? `Certified version ${applied?.versionId ?? dataset.datasetVersionId}` : 'Awaiting certified data'}</Tag></div>
            <h1 className="display mt-2 text-[clamp(1.5rem,2.2vw,1.95rem)] text-[var(--ink)]">Read the surface.</h1>
            <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--muted)]">{region.data?.name || 'Study area'} | {cells.data?.items.length.toLocaleString() || '0'} of {cells.data?.total.toLocaleString() || '0'} cell centers loaded</p>
          </div>
        </div>
        <div className="pointer-events-none absolute top-[95px] right-3 z-[500] hidden md:right-5 xl:block">
          <div className="pointer-events-auto overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] shadow-[var(--shadow-pop)]"><LiveMapLegend values={values} unit={indicator?.unit || ''} label={applied ? `${indicator?.name || applied.indicatorId} | ${applied.snapshotDate}` : 'Choose filters to load observations'} /></div>
        </div>
      </div>

      <div className="space-y-3 p-3 pb-6 md:p-4 xl:contents">
        <aside className="z-[500] overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-pop)] xl:absolute xl:top-[104px] xl:bottom-4 xl:left-4 xl:w-[324px] xl:overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3"><p className="text-[12.5px] font-medium text-[var(--ink)]">Controls</p><Button variant="ghost" size="sm" onClick={reset}><RotateCcw size={12} /> Reset</Button></div>
          <div className="space-y-4 px-4 py-4">
            {catalogError ? <p role="alert" className="text-[12px] text-[var(--danger)]">{catalogError.message}</p> : null}
            <Field label="Study area"><SelectField value={draftRegionId} ariaLabel="Study area" disabled={regions.isPending}
              onChange={(value) => setDraft((current) => ({ ...current, regionId: value }))}
              options={(regions.data || []).map((item) => ({ value: item.id, label: `${item.name}, ${item.country}` }))} /></Field>
            <Field label="Environmental indicator"><SelectField value={draft.indicatorId} ariaLabel="Environmental indicator" disabled={indicators.isPending}
              onChange={(value) => setDraft((current) => ({ ...current, indicatorId: value }))}
              options={(indicators.data || []).map((item) => ({ value: item.id, label: `${item.name} (${displayUnit(item.unit)})` }))} /></Field>
            <p className="text-[10.5px] leading-relaxed text-[var(--faint)]">{draftIndicator?.description || 'Source-specific environmental measurements.'}</p>
            <section className="border-t border-[var(--line)] pt-4">
              <p className="label">Historical analysis period</p>
              <div className="mt-2 grid grid-cols-2 gap-2"><Field label="From"><TextInput type="date" value={draft.startDate} min={minimumDate} max={maximumDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} /></Field>
                <Field label="To"><TextInput type="date" value={draft.endDate} min={minimumDate} max={maximumDate} onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))} /></Field></div>
              {invalidRange ? <p className="mt-2 text-[11px] text-[var(--danger)]">Choose ordered dates within {minimumDate} to {maximumDate}.</p> : null}
              <button type="button" className="mt-2 text-[11px] text-[var(--accent)] underline" onClick={() => setDraft((current) => ({ ...current, startDate: minimumDate, endDate: maximumDate }))}>Use full historical record</button>
            </section>
            <Field label="Map acquisition / attachment date" hint="Map values are source observations for this exact date, not period averages. Previous-month features describe the preceding source month.">
              <TextInput type="date" aria-label="Map observation date" value={draft.snapshotDate} min={draft.indicatorId.startsWith('ghsl_') ? '2021-01-01' : minimumDate} max={maximumDate} onChange={(event) => setDraft((current) => ({ ...current, snapshotDate: event.target.value }))} />
            </Field>
            {invalidSnapshot ? <p className="text-[11px] text-[var(--danger)]">Choose an available historical date; GHSL context is only attached in 2021+.</p> : null}
            <Button className="w-full" disabled={!dataset || !draftRegionId || !draftIndicator || invalidRange || invalidSnapshot || pending} onClick={submit}>
              {pending ? <LoaderCircle size={14} className="animate-spin" /> : <MoveRight size={14} />}{pending ? 'Reading SQL data...' : 'Update map & analyze'}
            </Button>
            {pendingChanges ? <p className="text-[11px] text-[var(--warn)]">Filters changed. Apply them to update the displayed data.</p> : null}
            {pending ? <p role="status" className="text-[11px] text-[var(--muted)]">Regional queries can take 6-14 seconds. No demo fallback is used.</p> : null}
            <section className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between"><p className="label">Source cell page</p><span className="num text-[10px] text-[var(--faint)]">{cellPage} / {totalPages}</span></div>
              <div className="mt-2 grid grid-cols-2 gap-2"><Button variant="secondary" size="sm" disabled={cellPage <= 1 || cells.isFetching} onClick={() => { setCellId(null); setCellPage((page) => page - 1) }}>Previous</Button><Button variant="secondary" size="sm" disabled={cellPage >= totalPages || cells.isFetching} onClick={() => { setCellId(null); setCellPage((page) => page + 1) }}>Next</Button></div>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--faint)]">At most 500 source centers and 500 source rows per page. Gray markers do not imply a zero measurement. No cell polygons were supplied.</p>
              <p className="mt-2 text-[10px] leading-relaxed text-[var(--faint)]">Spatial trend layers and seasonal/anomaly decomposition are unavailable. The map shows dated source values; the chart uses monthly descriptive aggregation.</p>
              {cells.error ? <p role="alert" className="mt-2 text-[11px] text-[var(--danger)]">{cells.error.message}</p> : null}
              <label className="mt-2 flex items-center justify-between text-[11.5px] text-[var(--ink)]"><span className="flex items-center gap-2">{showValues ? <Eye size={13} /> : <EyeOff size={13} />} Observation colors</span><input type="checkbox" checked={showValues} onChange={(event) => setShowValues(event.target.checked)} /></label>
              <label className="mt-3 flex items-center justify-between text-[11.5px] text-[var(--ink)]"><span className="flex items-center gap-2"><Crosshair size={13} /> Source centroid extent</span><input type="checkbox" checked={showExtent} onChange={(event) => setShowExtent(event.target.checked)} /></label>
              {applied?.bounds ? <div className="mt-2 rounded-[var(--r-inner)] bg-[var(--surface-2)] p-2 text-[10px] text-[var(--muted)]">Visible-extent filter applied to values and analysis.<button className="ml-1 text-[var(--accent)] underline" onClick={() => setApplied((current) => current ? { ...current, bounds: undefined } : current)}>Clear</button></div> : null}
              {!applied ? <p className="mt-2 text-[10px] text-[var(--faint)]">Apply filters before using a visible-extent filter.</p> : null}
            </section>
            <section className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between"><p className="label">Cell inspector</p>{cellId !== null ? <button className="text-[10px] text-[var(--accent)] underline" onClick={() => setCellId(null)}>Entire region</button> : null}</div>
              {selectedCell ? <div className="mt-2 rounded-[var(--r-inner)] bg-[var(--surface-2)] p-3 text-[11px] text-[var(--muted)]"><p className="font-medium text-[var(--ink)]">Source cell {selectedCell.id}</p><p className="mt-1 break-all text-[10px]">{selectedCell.grid_id}</p><p className="mt-1">{selectedCell.latitude.toFixed(5)}&deg;N | {selectedCell.longitude.toFixed(5)}&deg;E</p><p className="num mt-2 text-[16px] text-[var(--ink)]">{displayNumber(values.get(selectedCell.id), 3)} {values.get(selectedCell.id) == null ? '' : unit}</p><p className="mt-1 text-[10px]">{applied?.snapshotDate || 'Apply filters to read a value'} | point center</p></div> : <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">Click a source cell center to read that cell and scope the series. The unselected analysis covers the region.</p>}
              {observations.error ? <p role="alert" className="mt-2 text-[11px] text-[var(--danger)]">{observations.error.message}</p> : null}
              {applied && observations.data?.total === 0 ? <p className="mt-2 text-[11px] text-[var(--warn)]">No source acquisition matches this exact map date and spatial filter. Try a known source date; no value is estimated.</p> : null}
              {applied && indicator?.temporal_support === 'previous_month' ? <p className="mt-2 text-[10px] leading-relaxed text-[var(--faint)]">Map date is the attachment date. The chart uses the previous source calendar month; repeated context is deduplicated by the API.</p> : null}
            </section>
            <Button variant="secondary" className="w-full" asChild><Link to={`/lab?${labQuery.toString()}`}>Analyze this view in Lab <MoveRight size={13} /></Link></Button>
          </div>
        </aside>

        <section className="z-[500] overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-pop)] xl:absolute xl:right-4 xl:bottom-4 xl:left-[352px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5"><div className="flex flex-wrap items-center gap-2"><p className="text-[12.5px] font-medium text-[var(--ink)]">{staticSnapshot ? 'Static snapshot context' : 'Monthly descriptive series'}</p><Tag tone="accent">{applied ? cellId === null ? 'Regional' : `Cell ${cellId}` : 'No analysis yet'}</Tag></div>{trend.data && !staticSnapshot ? <span className="text-[11px] text-[var(--muted)]">OLS slope {displayNumber(trend.data.slope_per_year, 4)} {trend.data.slope_per_year === null ? '' : `${unit}/year`}</span> : null}</div>
          <div className="px-2 pt-1 md:px-3">
            {staticSnapshot && applied ? <div className="flex h-[170px] items-center justify-center p-5 text-center text-[12px] text-[var(--muted)]">GHSL describes one 2020 snapshot attached to 2021+ records. A historical urban-growth trend is unavailable. Read actual cell values on the map.</div> : trend.isFetching ? <div role="status" className="flex h-[170px] items-center justify-center gap-2 text-[12px] text-[var(--muted)]"><LoaderCircle size={16} className="animate-spin" /> Computing actual cell-month aggregates...</div> : trend.error ? <div role="alert" className="flex h-[170px] items-center justify-center p-5 text-[12px] text-[var(--danger)]">{trend.error.message}</div> : series.some((point) => point.value !== null) ? <TimeSeriesChart series={series} height={170} compact showRangeSlider={false} unit={indicator?.unit} axisLabel={indicator?.name} temporalLabel={indicator?.temporal_support === 'previous_month' ? 'Source calendar month' : 'Observation month'} /> : <div className="flex h-[170px] items-center justify-center p-5 text-center text-[12px] text-[var(--muted)]">{applied ? 'No nonmissing measurements in the selected period and spatial scope.' : 'Choose an indicator, dates and region, then click Update map & analyze.'}</div>}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2"><p className="max-w-[80ch] text-[10px] leading-relaxed text-[var(--faint)]">{trend.data && !staticSnapshot ? `${trend.data.observation_count} nonmissing monthly values / ${trend.data.total_slots} slots. Descriptive OLS, not a forecast. ${trend.data.warnings.join(' ')}` : 'Real source values only. LST is surface temperature, not air temperature. Missing data is never filled with zero.'}</p>{trend.data && !staticSnapshot && trend.data.missing_data_ratio !== null ? <div className="min-w-[100px]"><Meter value={1 - trend.data.missing_data_ratio} /><p className="mt-1 text-[9px] text-[var(--faint)]">Nonmissing monthly slots</p></div> : null}</div>
        </section>
      </div>
    </div>
  )
}
