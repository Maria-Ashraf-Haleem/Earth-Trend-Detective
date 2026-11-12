import { Sparkline } from '@/components/charts/Sparkline'
import { EmptyState } from '@/components/common/EmptyState'
import { DemoMark, SelectField } from '@/components/common/Field'
import {
  DataNote,
  KeyValue,
  Meter,
  PageHeader,
  ReadoutStrip,
  SectionHead,
  Tag,
  TrendMark,
} from '@/components/common/Primitives'
import { Button } from '@/components/ui/button'
import { useLabStore } from '@/store/useLabStore'
import { formatNumber, formatPValue, formatPercent, formatSlope } from '@/utils/format'
import {
  ArrowUpRight,
  AlertTriangle,
  Compass,
  FlaskConical,
  MapPinned,
  Quote,
  ShieldCheck,
  Thermometer,
  Users,
} from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

const SECTION_META = {
  summary: { title: 'Scientific summary', index: '01', icon: Quote, target: 'finding' },
  whatChanged: { title: 'What changed', index: '02', icon: Thermometer, target: 'series' },
  whereChanged: { title: 'Where it changed', index: '03', icon: MapPinned, target: 'spatial' },
  significance: { title: 'How significant', index: '04', icon: ShieldCheck, target: 'statistics' },
  seasonal: { title: 'Seasonal reading', index: '05', icon: Compass, target: 'series' },
  tourism: { title: 'Tourism relevance', index: '06', icon: Users, target: 'finding' },
  limitations: { title: 'What cannot be concluded', index: '07', icon: AlertTriangle, target: 'limits' },
} as const

