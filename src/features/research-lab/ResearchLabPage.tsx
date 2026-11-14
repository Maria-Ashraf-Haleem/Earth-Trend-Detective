import { Field, SelectField, TextInput } from '@/components/common/Field'
import { DataNote, PageHeader, KeyValue, Tag } from '@/components/common/Primitives'
import { LiveDataState, environmentalUnit } from '@/components/common/LiveDataState'
import { RunProgress } from '@/components/feedback/RunProgress'
import { Button } from '@/components/ui/button'
import { useCatalog, useCells } from '@/hooks/useEnvironment'
import { useLabStore } from '@/store/useLabStore'
import { getErrorMessage } from '@/services/api/earthtrend'
import { ArrowLeft, ArrowUpRight, Check, Play, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import type { GeoBounds } from '@/types'

const STEPS = [{ id: 1, label: 'Data', detail: 'Place, period, indicator' },
  { id: 2, label: 'Method', detail: 'Monthly descriptive statistics' },
  { id: 3, label: 'Review', detail: 'Confirm and analyze' }]
const CARD = 'rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6'
const calendarDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value

export function ResearchLabPage() {
  const draft = useLabStore(s => s.draft)
  const setDraft = useLabStore(s => s.setDraft)
  const runDraft = useLabStore(s => s.runDraft)
  const cancelRun = useLabStore(s => s.cancelRun)
  const catalog = useCatalog()
  const [step, setStep] = useState(1)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [linkError, setLinkError] = useState<string | null>(null)
  const [params] = useSearchParams()
  const search = params.toString()
  const initialized = useRef<string | null>(null)
  const navigate = useNavigate()
  const dataset = catalog.datasets.find(d => d.id === draft.datasetId)
  const region = catalog.regions.find(r => r.id === draft.regionId)
  const indicator = catalog.indicators.find(i => i.id === draft.variableId)
  const cells = useCells(region?.id, { page: 1, page_size: 100 })
  const minimumDate = dataset?.studyPeriod?.start ?? '2003-01-01'
  const maximumDate = dataset?.studyPeriod?.end ?? '2024-12-26'

  useEffect(() => {
    if (initialized.current === search || catalog.isPending || catalog.error) return
    setStep(1)
    setLinkError(null)
    const names = ['west', 'south', 'east', 'north'] as const
    const rawBounds = names.map(k => params.has(k) && params.get(k)!.trim() !== '' ? Number(params.get(k)) : NaN)
    const hasBounds = names.some(k => params.has(k))
    const validBounds = rawBounds.every(Number.isFinite) && rawBounds[0] >= -180 && rawBounds[2] <= 180
      && rawBounds[1] >= -90 && rawBounds[3] <= 90 && rawBounds[0] < rawBounds[2] && rawBounds[1] < rawBounds[3]
    const positiveId = (key: string) => /^[1-9]\d*$/.test(params.get(key) ?? '') && Number.isSafeInteger(Number(params.get(key)))
    const invalidLink = params.has('region_id') && !catalog.regions.some(r => r.id === params.get('region_id'))
      ? 'The linked study region is unavailable.'
      : params.has('indicator') && !catalog.indicators.some(i => i.id === params.get('indicator'))
        ? 'The linked indicator is unavailable.'
        : params.has('dataset_version_id') && !positiveId('dataset_version_id')
          ? 'The linked dataset version must be a positive whole-number ID.'
          : params.has('cell_id') && !positiveId('cell_id')
            ? 'The linked source cell must be a positive whole-number ID.'
            : hasBounds && !validBounds
              ? 'The linked extent requires all four valid longitude/latitude bounds in increasing order.'
              : ['start_date', 'end_date'].some(key => params.has(key) && !calendarDate(params.get(key)!))
                ? 'Linked dates must be real calendar dates in YYYY-MM-DD format.' : null
    if (invalidLink) {
      setLinkError(invalidLink)
      initialized.current = search
      return
    }
    const current = useLabStore.getState().draft
    const selectedDataset = catalog.datasets.find(d => d.id === current.datasetId && d.dataVerified)
      ?? catalog.datasets.find(d => d.dataVerified && d.datasetVersionId !== null)
    const selectedRegion = catalog.regions.find(r => r.id === params.get('region_id'))
      ?? catalog.regions.find(r => r.id === current.regionId) ?? catalog.regions[0]
    const selectedIndicator = catalog.indicators.find(i => i.id === params.get('indicator'))
      ?? catalog.indicators.find(i => i.id === current.variableId && i.temporal_support !== 'snapshot_2020')
      ?? catalog.indicators.find(i => i.id === 'terra_lst_day_c')
      ?? catalog.indicators.find(i => i.temporal_support !== 'snapshot_2020')
    if (!selectedDataset || !selectedRegion || !selectedIndicator) return
    const linkedScope = ['region_id', 'indicator', 'dataset_version_id', 'start_date', 'end_date', 'cell_id', 'west', 'south', 'east', 'north'].some(k => params.has(k))
    const linkedVersion = params.has('dataset_version_id') ? Number(params.get('dataset_version_id')) : undefined
    const cell = Number(params.get('cell_id'))
    const bounds = hasBounds && validBounds
      ? Object.fromEntries(names.map((k, i) => [k, rawBounds[i]])) as unknown as GeoBounds : undefined
    const date = (key: string, fallback: string) => params.has(key) ? params.get(key)! : fallback
    setDraft({ datasetId: selectedDataset.id, datasetVersionId: linkedVersion
      ?? (current.datasetId === selectedDataset.id ? current.datasetVersionId : undefined) ?? selectedDataset.datasetVersionId!,
      regionId: selectedRegion.id, variableId: selectedIndicator.id,
      startDate: date('start_date', current.startDate), endDate: date('end_date', current.endDate),
      aggregation: 'monthly', missingDataHandling: 'pairwise', trendMethods: ['linear_regression'], anomalyMethods: [],
      cellId: Number.isInteger(cell) && cell > 0 ? cell : linkedScope ? undefined : current.cellId,
      bounds: bounds ?? (linkedScope ? undefined : current.bounds) })
    initialized.current = search
  }, [catalog.isPending, catalog.error, catalog.datasets, catalog.regions, catalog.indicators, search, params, setDraft])

  useEffect(() => () => { useLabStore.getState().cancelRun() }, [])
  const invalidDates = !calendarDate(draft.startDate) || !calendarDate(draft.endDate) || draft.startDate > draft.endDate
    || draft.startDate < minimumDate || draft.endDate > maximumDate
  const dataValid = Boolean(region && indicator && dataset?.dataVerified && draft.datasetVersionId && draft.name.trim().length > 2
    && !invalidDates && !linkError && indicator.temporal_support !== 'snapshot_2020')
  const handleRun = async () => {
    if (!dataValid || running) return
    setError(null); setRunning(true)
    try {
      const id = await runDraft({ regionName: region!.name, indicatorName: indicator!.name,
        indicatorUnit: indicator!.unit, datasetName: dataset!.shortName, temporalSupport: indicator!.temporal_support })
      navigate(`/results/${id}`)
    } catch (failure) {
      setError(failure instanceof DOMException && failure.name === 'AbortError' ? 'Analysis cancelled.' : getErrorMessage(failure))
    } finally { setRunning(false) }
  }
  return (
    <div className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-12">
      <PageHeader eyebrow="Analyze" title={<>Design an <em className="text-[var(--accent)]">observation.</em></>}
        lede="Select a published source, historical dates and an indicator. Analyze requests real monthly descriptive statistics from the environmental service."
        actions={<><Button variant="ghost" size="sm" asChild><Link to="/methodology">Method reference <ArrowUpRight size={13} /></Link></Button>
          <Button variant="secondary" size="sm" disabled={running} onClick={() => { setDraft({ cellId: undefined, bounds: undefined,
            startDate: '2022-01-01', endDate: '2022-12-31', name: 'Hurghada environmental analysis' }); setStep(1); setError(null); if (search) navigate('/lab') }}><RotateCcw size={13} /> Reset</Button></>} />
      <div className="mt-5"><LiveDataState loading={catalog.isPending} error={catalog.error} onRetry={() => void catalog.refetch()} /></div>
      {linkError ? <div role="alert" className="mt-4 rounded-[var(--r-card)] border border-[var(--danger)] p-4 text-[13px]">{linkError} No linked filter has been applied. <Link className="underline" to="/lab">Clear invalid linked filters</Link></div> : null}
      {!catalog.isPending && !catalog.error && !catalog.datasets.some(d => d.dataVerified) ? <div className="mt-4" role="alert">No certified dataset is available. Analysis is disabled.</div> : null}
      <nav className="mt-8 grid gap-1 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-card)] sm:grid-cols-3" aria-label="Analysis steps">
        {STEPS.map(item => <button key={item.id} type="button" disabled={running || (item.id > 1 && !dataValid)} onClick={() => setStep(item.id)}
          aria-current={step === item.id ? 'step' : undefined} className={`flex items-center gap-3 rounded-[var(--r-control)] px-3.5 py-3 text-left disabled:opacity-45 ${step === item.id ? 'bg-[var(--accent-soft)]' : 'text-[var(--muted)]'}`}>
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px]">{item.id < step ? <Check size={12} /> : item.id}</span>
          <span><span className="block text-[12.5px] font-medium">{item.label}</span><span className="mt-0.5 block text-[10.5px] text-[var(--faint)]">{item.detail}</span></span>
        </button>)}
      </nav>
      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="space-y-5">
          {step === 1 ? <section className={CARD}>
            <h2 className="display text-[1.6rem]">Where and what?</h2><p className="mt-2 text-[12px] text-[var(--muted)]">Catalog choices below come from the live API.</p>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <Field label="Analysis name"><TextInput value={draft.name} onChange={e => setDraft({ name: e.target.value })} /></Field>
              <Field label="Dataset"><SelectField ariaLabel="Dataset" value={draft.datasetId} onChange={value => { const d = catalog.datasets.find(item => item.id === value); setDraft({ datasetId: value, datasetVersionId: d?.datasetVersionId ?? undefined }) }}
                options={catalog.datasets.map(d => ({ value: d.id, label: `${d.shortName} - version ${d.datasetVersionId ?? 'unavailable'}`, disabled: !d.dataVerified }))} /></Field>
            </div>
            <div className="mt-5"><Field label="Study area"><SelectField ariaLabel="Study area" value={draft.regionId} onChange={value => setDraft({ regionId: value, cellId: undefined, bounds: undefined })} options={catalog.regions.map(r => ({ value: r.id, label: `${r.name}, ${r.country}` }))} /></Field></div>
            <div className="mt-5"><Field label="Environmental indicator" hint="LST is land surface temperature. NDVI/EVI are indices. GHSL is available as a snapshot in Explore, not a trend.">
              <SelectField ariaLabel="Environmental indicator" value={draft.variableId} onChange={value => setDraft({ variableId: value })} options={catalog.indicators.map(i => ({ value: i.id, label: `${i.name} (${environmentalUnit(i.unit)})${i.temporal_support === 'snapshot_2020' ? ' - snapshot only' : ''}`, disabled: i.temporal_support === 'snapshot_2020' }))} />
            </Field></div>
            {indicator?.temporal_support === 'snapshot_2020' ? <div className="mt-3" role="status"><DataNote label="Snapshot only">GHSL 2020 has no historical trend analysis. Choose a time-varying indicator here, or inspect the static snapshot in Explore. No other indicator was substituted.</DataNote></div> : null}
            {params.has('dataset_version_id') && draft.datasetVersionId !== dataset?.datasetVersionId ? <p className="mt-3 text-[11px]">Linked version {draft.datasetVersionId} is pinned; the API will verify its certification.</p> : null}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Start date"><TextInput aria-label="Start date" type="date" min={minimumDate} max={maximumDate} value={draft.startDate} onChange={e => setDraft({ startDate: e.target.value })} /></Field>
              <Field label="End date"><TextInput aria-label="End date" type="date" min={minimumDate} max={maximumDate} value={draft.endDate} onChange={e => setDraft({ endDate: e.target.value })} /></Field>
            </div>
            <p className="mt-2 text-[11px] text-[var(--faint)]">Published dates: {minimumDate} to {maximumDate}. Previous-month indicators use their source calendar month.</p>
            {invalidDates ? <p className="mt-2 text-[12px] text-[var(--danger)]" role="alert">Choose ordered dates inside the published historical period.</p> : null}
            <div className="mt-5"><Field label="Spatial selection" hint="Optional actual cell ID. The first 100 source cells are listed; Explore provides paginated access to all cells.">
              <SelectField ariaLabel="Spatial selection" value={draft.cellId ? String(draft.cellId) : ''} onChange={value => setDraft({ cellId: value ? Number(value) : undefined })}
                options={[{ value: '', label: 'Entire selected region' }, ...(!cells.data?.items.some(c => c.id === draft.cellId) && draft.cellId ? [{ value: String(draft.cellId), label: `Selected source cell ${draft.cellId}` }] : []), ...(cells.data?.items.map(c => ({ value: String(c.id), label: `Cell ${c.id} (${c.latitude.toFixed(4)}, ${c.longitude.toFixed(4)})` })) ?? [])]} />
            </Field></div>
            {draft.bounds ? <div className="mt-3 flex items-center gap-3 text-[11px]"><span>Spatial extent preserved from Explore.</span><button className="underline" onClick={() => setDraft({ bounds: undefined })}>Clear extent</button></div> : null}
          </section> : null}
          {step === 2 ? <section className={CARD}>
            <h2 className="display text-[1.6rem]">How should it be read?</h2>
            <div className="mt-5 rounded-[var(--r-control)] border border-[var(--accent)] bg-[var(--accent-soft)] p-4"><Tag tone="accent">Available</Tag><h3 className="mt-3 font-medium">Monthly descriptive OLS</h3><p className="mt-2 text-[12px] leading-relaxed">Nonmissing source observations are averaged within each cell and source month, then across contributing cells with equal weight. OLS uses actual elapsed time. Previous-month context is deduplicated and dated to its source month.</p></div>
            <dl className="mt-4"><KeyValue label="Aggregation" value="Monthly, equal cell weight" /><KeyValue label="Missing data" value="Preserved as null; no interpolation" /><KeyValue label="Quality policy" value="Certified source QA; no extra selectable filter" /></dl>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">{['Seasonal / annual analysis', 'Mann-Kendall / Sen slope', 'Anomaly detection', 'ML / tourism prediction'].map(label => <button key={label} disabled className="rounded-[var(--r-control)] border border-[var(--line)] p-4 text-left text-[12px] opacity-60">{label}<span className="mt-2 block text-[10px]">Not implemented</span></button>)}</div>
            <div className="mt-5"><DataNote label="Scientific limits">OLS significance is exploratory: seasonality, serial correlation, multiple testing and changing spatial support are not corrected. These results are not forecasts or causal tourism effects.</DataNote></div>
          </section> : null}
          {step === 3 ? <section className={CARD}><h2 className="display text-[1.6rem]">Review the request.</h2><dl className="mt-5"><KeyValue label="Region" value={region?.name ?? 'Unavailable'} /><KeyValue label="Indicator" value={indicator?.name ?? 'Unavailable'} /><KeyValue label="Dates" value={`${draft.startDate} to ${draft.endDate}`} /><KeyValue label="Dataset version" value={draft.datasetVersionId ?? 'Unavailable'} /><KeyValue label="Spatial support" value={draft.cellId ? `Cell ${draft.cellId}` : 'Selected region'} /><KeyValue label="Method" value="Monthly descriptive OLS" /></dl><p className="mt-4 text-[12px] text-[var(--muted)]">Analyze sends a read-only HTTP request. Regional queries may take 6-14 seconds or longer. No experiment is saved on the server; the response is retained locally in this browser.</p></section> : null}
          {error ? <div role="alert" className="rounded-[var(--r-card)] border border-[var(--danger)] p-4 text-[13px]">{error} No demo result was substituted.</div> : null}
          <div className="flex items-center justify-between gap-3"><Button variant="ghost" disabled={step === 1 || running} onClick={() => setStep(step - 1)}><ArrowLeft size={14} /> Back</Button>
            {step < 3 ? <Button disabled={!dataValid || running} onClick={() => setStep(step + 1)}>Continue <ArrowUpRight size={14} /></Button> : <Button disabled={!dataValid || running} onClick={() => void handleRun()}><Play size={14} /> Analyze</Button>}
          </div>
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start"><div className={CARD}><p className="label">Live run sheet</p><h3 className="display mt-3 text-[1.5rem]">{draft.name || 'Untitled analysis'}</h3><dl className="mt-4"><KeyValue label="Region" value={region?.name ?? (catalog.isPending ? 'Loading catalog' : 'Unavailable')} /><KeyValue label="Indicator" value={indicator?.name ?? 'Select indicator'} /><KeyValue label="Units" value={environmentalUnit(indicator?.unit ?? '')} /><KeyValue label="Version" value={draft.datasetVersionId ?? 'Unavailable'} /><KeyValue label="Period" value={`${draft.startDate} / ${draft.endDate}`} /></dl><p className="mt-4 text-[11px] leading-relaxed text-[var(--muted)]">SQL-backed observed data. No generated result, no forecast, no mock fallback.</p></div></aside>
      </div>
      <RunProgress open={running} configuration={draft} progressIndex={0} onCancel={cancelRun} regionName={region?.name} indicatorName={indicator?.name} />
    </div>
  )
}
