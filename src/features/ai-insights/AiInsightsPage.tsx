import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, FlaskConical, ShieldCheck } from 'lucide-react'
import { EmptyState } from '@/components/common/EmptyState'
import { DataNote, PageHeader, ReadoutStrip, SectionHead, Tag } from '@/components/common/Primitives'
import { environmentalUnit, nullableNumber } from '@/components/common/LiveDataState'
import { Button } from '@/components/ui/button'
import { useLabStore } from '@/store/useLabStore'

export function AiInsightsPage() {
  const experiments = useLabStore((state) => state.experiments)
  const activeId = useLabStore((state) => state.activeId)
  const completed = experiments.filter((item) => item.source === 'api' && item.liveResult)
  const experiment = completed.find((item) => item.id === activeId) ?? completed[0]
  const result = experiment?.liveResult
  return (
    <div className="mx-auto max-w-[1560px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader eyebrow="07 / Evidence companion" title={<>Read the evidence, <em className="text-[var(--muted)]">keep its limits.</em></>} lede="A descriptive readout of the actual analysis response. AI-generated interpretation, tourism predictions and causal impact claims are unavailable." meta={<div className="flex flex-wrap gap-2"><Tag tone="accent">Observed data</Tag><Tag tone="warn">Predictive companion unavailable</Tag></div>} />
      <div className="mt-7"><DataNote label="Unavailable features">No tourism model, future forecast, generated policy recommendation or causal analysis is implemented. The companion does not create replacement values or narratives when data is missing.</DataNote></div>
      {result && experiment ? <>
        <section className="mt-8"><SectionHead title={experiment.configuration.name} lede={`${experiment.context?.indicatorName ?? result.indicator} · ${experiment.configuration.startDate} to ${experiment.configuration.endDate}`} action={<Button size="sm" variant="secondary" asChild><Link to={`/results/${experiment.id}`}>Open full readout <ArrowUpRight size={13} /></Link></Button>} />
          <div className="mt-4"><ReadoutStrip columns={3} items={[
            { label: 'Observed monthly values', value: `${result.observation_count} / ${result.total_slots}`, detail: 'Missing calendar slots remain missing.', tone: 'accent' },
            { label: 'Descriptive OLS slope', value: result.slope_per_year == null ? 'Unavailable' : `${nullableNumber(result.slope_per_year, 4)} ${environmentalUnit(result.unit)}/yr`, detail: 'An estimate of historical change, not a future forecast.', tone: 'violet' },
            { label: 'Missing calendar slots', value: result.missing_data_ratio == null ? 'Unavailable' : `${nullableNumber(result.missing_data_ratio * 100, 1)}%`, detail: 'Calendar support, not a count of raw retrieval quality.' },
          ]} /></div>
        </section>
        <section className="mt-8"><SectionHead title="Evidence and limitations" lede="The methodology and warnings below come directly from the service response." /><div className="mt-4 space-y-3"><DataNote label="Method"><ShieldCheck className="mr-1 inline" size={14} />{result.methodology}</DataNote>{result.warnings.map((warning) => <DataNote key={warning} label="Limitation"><AlertTriangle className="mr-1 inline" size={14} />{warning}</DataNote>)}{result.warning ? <DataNote label="Dataset">{result.warning}</DataNote> : null}</div></section>
      </> : <div className="mt-8"><EmptyState eyebrow="Observed results" title="No real analysis to read yet" body="Choose a region, source indicator and historical dates in Analyze. This page will show only an actual validated API result." action={<Button asChild><Link to="/lab"><FlaskConical size={14} /> Run an analysis</Link></Button>} /></div>}
    </div>
  )
}