export function AiInsightsPage() {
  const experiments = useLabStore((s) => s.experiments)
  const activeId = useLabStore((s) => s.activeId)
  const openExperiment = useLabStore((s) => s.openExperiment)
  const setDraft = useLabStore((s) => s.setDraft)
  const setSelectedAnomaly = useLabStore((s) => s.setSelectedAnomaly)
  const setToast = useLabStore((s) => s.setToast)
  const navigate = useNavigate()

  const completed = experiments.filter((item) => item.results)
  const experiment = completed.find((item) => item.id === activeId) ?? completed[0]
  const insight = experiment?.results?.insight
  const results = experiment?.results

  if (!insight || !results || !experiment) {
    return (
      <div className="mx-auto max-w-[1560px] px-4 py-12 md:px-7 lg:px-10">
        <EmptyState
          eyebrow="07 / Companion"
          title="No analysis to interpret"
          body="The companion only explains supplied analysis results. Run an experiment first; it will not invent observations."
          action={
            <Button asChild>
              <Link to="/lab">Run an analysis</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const { trend, quality, anomalies } = results
  const reportBase = `/results/${experiment.id}`
  const steepest = [...(results.spatial.find((layer) => layer.kind === 'trend')?.cells ?? [])].sort(
    (a, b) => b.slopePerYear - a.slopePerYear,
  )[0]

  const questions = [
    {
      question: 'How does nighttime temperature compare with daytime?',
      detail: 'Reconfigure this protocol for the nighttime retrieval band.',
      action: () => {
        setDraft({
          name: 'Hurghada nighttime LST comparison',
          variableId: 'lst-night',
          observationWindow: 'nighttime',
        })
        setToast('Nighttime protocol loaded in Analyze')
        navigate('/lab')
      },
    },
    {
      question: 'Which season shows the strongest trend?',
      detail: 'Switch the aggregation to seasonal and re-run the tests.',
      action: () => {
        setDraft({
          name: 'Hurghada seasonal LST trend',
          aggregation: 'seasonal',
          observationWindow: 'daytime',
          variableId: 'lst-day',
        })
        setToast('Seasonal protocol loaded in Analyze')
        navigate('/lab')
      },
    },
    {
      question: 'How does the trend change over a shorter period?',
      detail: 'Restrict the window to 2015–2024 and compare the slope.',
      action: () => {
        setDraft({ name: 'Hurghada LST 2015–2024', startDate: '2015-01-01', endDate: '2024-12-31' })
        setToast('Shortened period loaded in Analyze')
        navigate('/lab')
      },
    },
    {
      question: 'Are anomalies concentrated in particular months?',
      detail: 'Open the anomaly timeline and inspect the flagged dates.',
      action: () => {
        setSelectedAnomaly(null)
        navigate(`${reportBase}#anomalies`)
      },
    },
  ]

  return (
    <div className="mx-auto max-w-[1560px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader
        eyebrow="07 / Companion"
        title={
          <>
            Interpretation, <em className="text-[var(--accent)]">with receipts.</em>
          </>
        }
        lede="This companion reads the analysis you supplied and explains it in plain language. It does not browse, invent findings, or run an LLM in demo mode. Every claim points back to a number or chart in the report."
        actions={
          <div className="w-full max-w-[290px]">
            <p className="kicker mb-1.5">Interpreting run</p>
            <SelectField
              value={experiment.id}
              ariaLabel="Experiment to interpret"
              onChange={(value) => {
                openExperiment(value)
                setToast('Interpretation context switched')
              }}
              options={completed.map((item) => ({
                value: item.id,
                label: item.configuration.name,
              }))}
            />
          </div>
        }
        meta={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <DemoMark label="Template interpretation" />
            <Tag tone="violet">Grounded generation</Tag>
            <Tag tone="accent">{anomalies.length} anomalies</Tag>
            <span className="tech ml-auto hidden text-[var(--faint)] sm:block">
              No language model · deterministic template
            </span>
          </div>
        }
      />

      <ReadoutStrip
        className="mt-7"
        items={[
          {
            label: 'Sen’s slope',
            value: formatSlope(trend.senSlopePerYear).replace(' °C / yr', ''),
            detail: '°C per year, Theil–Sen estimator',
            tone: trend.direction === 'increasing' ? 'warn' : 'accent',
          },
          {
            label: 'Mann–Kendall p',
            value: formatPValue(trend.pValue),
            detail: trend.significant ? `Significant at α = ${trend.alpha}` : 'Fails to reject the no-trend null',
            tone: 'violet',
          },
          {
            label: 'Valid observations',
            value: formatPercent(quality.validRatio),
            detail: `${quality.validObservations} observations retained after QC`,
            tone: 'accent',
          },
          {
            label: 'Flagged anomalies',
            value: String(anomalies.length),
            detail: 'Residual departures from trend and seasonal norm',
          },
        ]}
      />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-12">
        {/* Article */}
        <article className="min-w-0">
          <DataNote label="Grounding rule">
            The response is assembled from the experiment’s stored outputs: slope {formatSlope(trend.senSlopePerYear)}, p{' '}
            {formatPValue(trend.pValue)}, {anomalies.length} anomalies and {quality.validObservations} valid observations.
            It is a demonstration of evidence-linked explanation, not an independent scientific opinion.
          </DataNote>

          {/* Summary — the opening statement of the dossier */}
          <section
            id="summary"
            className="relative mt-8 scroll-mt-[calc(var(--shell-offset,146px)+20px)] border-t border-[var(--line-strong)] pt-4"
          >
            <SectionLabel meta={SECTION_META.summary} target={reportBase} />
            <p className="display mt-6 max-w-[30ch] text-[clamp(2.1rem,4.4vw,3.6rem)] leading-[1.02]">
              {trend.direction === 'increasing' ? (
                <>
                  The illustrative record points to a <em className="text-[var(--warn)]">warming</em> surface.
                </>
              ) : trend.direction === 'decreasing' ? (
                <>
                  The illustrative record points to a <em className="text-[var(--accent)]">cooling</em> surface.
                </>
              ) : (
                <>The illustrative record does not support a confident directional claim.</>
              )}
            </p>
            <div className="mt-6 grid gap-x-10 gap-y-5 border-t border-[var(--line)] pt-4 md:grid-cols-[minmax(0,1fr)_auto]">
              <p className="max-w-[70ch] text-[12.5px] leading-relaxed text-[var(--muted)]">{insight.summary}</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:justify-end">
                <TrendMark direction={trend.direction} />
                <span className="hidden h-3 w-px bg-[var(--line)] md:block" />
                <span className="num text-[10.5px] text-[var(--muted)]">{formatSlope(trend.senSlopePerYear)}</span>
                <span className="num text-[10.5px] text-[var(--muted)]">p {formatPValue(trend.pValue)}</span>
                <span className="num text-[10.5px] text-[var(--muted)]">{formatPercent(quality.validRatio)} valid</span>
              </div>
            </div>
          </section>

          <div className="mt-8 grid gap-x-10 gap-y-0 md:grid-cols-2">
            <InsightSection
              id="what"
              meta={SECTION_META.whatChanged}
              body={insight.whatChanged}
              target={`${reportBase}#series`}
              className="md:col-span-2"
              extra={
                <div className="mt-4 border-y border-[var(--line)] bg-[var(--surface)] py-2.5">
                  <div className="flex items-center justify-between px-2 pb-1">
                    <p className="label text-[var(--faint)]">Monthly record</p>
                    <span className="num text-[9px] text-[var(--faint)]">
                      {results.monthlySeries?.length ?? results.series.length} slots
                    </span>
                  </div>
                  <Sparkline
                    series={results.monthlySeries ?? results.series}
                    width={520}
                    height={64}
                    className="mt-1 h-16 w-full"
                  />
                </div>
              }
            />

            <InsightSection
              id="where"
              meta={SECTION_META.whereChanged}
              body={insight.whereChanged}
              target={`${reportBase}#spatial`}
              extra={
                steepest ? (
                  <div className="mt-4 grid gap-2 border-t border-[var(--line)] pt-3 sm:grid-cols-3">
                    <MiniEvidence label="Steepest cell" value={`${formatNumber(steepest.slopePerYear, 3)} °C/yr`} />
                    <MiniEvidence label="Cell p-value" value={steepest.pValue.toFixed(3)} />
                    <MiniEvidence
                      label="Spatial cells"
                      value={String(results.spatial.find((layer) => layer.kind === 'trend')?.cells.length ?? 0)}
                    />
                  </div>
                ) : null
              }
            />

            <InsightSection
              id="significance"
              meta={SECTION_META.significance}
              body={insight.significance}
              target={`${reportBase}#statistics`}
            />

            <InsightSection
              id="seasonal"
              meta={SECTION_META.seasonal}
              body={insight.seasonal}
              target={`${reportBase}#series`}
            />

            <InsightSection
              id="tourism"
              meta={SECTION_META.tourism}
              body={insight.tourism}
              target={`${reportBase}#finding`}
            />

            <InsightSection
              id="limits"
              meta={SECTION_META.limitations}
              body={insight.limitations}
              target={`${reportBase}#limits`}
              tone="warn"
              className="md:col-span-2"
            />
          </div>

          {/* Suggested questions — a ledger of next protocols */}
          <section className="mt-12">
            <SectionHead
              index="08"
              title="Turn the read into the next protocol."
              lede="Each question applies a concrete configuration and sends you to Analyze. Nothing runs until you choose to run it."
              action={<span className="tech hidden text-[var(--faint)] sm:block">4 open questions</span>}
            />
            <ol className="mt-4 border-t border-[var(--line)]">
              {questions.map((item, index) => (
                <li key={item.question} className="border-b border-[var(--line)]">
                  <button
                    type="button"
                    onClick={item.action}
                    className="group flex w-full items-start gap-4 py-4 text-left transition-colors duration-150 hover:bg-[var(--surface)]"
                  >
                    <span className="w-6 shrink-0 pt-0.5 font-mono text-[9px] text-[var(--faint)]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug font-medium text-[var(--ink)] group-hover:text-[var(--accent)]">
                        {item.question}
                      </span>
                      <span className="mt-1 block text-[10.5px] leading-relaxed text-[var(--muted)]">{item.detail}</span>
                    </span>
                    <ArrowUpRight
                      size={14}
                      className="mt-0.5 shrink-0 text-[var(--faint)] transition-colors group-hover:text-[var(--accent)]"
                    />
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-[var(--line-strong)] pt-5">
            <Button asChild size="sm">
              <Link to={reportBase}>Open full readout</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/compare">Compare runs</Link>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/lab">Design another protocol</Link>
            </Button>
          </div>
        </article>

        {/* Evidence rail */}
        <aside className="h-fit space-y-8 lg:sticky lg:top-[calc(var(--shell-offset,146px)+20px)]">
          <div className="border-t border-[var(--line-strong)] pt-4">
            <div className="flex items-center justify-between">
              <p className="kicker text-[var(--ink)]">Evidence register</p>
              <ShieldCheck size={14} className="text-[var(--accent)]" />
            </div>
            <dl className="mt-2">
              <KeyValue
                label="Region"
                value={experiment.configuration.regionId === 'hurghada' ? 'Hurghada, EG' : 'Safaga, EG'}
              />
              <KeyValue
                label="Period"
                value={`${experiment.configuration.startDate.slice(0, 4)}–${experiment.configuration.endDate.slice(0, 4)}`}
              />
              <KeyValue label="Sen’s slope" value={formatSlope(trend.senSlopePerYear)} />
              <KeyValue label="Mann–Kendall p" value={formatPValue(trend.pValue)} />
              <KeyValue label="Valid ratio" value={formatPercent(quality.validRatio)} />
              <KeyValue label="Anomalies" value={String(anomalies.length)} />
            </dl>
            <Meter value={quality.validRatio} className="mt-3" />
            <p className="mt-2 text-[9px] leading-relaxed text-[var(--faint)]">
              All fields are read from the stored analysis result. The companion has no access to other data.
            </p>
          </div>

          <div className="border-t border-[var(--line-strong)] pt-4">
            <div className="flex items-center gap-2">
              <FlaskConical size={13} className="text-[var(--faint)]" />
              <p className="kicker text-[var(--ink)]">How this was made</p>
            </div>
            <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--muted)]">
              Deterministic template generation over stored statistics. No language model is called in demo mode; the
              FastAPI contract reserves an insights endpoint for a future grounded model.
            </p>
          </div>

          <div className="border-l-2 border-[var(--warn)] bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] py-2.5 pr-3 pl-3">
            <p className="kicker text-[var(--warn)]">Data provenance</p>
            <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
              Illustrative values only. Nothing on this page is a NASA observation.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function SectionLabel({
  meta,
  target,
}: {
  meta: { title: string; index: string; icon: LucideIcon; target: string }
  target: string
}) {
  const Icon = meta.icon
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-baseline gap-2.5">
        <span className="tech text-[var(--faint)]">{meta.index}</span>
        <Icon size={12} className="text-[var(--accent)]" />
        <h2 className="label text-[var(--ink)]">{meta.title}</h2>
      </div>
      <Link
        to={target}
        className="label inline-flex min-h-6 items-center gap-1 text-[var(--faint)] transition-colors hover:text-[var(--accent)]"
      >
        Evidence <ArrowUpRight size={10} />
      </Link>
    </div>
  )
}

function InsightSection({
  id,
  meta,
  body,
  target,
  extra,
  tone,
  className,
}: {
  id: string
  meta: { title: string; index: string; icon: LucideIcon; target: string }
  body: string
  target: string
  extra?: ReactNode
  tone?: 'warn'
  className?: string
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-[calc(var(--shell-offset,146px)+20px)] border-t border-[var(--line-strong)] py-4 ${
        tone === 'warn' ? 'bg-[color-mix(in_srgb,var(--warn)_4%,transparent)] pr-3 pl-3' : ''
      } ${className ?? ''}`}
    >
      <SectionLabel meta={meta} target={target} />
      <p className="mt-2.5 max-w-[76ch] text-[12px] leading-relaxed text-[var(--muted)]">{body}</p>
      {extra}
    </section>
  )
}

function MiniEvidence({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="label text-[var(--faint)]">{label}</p>
      <p className="num mt-1 text-[12px] text-[var(--ink)]">{value}</p>
    </div>
  )
}
