import { useMemo, useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, FlaskConical, GitCompare } from 'lucide-react'
import { Field, SelectField, TextInput } from '@/components/common/Field'
import { DataNote, PageHeader, ReadoutStrip, SectionHead, Tag } from '@/components/common/Primitives'
import { LiveDataState, environmentalUnit, nullableNumber } from '@/components/common/LiveDataState'
import { Button } from '@/components/ui/button'
import { useCatalog } from '@/hooks/useEnvironment'
import { environmentApi } from '@/services/api/earthtrend'
import type { ComparisonFilters, AggregateSummary } from '@/types/environment'

export function ComparePage() {
  const catalog = useCatalog()
  const [regionId, setRegionId] = useState('')
  const [indicatorId, setIndicatorId] = useState('')
  const [aStart, setAStart] = useState('2021-01-01')
  const [aEnd, setAEnd] = useState('2021-03-31')
  const [bStart, setBStart] = useState('2022-01-01')
  const [bEnd, setBEnd] = useState('2022-03-31')
  const [validation, setValidation] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState<ComparisonFilters | null>(null)
  const queryClient = useQueryClient()
  const region = catalog.regions.find((item) => item.id === regionId) ?? catalog.regions[0]
  const availableIndicators = useMemo(() => catalog.indicators.filter((item) => item.temporal_support !== 'snapshot_2020'), [catalog.indicators])
  const indicator = availableIndicators.find((item) => item.id === indicatorId) ?? availableIndicators.find((item) => item.id === 'terra_lst_day_c') ?? availableIndicators[0]
  const dataset = catalog.datasets.find((item) => item.dataVerified && item.datasetVersionId != null)
  const queryKey = ['environment', 'period-comparison', submitted] as const
  const result = useQuery({
    queryKey,
    queryFn: ({ signal }) => environmentApi.comparePeriods(submitted!, { signal }),
    enabled: submitted != null,
    staleTime: 5 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const reading = result.data
  const resultIndicator = catalog.indicators.find((item) => item.id === reading?.indicator)
  const unit = environmentalUnit(reading?.unit ?? indicator?.unit ?? '')
  const dirty = Boolean(submitted && (submitted.region_id !== region?.id || submitted.indicator !== indicator?.id || submitted.period_a_start !== aStart || submitted.period_a_end !== aEnd || submitted.period_b_start !== bStart || submitted.period_b_end !== bEnd))
  const ready = Boolean(region && indicator && dataset)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!region || !indicator || !dataset) return
    if (aStart > aEnd || bStart > bEnd) { setValidation('Each period must start on or before its end.'); return }
    if (aStart <= bEnd && bStart <= aEnd) { setValidation('Choose two disjoint periods. Overlapping dates cannot be compared.'); return }
    if (indicator.temporal_support === 'previous_month' && aStart.slice(0, 7) <= bEnd.slice(0, 7) && bStart.slice(0, 7) <= aEnd.slice(0, 7)) { setValidation('Previous-month indicators require disjoint source calendar months.'); return }
    const min = dataset.studyPeriod?.start
    const max = dataset.studyPeriod?.end
    if ((min && [aStart, bStart].some((day) => day < min)) || (max && [aEnd, bEnd].some((day) => day > max))) { setValidation(`Choose dates within the published historical record (${min ?? 'unknown start'} to ${max ?? 'unknown end'}).`); return }
    setValidation(null)
    setSubmitted({ region_id: region.id, indicator: indicator.id, dataset_version_id: dataset.datasetVersionId!, period_a_start: aStart, period_a_end: aEnd, period_b_start: bStart, period_b_end: bEnd })
  }

  return (
    <div className="mx-auto max-w-[1560px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader eyebrow="06 / Compare" title={<>Read the <em className="text-[var(--accent)]">difference.</em></>} lede="Compare observed monthly aggregates across two disjoint historical periods. Every result comes from the certified environmental database." actions={<Button size="sm" variant="secondary" asChild><Link to="/lab"><FlaskConical size={13} /> New trend analysis</Link></Button>} meta={<div className="flex flex-wrap gap-2"><Tag tone="accent">Descriptive period comparison</Tag><Tag>No forecast or tourism model</Tag></div>} />
      <div className="mt-6"><LiveDataState loading={catalog.isPending} error={catalog.error} onRetry={() => { void catalog.refetch() }} message="Loading available regions and source indicators…" /></div>
      <form onSubmit={submit} className="mt-6 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Region"><SelectField ariaLabel="Comparison region" value={region?.id ?? ''} onChange={setRegionId} options={catalog.regions.map((item) => ({ value: item.id, label: item.name }))} disabled={result.isFetching} /></Field>
          <Field label="Environmental indicator"><SelectField ariaLabel="Comparison indicator" value={indicator?.id ?? ''} onChange={setIndicatorId} options={availableIndicators.map((item) => ({ value: item.id, label: `${item.name} (${environmentalUnit(item.unit)})` }))} disabled={result.isFetching} /></Field>
        </div>
        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <fieldset className="grid gap-3 rounded-[var(--r-control)] border border-[var(--line)] p-4 sm:grid-cols-2"><legend className="label px-1 text-[var(--accent)]">Period A</legend><Field label="Start A"><TextInput aria-label="Period A start" type="date" required value={aStart} onChange={(event) => setAStart(event.target.value)} disabled={result.isFetching} /></Field><Field label="End A"><TextInput aria-label="Period A end" type="date" required value={aEnd} onChange={(event) => setAEnd(event.target.value)} disabled={result.isFetching} /></Field></fieldset>
          <div className="hidden text-[var(--faint)] md:block"><GitCompare size={20} /></div>
          <fieldset className="grid gap-3 rounded-[var(--r-control)] border border-[var(--line)] p-4 sm:grid-cols-2"><legend className="label px-1 text-[var(--violet)]">Period B</legend><Field label="Start B"><TextInput aria-label="Period B start" type="date" required value={bStart} onChange={(event) => setBStart(event.target.value)} disabled={result.isFetching} /></Field><Field label="End B"><TextInput aria-label="Period B end" type="date" required value={bEnd} onChange={(event) => setBEnd(event.target.value)} disabled={result.isFetching} /></Field></fieldset>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-[var(--muted)]">{indicator?.description} {indicator?.temporal_support === 'previous_month' ? 'Dates refer to source calendar months; repeated attachments are deduplicated.' : 'Acquisitions are averaged within each cell/month before equal-cell regional aggregation.'} GHSL 2020 is excluded because it is a static snapshot.</p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-[11px] text-[var(--faint)]">{dataset ? `Certified version ${dataset.datasetVersionId} · ${dataset.studyPeriod?.start ?? '—'} to ${dataset.studyPeriod?.end ?? '—'}` : 'No certified dataset available'}</p><Button type="submit" disabled={!ready || result.isFetching}>{result.isFetching ? 'Comparing observed periods…' : 'Compare periods'}<ArrowRight size={14} /></Button></div>
      </form>
      <div className="mt-4 space-y-3">
        {validation ? <div role="alert" className="rounded-[var(--r-control)] border border-[var(--warn)] p-4 text-[13px]">{validation}</div> : null}
        <LiveDataState loading={submitted != null && result.isFetching} error={result.error} onRetry={() => { void result.refetch() }} onCancel={() => { void queryClient.cancelQueries({ queryKey, exact: true }); setSubmitted(null) }} />
        {dirty && reading ? <DataNote label="Unapplied changes">The result below belongs to the last submitted periods. Choose Compare periods to apply the edited filters.</DataNote> : null}
      </div>
      {reading ? <>
        <section className="mt-8"><SectionHead title="Observed difference" lede={`${resultIndicator?.name ?? reading.indicator} · certified version ${reading.dataset_version_id}`} action={<Tag tone={reading.availability === 'available' ? 'ok' : 'warn'}>{reading.availability.replaceAll('_', ' ')}</Tag>} />
          <div className="mt-4"><ReadoutStrip columns={3} items={[
            { label: 'Period A mean', value: reading.period_a.mean == null ? 'Unavailable' : `${nullableNumber(reading.period_a.mean)} ${unit}`, detail: `${reading.period_a.observation_count} observed monthly values / ${reading.period_a.total_slots} slots`, tone: 'accent' },
            { label: 'Period B mean', value: reading.period_b.mean == null ? 'Unavailable' : `${nullableNumber(reading.period_b.mean)} ${unit}`, detail: `${reading.period_b.observation_count} observed monthly values / ${reading.period_b.total_slots} slots`, tone: 'violet' },
            { label: 'Absolute change (B − A)', value: reading.absolute_change == null ? 'Unavailable' : `${nullableNumber(reading.absolute_change)} ${unit}`, detail: reading.percentage_change == null ? 'Percentage change is unavailable or not meaningful in this unit.' : `${nullableNumber(reading.percentage_change)}% change` },
          ]} /></div>
        </section>
        <section className="mt-6 grid gap-4 md:grid-cols-2"><PeriodCard title="Period A" summary={reading.period_a} unit={unit} /><PeriodCard title="Period B" summary={reading.period_b} unit={unit} /></section>
        <div className="mt-6 space-y-3"><DataNote label="Method">{reading.methodology} Missing observations are never zero. The comparison endpoint returns summaries, so no synthetic comparison series or fitted line is drawn.</DataNote>{reading.warnings.map((warning) => <DataNote key={warning} label="Limit">{warning}</DataNote>)}{reading.warning ? <DataNote label="Dataset">{reading.warning}</DataNote> : null}<p className="break-all text-[10px] text-[var(--faint)]">Computation ID {reading.analysis_id} · ephemeral response ID; no saved server experiment.</p></div>
      </> : !result.isFetching ? <div className="mt-8 rounded-[var(--r-card)] border border-dashed border-[var(--line-strong)] p-8 text-center"><GitCompare className="mx-auto text-[var(--accent)]" size={24} /><h2 className="display mt-4 text-[23px]">Choose two periods to compare</h2><p className="mt-2 text-[13px] text-[var(--muted)]">Actual monthly means, missingness and change will appear after the request completes.</p></div> : null}
    </div>
  )
}

function PeriodCard({ title, summary, unit }: { title: string; summary: AggregateSummary; unit: string }) {
  return <article className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5"><h3 className="display text-[22px]">{title}</h3><dl className="mt-4 space-y-3 text-[12px]"><Row label="Returned temporal support" value={`${summary.start_date ?? 'Unavailable'} → ${summary.end_date ?? 'Unavailable'}`} /><Row label={`Mean (${unit})`} value={nullableNumber(summary.mean)} /><Row label="Observed monthly values" value={`${summary.observation_count} / ${summary.total_slots}`} /><Row label="Missing calendar slots" value={summary.missing_data_ratio == null ? 'Unavailable' : `${nullableNumber(summary.missing_data_ratio * 100, 1)}%`} /></dl></article>
}

function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 border-b border-[var(--line)] pb-2"><dt className="text-[var(--muted)]">{label}</dt><dd className="num text-right">{value}</dd></div> }
