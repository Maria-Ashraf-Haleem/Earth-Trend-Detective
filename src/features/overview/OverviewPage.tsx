import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Compass, FlaskConical, GitCompare, MoveRight, ShieldCheck } from 'lucide-react'
import { SelectField } from '@/components/common/Field'
import { DataNote, ReadoutStrip, SectionHead, Tag } from '@/components/common/Primitives'
import { LiveDataState, environmentalUnit, nullableNumber } from '@/components/common/LiveDataState'
import { HeroPlate } from '@/components/maps/HeroPlate'
import { Button } from '@/components/ui/button'
import { useCatalog, useDashboardSummary, useDataCoverage, useEnvironmentalOverview } from '@/hooks/useEnvironment'

const WORKFLOW = [
  { id: 'explore', label: 'Explore', body: 'Locate actual source cell centers and inspect bounded observation pages.', to: '/explorer', icon: Compass },
  { id: 'analyze', label: 'Analyze', body: 'Choose an indicator and historical dates, then compute a descriptive monthly trend.', to: '/lab', icon: FlaskConical },
  { id: 'compare', label: 'Compare', body: 'Compare two disjoint periods with real monthly aggregate summaries.', to: '/compare', icon: GitCompare },
]

export function OverviewPage() {
  const catalog = useCatalog()
  const [regionId, setRegionId] = useState('')
  const [details, setDetails] = useState(false)
  const region = catalog.regions.find((item) => item.id === regionId) ?? catalog.regions[0]
  const dataset = catalog.datasets.find((item) => item.dataVerified && item.datasetVersionId != null)
  const scope = useMemo(() => ({ region_id: region?.id, dataset_version_id: dataset?.datasetVersionId ?? undefined }), [region?.id, dataset?.datasetVersionId])
  const ready = Boolean(region && dataset)
  const summary = useDashboardSummary(scope, { enabled: ready })
  const coverage = useDataCoverage(scope, { enabled: ready && details })
  const overview = useEnvironmentalOverview(scope, { enabled: ready && details })
  const indicatorById = new Map(catalog.indicators.map((item) => [item.id, item]))
  const means = new Map(overview.data?.items.map((item) => [item.indicator, item]) ?? [])

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-10 pb-8 md:px-8 md:pt-14">
      <section className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:items-center">
        <div className="animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">{region?.name ?? 'Environmental observations'}</Tag>
            <Tag tone={dataset?.dataVerified ? 'ok' : 'warn'}>{dataset?.dataVerified ? `Certified version ${dataset.datasetVersionId}` : 'Awaiting published data'}</Tag>
          </div>
          <h1 className="display mt-6 text-[clamp(2.4rem,4.6vw,4rem)] text-[var(--ink)]">Two decades of land surface change, <em className="text-[var(--muted)]">read cell by cell.</em></h1>
          <p className="mt-5 max-w-[52ch] text-[14.5px] leading-relaxed text-[var(--muted)]">Explore observed satellite-source environmental records, run transparent descriptive analysis, and see the coverage behind each result.</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <Button size="lg" asChild><Link to="/explorer">Open the field map <MoveRight size={15} /></Link></Button>
            <Button size="lg" variant="secondary" asChild><Link to="/lab">Design an analysis</Link></Button>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-6">
            <MiniFact label="Published record" value={dataset?.studyPeriod?.start && dataset.studyPeriod.end ? `${dataset.studyPeriod.start.slice(0, 4)} – ${dataset.studyPeriod.end.slice(0, 4)}` : catalog.error ? 'Unavailable' : catalog.isPending ? 'Loading…' : 'No published record'} />
            <MiniFact label="Source products" value="MODIS Terra / Aqua + GHSL" />
            <MiniFact label="Base support" value="8-day LST acquisitions" />
            <MiniFact label="Analysis" value="Monthly descriptive OLS" />
          </dl>
        </div>
        <div className="animate-rise [animation-delay:100ms]"><HeroPlate /></div>
      </section>

      <section className="mt-12 space-y-4">
        <SectionHead title="Published observation record" lede="Database-backed counts for the selected source region. Missing data remains missing." action={<div className="min-w-[240px]"><SelectField ariaLabel="Dashboard region" value={region?.id ?? ''} onChange={(value) => { setRegionId(value); setDetails(false) }} options={catalog.regions.map((item) => ({ value: item.id, label: item.name }))} /></div>} />
        <LiveDataState loading={catalog.isPending} error={catalog.error} onRetry={() => { void catalog.refetch() }} message="Loading the real dataset and indicator catalogs…" />
        {!catalog.isPending && !catalog.error && !dataset ? <DataNote label="No published dataset">The service has not published a certified dataset. Analysis is unavailable until certification is restored.</DataNote> : null}
        <LiveDataState loading={ready && summary.isPending} error={summary.error} onRetry={() => { void summary.refetch() }} />
        {summary.data ? <ReadoutStrip items={[
          { label: 'Observation rows', value: nullableNumber(summary.data.observation_rows, 0), detail: 'Original source rows in this certified region.', tone: 'accent' },
          { label: 'Spatial cells', value: nullableNumber(summary.data.spatial_cells, 0), detail: 'Source cell centers; no invented map polygons.' },
          { label: 'First observation', value: summary.data.start_date ?? 'Unavailable', detail: 'Original acquisition date.' },
          { label: 'Last observation', value: summary.data.end_date ?? 'Unavailable', detail: 'Historical data only; no future forecast.', tone: 'violet' },
        ]} /> : null}
        {summary.data?.warning ? <DataNote label="Dataset status">{summary.data.warning}</DataNote> : null}
      </section>

      <section className="mt-12">
        <SectionHead title="Coverage and source context" lede="Load one regional summary of the fourteen indicators. These row-weighted source means are separate from trend estimates." action={<Button variant="secondary" disabled={!ready || details} onClick={() => setDetails(true)}>{details ? 'Regional details requested' : 'Load regional coverage'}</Button>} />
        <div className="mt-4 space-y-3">
          {details ? <>
            <LiveDataState loading={coverage.isPending || overview.isPending} error={coverage.error ?? overview.error} onRetry={() => { void coverage.refetch(); void overview.refetch() }} />
            {coverage.data ? <div className="overflow-x-auto rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)]">
              <table className="w-full min-w-[680px] text-left text-[12px]">
                <thead><tr className="border-b border-[var(--line)] text-[var(--muted)]"><th className="p-4 font-medium">Indicator</th><th className="p-4 font-medium">Present source rows</th><th className="p-4 font-medium">Missing</th><th className="p-4 font-medium">Row-weighted mean</th></tr></thead>
                <tbody>{coverage.data.items.map((item) => { const indicator = indicatorById.get(item.indicator); const mean = means.get(item.indicator); return <tr key={item.indicator} className="border-b border-[var(--line)] last:border-0"><th className="p-4 font-normal"><span className="block">{indicator?.name ?? item.indicator}</span><span className="mt-1 block text-[10px] text-[var(--faint)]">{indicator?.temporal_support === 'previous_month' ? 'Previous source month' : indicator?.temporal_support === 'snapshot_2020' ? 'GHSL 2020 snapshot, 2021+ attachments' : '8-day source acquisition'}</span></th><td className="num p-4">{nullableNumber(item.present_rows, 0)}</td><td className="num p-4">{nullableNumber(item.missing_rows, 0)}</td><td className="num p-4">{mean ? `${nullableNumber(mean.mean_attached_source_value)} ${environmentalUnit(indicator?.unit ?? '')}` : overview.isPending ? 'Loading…' : 'Unavailable'}</td></tr> })}</tbody>
              </table>
            </div> : null}
            {coverage.data ? <p className="text-[11px] leading-relaxed text-[var(--faint)]">{coverage.data.denominator} {overview.data?.methodology}</p> : null}
          </> : <div className="rounded-[var(--r-card)] border border-dashed border-[var(--line-strong)] p-6 text-[13px] text-[var(--muted)]">Regional details are loaded on request to avoid repeated expensive database queries.</div>}
        </div>
      </section>

      <section className="mt-14">
        <SectionHead title="Three moves, one evidence chain." lede="Use real locations, source indicators and historical dates throughout the workflow." />
        <ol className="mt-6 grid gap-4 md:grid-cols-3">{WORKFLOW.map((step) => <li key={step.id}><Link to={step.to} className="card-hover group flex h-full flex-col rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"><span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]"><step.icon size={17} /></span><h3 className="display mt-4 text-[20px]">{step.label}</h3><p className="mt-2 text-[13px] leading-relaxed text-[var(--muted)]">{step.body}</p><span className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">Open {step.label}<ArrowRight size={13} /></span></Link></li>)}</ol>
      </section>
      <div className="mt-10"><DataNote label="Scientific scope"><ShieldCheck size={14} className="mr-1 inline" /> Land surface temperature is not air temperature. GHSL is one 2020 snapshot. Descriptive trends are not predictions; no tourism model or causal impact estimate is implemented.</DataNote></div>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return <div><dt className="label text-[var(--faint)]">{label}</dt><dd className="mt-1.5 text-[12px] font-medium">{value}</dd></div>
}
