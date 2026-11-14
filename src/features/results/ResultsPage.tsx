import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { EmptyState } from '@/components/common/EmptyState'
import { DataNote, KeyValue, PageHeader, ReadoutStrip, SectionHead, Tag } from '@/components/common/Primitives'
import { environmentalUnit, LiveDataState, nullableNumber } from '@/components/common/LiveDataState'
import { AsyncPanel } from '@/components/common/AsyncPanel'
import { Button } from '@/components/ui/button'
import { useCatalog, useCells } from '@/hooks/useEnvironment'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { exportExperimentCsv, exportExperimentJson } from '@/utils/export'
import { ArrowUpRight, Bookmark, Download, FileJson } from 'lucide-react'
import { lazy, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { TimeSeriesPoint } from '@/types'

const LiveStudyMap = lazy(() => import('@/components/maps/LiveStudyMap').then(m => ({ default: m.LiveStudyMap })))

const CARD = 'rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]'
const P = (v: number | null | undefined) => v == null ? 'Unavailable' : `${(v * 100).toFixed(1)}%`

export function ResultsPage() {
  const { experimentId } = useParams()
  const records = useLabStore(s => s.experiments)
  const activeId = useLabStore(s => s.activeId)
  const openExperiment = useLabStore(s => s.openExperiment)
  const saveActive = useLabStore(s => s.saveActive)
  const setDraft = useLabStore(s => s.setDraft)
  const theme = useAppStore(s => s.theme)
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [monthPage, setMonthPage] = useState(1)
  const record = records.find(r => r.id === (experimentId ?? activeId) && r.source === 'api')
  const result = record?.liveResult
  const region = catalog.regions.find(r => r.id === record?.configuration.regionId)
  const cells = useCells(region?.id, { page: 1, page_size: 500 }, { enabled: Boolean(result) })
  const [selectedCell, setSelectedCell] = useState<number | null>(record?.configuration.cellId ?? null)
  useEffect(() => {
    if (record && activeId !== record.id) openExperiment(record.id)
    setMonthPage(1); setSelectedCell(record?.configuration.cellId ?? null)
  }, [record, activeId, openExperiment])
  if (!record || !result) return <div className="mx-auto max-w-[1480px] px-4 py-12 md:px-8"><EmptyState eyebrow="Analysis workspace"
    title={record?.error ? 'The analysis request did not complete' : 'No real report selected'}
    body={record?.error ?? 'Choose a region, indicator and dates in Analyze. Only completed real API responses appear here; old demo results are never loaded as live data.'}
    action={<Button asChild><Link to="/lab">Open Analyze</Link></Button>} /></div>

  const unit = environmentalUnit(result.unit)
  const indicatorName = record.context?.indicatorName ?? result.indicator
  const series: TimeSeriesPoint[] = result.series.map(p => ({ date: p.date, value: p.value,
    expected: null, trend: null, seasonal: null, qualityFlag: p.value === null ? 'missing' : 'valid' }))
  const slope = result.slope_per_year === null ? 'Unavailable' : `${nullableNumber(result.slope_per_year, 4)} ${unit}/year`
  const interval = result.confidence_interval === null ? 'Unavailable' : `${result.confidence_interval.map(v => nullableNumber(v, 4)).join(' to ')} ${unit}/year`
  const months = result.series.slice((monthPage - 1) * 12, monthPage * 12)
  const pages = Math.max(1, Math.ceil(result.series.length / 12))
  return <div className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-12">
    <PageHeader eyebrow="Results" title={record.configuration.name}
      lede={`${record.context?.regionName ?? record.configuration.regionId}. ${indicatorName}. ${record.configuration.startDate} to ${record.configuration.endDate}.`}
      actions={<><Button variant="secondary" size="sm" onClick={saveActive}><Bookmark size={13} /> Local copy</Button><Button variant="secondary" size="sm" onClick={() => exportExperimentCsv(record)}><Download size={13} /> CSV</Button><Button variant="secondary" size="sm" onClick={() => exportExperimentJson(record)}><FileJson size={13} /> JSON</Button></>}
      meta={<div className="flex flex-wrap gap-2"><Tag tone={result.data_verified ? 'ok' : 'warn'}>{result.data_verified ? `Certified version ${result.dataset_version_id}` : 'Uncertified'}</Tag><Tag>Descriptive OLS</Tag><Tag>Browser-cached API response</Tag><Tag tone={result.availability === 'available' ? 'accent' : 'warn'}>{result.availability.replaceAll('_', ' ')}</Tag></div>} />
    {result.availability !== 'available' ? <div className="mt-5" role="status"><DataNote label={result.availability === 'unavailable' ? 'No observations' : 'Limited support'}>{result.availability === 'unavailable' ? 'No nonmissing monthly values exist for this selection. Blank charts and unavailable statistics are not zeros.' : 'The observed series is shown, but there are too few supported time slots for all inference. Null statistics remain unavailable.'}</DataNote></div> : null}
    <ReadoutStrip className="mt-7" items={[
      { label: 'Observed monthly mean', value: nullableNumber(result.mean, 3), detail: unit },
      { label: 'OLS slope / year', value: result.slope_per_year === null ? 'Unavailable' : nullableNumber(result.slope_per_year, 4), detail: `${unit}/year; exploratory` },
      { label: 'Supported months', value: `${result.observation_count} / ${result.total_slots}`, detail: 'Months with a nonmissing regional/cell value' },
      { label: 'Missing monthly slots', value: P(result.missing_data_ratio), detail: 'Time-slot missingness, not every missing source value', tone: 'violet' },
    ]} />
    <section className="mt-10" id="series"><SectionHead index="01" title="Observed monthly series" lede={record.context?.temporalSupport === 'previous_month' ? 'Previous-month context is shown at its source calendar month, not its later attachment date.' : 'Actual source values, averaged within cells and months. Missing months remain gaps.'} />
      <div className={`${CARD} mt-4`} data-testid="actual-series"><TimeSeriesChart series={series} unit={result.unit} axisLabel={`${indicatorName} (${unit})`} temporalLabel="Source calendar month" height={420} />
        <p className="mt-3 text-[11px] text-[var(--muted)]">{result.methodology} No fitted line, seasonal decomposition or anomaly values are manufactured for this chart.</p></div>
    </section>
    <div className="mt-8 grid gap-5 lg:grid-cols-2"><section className={CARD} id="statistics"><SectionHead index="02" title="Descriptive statistics" /><dl className="mt-4">
      <KeyValue label="OLS slope" value={slope} /><KeyValue label={`${(result.confidence_level * 100).toFixed(0)}% slope confidence interval`} value={interval} />
      <KeyValue label="OLS p-value" value={nullableNumber(result.p_value, 6)} /><KeyValue label={`Significance at alpha ${result.alpha}`} value={result.significant === null ? 'Inference unavailable' : result.significant ? 'Significant (exploratory)' : 'Not significant'} />
      <KeyValue label="First-to-last observed monthly change" value={result.absolute_change === null ? 'Unavailable' : `${nullableNumber(result.absolute_change, 3)} ${unit}`} />
      <KeyValue label="Percentage change" value={result.percentage_change === null ? 'Not meaningful / unavailable' : `${nullableNumber(result.percentage_change, 2)}%`} />
      <KeyValue label="Method" value={result.method} /></dl></section>
      <section className={CARD}><SectionHead index="03" title="Source and reproducibility" /><dl className="mt-4"><KeyValue label="Dataset" value={record.context?.datasetName ?? record.configuration.datasetId} /><KeyValue label="Version" value={result.dataset_version_id ?? 'Unavailable'} /><KeyValue label="Indicator" value={result.indicator} /><KeyValue label="Spatial selection" value={record.configuration.cellId ? `Cell ${record.configuration.cellId}` : 'Region; equal cell weights'} /><KeyValue label="Spatial extent" value={record.configuration.bounds ? 'Bounding filter preserved' : 'Full selected extent'} /><KeyValue label="Response received" value={record.runCompletedAt ?? 'Unknown'} /><KeyValue label="Computation ID (ephemeral)" value={result.analysis_id} /></dl><p className="mt-4 text-[11px] text-[var(--muted)]">This response is saved only in this browser. The API GET did not create a server experiment or saved-result link. JSON export includes exact request configuration and received response.</p></section></div>
    <section className="mt-10" id="spatial"><SectionHead index="04" title="Source cell centers" lede="Actual geographic centroids. The API provides no per-cell trend map or validated cell polygons for this regional result." />
      <div className="mt-4"><LiveDataState loading={catalog.isPending || (Boolean(region) && cells.isPending)} error={catalog.error ?? cells.error} onRetry={() => { if (catalog.error) void catalog.refetch(); if (region) void cells.refetch() }} /></div>
      {!catalog.isPending && !catalog.error && !region ? <p className="mt-4 text-[12px] text-[var(--muted)]">The saved region is unavailable in the current catalog. The received analysis above remains available.</p> : null}
      {region && cells.data?.total === 0 ? <p className="mt-4 text-[12px] text-[var(--muted)]">No source cell centers are available for this region.</p> : null}
      {region && cells.data ? <div className={`${CARD} mt-4`}><div className="h-[370px]"><AsyncPanel label="Source map"><LiveStudyMap region={region} cells={cells.data.items} selectedCellId={selectedCell} onSelectCell={setSelectedCell} showValues={false} dark={theme === 'dark'} /></AsyncPanel></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[var(--muted)]">Showing {cells.data.items.length} of {cells.data.total} source centers. Neutral markers carry no invented environmental values. Explore has all cell pages.</p><Button size="sm" variant="secondary" disabled={!selectedCell} onClick={() => { setDraft({ ...record.configuration, cellId: selectedCell ?? undefined, bounds: undefined }); navigate('/lab') }}>Analyze selected cell <ArrowUpRight size={13} /></Button></div></div> : null}
    </section>
    <section className="mt-10" id="quality"><SectionHead index="05" title="Monthly support and missingness" lede="Observed/contributing cell counts and attached source-row counts come directly from the backend." />
      <div className={`${CARD} mt-4 overflow-x-auto`}><table className="w-full min-w-[520px] text-left text-[12px]"><thead><tr className="border-b border-[var(--line)] text-[var(--muted)]"><th className="p-3">Source month</th><th className="p-3">Value ({unit})</th><th className="p-3">Observed cells</th><th className="p-3">Contributing cells</th><th className="p-3">Source rows</th></tr></thead><tbody>{months.map(p => <tr key={p.date} className="border-b border-[var(--line)]"><td className="p-3">{p.date}</td><td className="p-3">{p.value === null ? 'Missing' : nullableNumber(p.value, 4)}</td><td className="p-3">{p.observed_cells}</td><td className="p-3">{p.contributing_cells}</td><td className="p-3">{p.source_rows}</td></tr>)}</tbody></table><div className="mt-4 flex items-center justify-between"><Button size="sm" variant="ghost" disabled={monthPage === 1} onClick={() => setMonthPage(monthPage - 1)}>Previous months</Button><span className="text-[11px]">Page {monthPage} of {pages}</span><Button size="sm" variant="ghost" disabled={monthPage >= pages} onClick={() => setMonthPage(monthPage + 1)}>Next months</Button></div></div>
    </section>
    <section className="mt-8" id="limits"><DataNote label="Interpretation limits">LST is land surface temperature, not air temperature. NDVI/EVI are indices. OLS is descriptive, not a forecast. Seasonality, serial dependence and changing spatial support can affect inference. No tourism causal effect, anomaly detector, trained prediction or GHSL urban-growth history is available.</DataNote><ul className="mt-4 space-y-2 text-[12px] leading-relaxed text-[var(--muted)]">{[...result.warnings, ...(result.warning ? [result.warning] : [])].map((w, i) => <li key={i}>{w}</li>)}</ul></section>
  </div>
}
