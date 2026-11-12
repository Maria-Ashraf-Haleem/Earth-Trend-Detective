import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { DemoMark } from '@/components/common/Field'
import { FigureFrame, ReadoutStrip, SectionHead, Tag, TrendMark } from '@/components/common/Primitives'
import { HeroPlate } from '@/components/maps/HeroPlate'
import { Button } from '@/components/ui/button'
import { datasets, regions, variables } from '@/data/mock/catalog'
import { useLabStore } from '@/store/useLabStore'
import { formatDate, formatPValue, formatPercent, formatSlope } from '@/utils/format'
import { ArrowRight, ArrowUpRight, Compass, FlaskConical, GitCompare, MoveRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

const WORKFLOW = [
  {
    id: 'explore',
    label: 'Explore',
    body: 'Start with a place. Read the field, the coastline and the observation record before making a claim.',
    to: '/explorer',
    icon: Compass,
  },
  {
    id: 'analyze',
    label: 'Analyze',
    body: 'Pick a period, a quality policy and a statistical method in three guided steps.',
    to: '/lab',
    icon: FlaskConical,
  },
  {
    id: 'compare',
    label: 'Compare',
    body: 'Put results side by side and see what the protocol actually changed.',
    to: '/compare',
    icon: GitCompare,
  },
]

export function OverviewPage() {
  const experiments = useLabStore((s) => s.experiments)
  const featured =
    experiments.find((item) => item.id === 'demo-hurghada-day-0326' && item.results) ??
    experiments.find((item) => item.results) ??
    experiments[0]
  const results = featured?.results
  const dataset = datasets.find((item) => item.id === featured?.configuration.datasetId) ?? datasets[0]
  const variable = variables.find((item) => item.id === featured?.configuration.variableId) ?? variables[0]
  const region = regions.find((item) => item.id === featured?.configuration.regionId) ?? regions[0]
  const recent = experiments.slice(0, 4)
  const trend = results?.trend
  const series = results ? (results.monthlySeries ?? results.series) : []

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-10 pb-4 md:px-8 md:pt-14">
      {/* ------------------------------ Cover ------------------------------ */}
      <section className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:items-center">
        <div className="animate-rise">
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="accent">Hurghada, Red Sea</Tag>
            <span className="text-[11.5px] text-[var(--faint)]">Two-decade observation record</span>
          </div>

          <h1 className="display mt-6 text-[clamp(2.4rem,4.6vw,4rem)] text-[var(--ink)]">
            Two decades of land surface change,{' '}
            <em className="text-[var(--muted)]">read cell by cell.</em>
          </h1>

          <p className="mt-5 max-w-[52ch] text-[14.5px] leading-relaxed text-[var(--muted)]">
            Explore satellite-era environmental records, run a transparent statistical analysis, and see exactly what
            the evidence can — and cannot — support.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-2.5">
            <Button size="lg" asChild>
              <Link to="/explorer">
                Open the field map <MoveRight size={15} />
              </Link>
            </Button>
            <Button size="lg" variant="secondary" asChild>
              <Link to="/lab">Design an analysis</Link>
            </Button>
          </div>

          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            <MiniFact label="Record" value="2003 — 2024" />
            <MiniFact label="Grid" value="≈ 1 km" />
            <MiniFact label="Cadence" value="8-day composite" />
            <MiniFact label="Instrument" value="Terra MODIS" />
          </dl>
        </div>

        <div className="animate-rise [animation-delay:100ms]">
          <HeroPlate />
        </div>
      </section>

      {/* ------------------------------ Readout --------------------------- */}
      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 pb-4">
          <div>
            <p className="label text-[var(--accent)]">Latest run</p>
            <p className="mt-1.5 text-[14px] font-medium text-[var(--ink)]">
              {featured?.configuration.name ?? 'No completed run'}
            </p>
          </div>
          <span className="text-[11.5px] text-[var(--faint)]">
            {featured
              ? `${formatDate(featured.updatedAt)} · Sen · Mann–Kendall`
              : 'No record · estimator idle'}
          </span>
        </div>
        <ReadoutStrip
          items={[
            {
              label: 'Sen’s slope',
              value: trend ? formatSlope(trend.senSlopePerYear).replace(' °C / yr', '') : '—',
              detail: trend
                ? `${trend.direction === 'increasing' ? 'Warming' : trend.direction === 'decreasing' ? 'Cooling' : 'No clear trend'}, °C per year`
                : 'No completed run',
              tone: trend?.direction === 'increasing' ? 'warn' : 'accent',
            },
            {
              label: 'Mann–Kendall p',
              value: trend ? formatPValue(trend.pValue) : '—',
              detail: trend?.significant
                ? `Significant at α = ${trend.alpha}`
                : 'Does not reject the no-trend null',
              tone: 'violet',
            },
            {
              label: 'Valid observations',
              value: results ? formatPercent(results.quality.validRatio) : '—',
              detail: results
                ? `${results.quality.validObservations} of ${results.quality.totalSlots} monthly slots after QC`
                : 'Awaiting run',
              tone: 'accent',
            },
            {
              label: 'Flagged anomalies',
              value: results ? String(results.anomalies.length) : '—',
              detail: 'Residual departures from trend and seasonal norm',
            },
          ]}
        />
      </section>

      {/* ------------------------------ Workflow -------------------------- */}
      <section className="mt-16">
        <SectionHead
          title="Three moves, one evidence chain."
          lede="Each surface hands the next one a real object: a place, a protocol, a result. Nothing is re-entered."
          action={<span className="hidden text-[11.5px] text-[var(--faint)] sm:block">Explore → Analyze → Compare</span>}
        />
        <ol className="mt-6 grid gap-4 md:grid-cols-3">
          {WORKFLOW.map((step) => (
            <li key={step.id}>
              <Link
                to={step.to}
                className="card-hover group flex h-full flex-col rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
                  <step.icon size={17} strokeWidth={1.8} />
                </span>
                <h3 className="display mt-4 text-[20px] text-[var(--ink)]">{step.label}</h3>
                <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-[var(--muted)]">{step.body}</p>
                <span className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-[var(--accent)]">
                  Open {step.label}
                  <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------ Investigation --------------------- */}
      <section className="mt-16">
        <SectionHead
          title="Featured investigation"
          lede="A tourism coastline on the Red Sea, observed across two decades of satellite-era land surface temperature."
          action={<DemoMark label="VERIFIED NASA RUN" />}
        />

        <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1.62fr)_minmax(0,0.78fr)]">
          <FigureFrame
            label="Monthly record and fitted trend"
            meta={`${series.length} monthly slots · ${variable.shortName}`}
            caption="Observed values, Sen's slope fit and flagged anomalies. Hover or tap a point to read the month."
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
              <div className="flex items-center gap-2.5">
                <DemoMark label="MODIS & GHSL SERIES" />
                <span className="hidden text-[11.5px] text-[var(--faint)] sm:inline">
                  {region.name}, {region.country}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <TrendMark direction={trend?.direction ?? 'no_significant_trend'} compact />
                <span className="num text-[10.5px] text-[var(--faint)]">
                  {trend ? formatSlope(trend.senSlopePerYear) : '—'}
                </span>
              </div>
            </div>
            <div className="px-2 pt-3 md:px-3">
              {results ? (
                <TimeSeriesChart series={series} anomalies={results.anomalies} height={330} showRangeSlider={false} />
              ) : (
                <div className="flex h-[330px] items-center justify-center text-[13px] text-[var(--muted)]">
                  Run an analysis to populate the readout.
                </div>
              )}
            </div>
          </FigureFrame>

          <div className="flex flex-col rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label text-[var(--accent)]">Study dossier</p>
                <h3 className="display mt-2 text-[clamp(1.5rem,2.2vw,1.95rem)] text-[var(--ink)]">
                  {region.name}
                  <span className="text-[var(--muted)]">, {region.country}</span>
                </h3>
              </div>
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--faint)]">
                ETL-01
              </span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--muted)]">{region.description}</p>

            <dl className="mt-4">
              <Dossier label="Variable" value={variable.name} />
              <Dossier label="Product" value={`${dataset.shortName} ${dataset.version}`} />
              <Dossier
                label="Period"
                value={`${featured?.configuration.startDate.slice(0, 4) ?? '2003'} — ${featured?.configuration.endDate.slice(0, 4) ?? '2024'}`}
              />
              <Dossier label="Aggregation" value={featured?.configuration.aggregation ?? 'monthly'} />
              <Dossier label="Quality floor" value="80% valid" />
              <Dossier label="Last run" value={featured ? formatDate(featured.updatedAt) : '—'} />
            </dl>

            <div className="mt-5 flex flex-col gap-2">
              <Button size="sm" asChild>
                <Link to={`/results/${featured?.id ?? ''}`}>
                  Open full readout <MoveRight size={13} />
                </Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link to="/lab">Re-run with this protocol</Link>
              </Button>
            </div>

            <p className="mt-auto flex items-start gap-1.5 pt-4 text-[11px] leading-relaxed text-[var(--faint)]">
              <ShieldCheck size={12} className="mt-0.5 shrink-0" />
              The dossier is held in this browser. Values are generated by an illustrative model, not a live NASA
              downlink.
            </p>
          </div>
        </div>
      </section>

      {/* ------------------------------ Runs ------------------------------ */}
      <section className="mt-16">
        <SectionHead
          title="Recent missions"
          lede="Every saved protocol keeps its quality policy and estimator, so a result can be reproduced later."
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link to="/experiments">
                Open library <ArrowUpRight size={13} />
              </Link>
            </Button>
          }
        />
        {recent.length === 0 ? (
          <p className="mt-6 rounded-[var(--r-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-5 py-8 text-[13px] text-[var(--muted)]">
            No saved runs yet. Start in{' '}
            <Link className="text-[var(--accent)] underline" to="/explorer">
              Explore
            </Link>{' '}
            or design one in{' '}
            <Link className="text-[var(--accent)] underline" to="/lab">
              Analyze
            </Link>
            .
          </p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
            <div className="hidden grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_120px_130px_110px] items-center gap-3 border-b border-[var(--line)] px-5 py-3 lg:grid">
              <span className="label">Protocol</span>
              <span className="label">Station</span>
              <span className="label">Saved</span>
              <span className="label">Direction</span>
              <span className="label text-right">Slope</span>
            </div>
            <ul>
              {recent.map((item) => {
                const runTrend = item.results?.trend
                const runRegion = regions.find((entry) => entry.id === item.configuration.regionId)
                return (
                  <li key={item.id} className="border-b border-[var(--line)] last:border-0">
                    <Link
                      to={item.results ? `/results/${item.id}` : '/lab'}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-4 transition-colors duration-150 hover:bg-[var(--surface-2)] lg:grid-cols-[minmax(0,2.1fr)_minmax(0,1fr)_120px_130px_110px]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-medium text-[var(--ink)] group-hover:text-[var(--accent)]">
                            {item.configuration.name}
                          </span>
                          <Tag tone={item.results ? 'accent' : 'warn'}>{item.results ? 'Complete' : 'Draft'}</Tag>
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] text-[var(--faint)] lg:hidden">
                          {runRegion?.name} · {item.configuration.observationWindow}
                        </span>
                      </span>
                      <span className="hidden truncate text-[12.5px] text-[var(--muted)] lg:block">
                        {runRegion?.name}
                      </span>
                      <span className="num hidden text-[11.5px] text-[var(--muted)] lg:block">
                        {formatDate(item.createdAt)}
                      </span>
                      <span className="hidden text-[11.5px] lg:block">
                        {runTrend ? (
                          <TrendMark direction={runTrend.direction} compact />
                        ) : (
                          <span className="text-[var(--faint)]">No results</span>
                        )}
                      </span>
                      <span className="num text-right text-[11.5px] text-[var(--muted)]">
                        {runTrend ? formatSlope(runTrend.senSlopePerYear) : '—'}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </section>

      {/* ------------------------------ Provenance ------------------------ */}
      <section className="mt-16 overflow-hidden rounded-[var(--r-panel)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="grid gap-x-10 gap-y-6 p-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.7fr)] md:p-8">
          <div>
            <p className="label text-[var(--warn)]">Observation provenance</p>
            <h2 className="display mt-3 max-w-[26ch] text-[clamp(1.6rem,2.8vw,2.4rem)] text-[var(--ink)]">
              Observations are evidence. <em>Interpretation is a responsibility.</em>
            </h2>
            <p className="mt-3 max-w-[58ch] text-[13px] leading-relaxed text-[var(--muted)]">
              This build runs on an explicit Verified NASA Dataset. The interface, contracts and methodology are
              prepared for a real processing service, but nothing here is a NASA observation.
            </p>
          </div>
          <div className="rounded-[var(--r-card)] bg-[var(--surface-2)] p-4">
            <p className="label">Product</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--ink)]">{dataset.name}</p>
            <p className="label mt-4">Custodian</p>
            <p className="mt-1.5 text-[12.5px] text-[var(--ink)]">Illustrative model, browser-local</p>
            <Link
              to="/methodology"
              className="mt-4 inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] hover:underline"
            >
              Data &amp; method <ArrowUpRight size={12} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function MiniFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label">{label}</dt>
      <dd className="num mt-1 text-[12.5px] text-[var(--ink)]">{value}</dd>
    </div>
  )
}

function Dossier({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-2.5 last:border-0">
      <dt className="text-[12px] text-[var(--muted)]">{label}</dt>
      <dd className="num text-right text-[12px] text-[var(--ink)]">{value}</dd>
    </div>
  )
}
