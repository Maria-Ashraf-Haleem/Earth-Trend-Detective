import { MultiSeriesChart } from '@/components/charts/MultiSeriesChart'
import { Sparkline } from '@/components/charts/Sparkline'
import { EmptyState } from '@/components/common/EmptyState'
import { DemoMark } from '@/components/common/Field'
import { PageHeader, ReadoutStrip, SectionHead, Segmented, Tag, TrendMark } from '@/components/common/Primitives'
import { Button } from '@/components/ui/button'
import { datasets, regions, variables } from '@/data/mock/catalog'
import { useLabStore } from '@/store/useLabStore'
import { formatNumber, formatPValue, formatPercent, formatSlope } from '@/utils/format'
// avoid-ai-design-ignore: I3 Check and X report comparison outcomes
import { ArrowUpRight, Check, FlaskConical, GitCompare, Info, MoveRight, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function ComparePage() {
  const experiments = useLabStore((s) => s.experiments)
  const compareIds = useLabStore((s) => s.compareIds)
  const toggleCompare = useLabStore((s) => s.toggleCompare)
  const setCompareIds = useLabStore((s) => s.setCompareIds)
  const completed = experiments.filter((item) => item.results)
  const selected = completed.filter((item) => compareIds.includes(item.id))
  const [normalize, setNormalize] = useState(false)

  const windows = useMemo(() => new Set(selected.map((item) => item.configuration.observationWindow)), [selected])
  const regionSet = useMemo(() => new Set(selected.map((item) => item.configuration.regionId)), [selected])
  const aggSet = useMemo(() => new Set(selected.map((item) => item.configuration.aggregation)), [selected])
  const periods = useMemo(
    () => new Set(selected.map((item) => `${item.configuration.startDate}:${item.configuration.endDate}`)),
    [selected],
  )

  useEffect(() => {
    setNormalize(windows.size > 1)
  }, [windows])

  const warnings = useMemo(() => {
    if (selected.length < 2) return []
    const list: { tone: 'warn' | 'info'; text: string }[] = []
    if (windows.size > 1) {
      list.push({
        tone: 'warn',
        text: 'Daytime and nighttime LST are different physical quantities. Raw °C levels are not interchangeable; the chart defaults to mean-centred comparison so direction and shape can be read without implying equivalence.',
      })
    }
    if (regionSet.size > 1) {
      list.push({
        tone: 'warn',
        text: 'These runs cover different study extents. Slopes describe separate places; they are not replicates of one regional trend.',
      })
    }
    if (aggSet.size > 1) {
      list.push({
        tone: 'info',
        text: 'Aggregation differs between runs. The stored monthly series is used for the chart; summary statistics were computed on each run’s configured aggregation support.',
      })
    }
    if (periods.size > 1) {
      list.push({
        tone: 'info',
        text: 'Study periods differ. Sen’s slope is a rate per year, but sample length and anomaly timing affect significance and confidence.',
      })
    }
    if (selected.length > 4) {
      list.push({ tone: 'warn', text: 'More than four overlaid series becomes hard to read. Consider narrowing the comparison set.' })
    }
    return list
  }, [selected.length, windows.size, regionSet.size, aggSet.size, periods.size])

  const slopes = selected.map((item) => item.results!.trend.senSlopePerYear)
  const pValues = selected.map((item) => item.results!.trend.pValue)
  const validRatios = selected.map((item) => item.results!.quality.validRatio)
  const slopeSpread = slopes.length ? Math.max(...slopes) - Math.min(...slopes) : 0
  const normalizeActive = normalize && windows.size > 1 ? true : normalize

  if (completed.length < 2) {
    return (
      <div className="px-4 py-12 md:px-7">
        <EmptyState
          eyebrow="Compare"
          title="Need at least two completed runs"
          body="Run a daytime and nighttime study, or shorten the period, then return here. Draft protocols cannot be compared until they have results."
          action={
            <Button asChild>
              <Link to="/lab">Open Analyze</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1560px] px-4 py-8 md:px-7 md:py-10 lg:px-10">
      <PageHeader
        eyebrow="06 / Compare"
        title={
          <>
            Read the <em className="text-[var(--accent)]">difference.</em>
          </>
        }
        lede="Put protocols side by side to see what the configuration changes. Incompatible measurements stay visible — and clearly marked — rather than being silently merged into one answer."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCompareIds([])}>
              <X size={13} /> Clear selection
            </Button>
            <Button size="sm" asChild>
              <Link to="/lab">
                <FlaskConical size={13} /> New analysis
              </Link>
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DemoMark />
            <Tag tone={windows.size > 1 ? 'warn' : 'neutral'}>
              {windows.size > 1 ? 'Mixed measurement' : 'Compatible pair'}
            </Tag>
            <Tag tone="accent">{selected.length} staged</Tag>
          </div>
        }
      />

      {/* Selection rail */}
      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="kicker">
            Select runs — {selected.length} of {completed.length} staged
          </p>
          <p className="font-mono text-[9px] text-[var(--faint)]">Choose 2 or more</p>
        </div>
        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {completed.map((item) => {
            const active = compareIds.includes(item.id)
            const trend = item.results!.trend
            const region = regions.find((entry) => entry.id === item.configuration.regionId)
            const variable = variables.find((entry) => entry.id === item.configuration.variableId)
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCompare(item.id)}
                className={`group border p-3.5 text-left transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                    : 'border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]'
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium">{item.configuration.name}</span>
                    <span className="label mt-1 block tracking-wide text-[var(--faint)]">
                      {region?.name}, {variable?.shortName}, {item.configuration.startDate.slice(0, 4)}–
                      {item.configuration.endDate.slice(0, 4)}
                    </span>
                  </span>
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-inner)] border ${
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--action-ink)]'
                        : 'border-[var(--line-strong)]'
                    }`}
                  >
                    {active ? <Check size={11} strokeWidth={3} /> : null}
                  </span>
                </span>
                <span className="mt-3 flex items-end justify-between gap-2 border-t border-[var(--line)] pt-2.5">
                  <span>
                    <TrendMark direction={trend.direction} compact />
                    <span className="num mt-1 block text-[10px] text-[var(--muted)]">{formatSlope(trend.senSlopePerYear)}</span>
                  </span>
                  <Sparkline
                    series={item.results!.monthlySeries ?? item.results!.series}
                    width={92}
                    height={26}
                    fill={false}
                    className="h-[26px] w-[92px] opacity-70"
                  />
                </span>
              </button>
            )
          })}
        </div>
      </section>

      {selected.length < 2 ? (
        <section className="mt-6">
          <div className="border-y border-[var(--line-strong)] bg-[var(--surface)] p-8 md:p-12">
            <div className="relative grid gap-6 md:grid-cols-[1fr_auto_1fr] md:items-center">
              <Placeholder title="Run A" body="Choose a completed experiment from the rail above." />
              <div className="flex items-center justify-center">
                <span className="flex h-11 w-11 items-center justify-center border border-[var(--line-strong)] text-[var(--faint)]">
                  <GitCompare size={17} />
                </span>
              </div>
              <Placeholder title="Run B" body="Add at least one more run to open the comparison matrix." />
            </div>
          </div>
        </section>
      ) : (
        <>
          {/* Overview strip */}
          <section className="mt-6">
            <ReadoutStrip
              columns={3}
              items={[
                {
                  label: 'Slope spread',
                  value: (
                    <>
                      {formatNumber(slopeSpread, 3)}{' '}
                      <span className="text-[10px] text-[var(--faint)]">°C/yr</span>
                    </>
                  ),
                  detail: 'Difference between the largest and smallest central estimates.',
                  tone: 'warn',
                },
                {
                  label: 'p-value range',
                  value: (
                    <>
                      {formatPValue(Math.min(...pValues))} <span className="text-[10px] text-[var(--faint)]">→</span>{' '}
                      {formatPValue(Math.max(...pValues))}
                    </>
                  ),
                  detail: 'Evidence strength differs; do not compare p-values as effect sizes.',
                  tone: 'violet',
                },
                {
                  label: 'Quality range',
                  value: (
                    <>
                      {formatPercent(Math.min(...validRatios))}{' '}
                      <span className="text-[10px] text-[var(--faint)]">→</span>{' '}
                      {formatPercent(Math.max(...validRatios))}
                    </>
                  ),
                  detail: 'Retained sample varies with protocol and period.',
                },
              ]}
            />
          </section>

          {/* Compatibility */}
          <section className="mt-4 space-y-2">
            {warnings.length === 0 ? (
              <div className="flex items-start gap-3 rounded-[var(--r-control)] border border-[color-mix(in_srgb,var(--ok)_30%,var(--line))] bg-[color-mix(in_srgb,var(--ok)_6%,transparent)] px-4 py-3">
                <Info size={14} className="mt-0.5 shrink-0 text-[var(--ok)]" />
                <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                  These runs share compatible measurement dimensions. Slopes are still illustrative estimates; compare
                  them as quantities, not as published findings.
                </p>
              </div>
            ) : (
              warnings.map((warning) => (
                <div
                  key={warning.text}
                  className={`flex items-start gap-3 rounded-[var(--r-control)] border px-4 py-3 ${
                    warning.tone === 'warn'
                      ? 'border-[color-mix(in_srgb,var(--warn)_30%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_6%,transparent)]'
                      : 'border-[var(--line)] bg-[var(--surface-2)]'
                  }`}
                >
                  <Info
                    size={14}
                    className={`mt-0.5 shrink-0 ${warning.tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--faint)]'}`}
                  />
                  <p className="text-[11px] leading-relaxed text-[var(--muted)]">{warning.text}</p>
                </div>
              ))
            )}
          </section>

          {/* Comparison matrix */}
          <section className="mt-8">
            <SectionHead title="Comparison matrix" lede="Protocol versus result, field by field." />
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[8.5px] tracking-[0.12em] uppercase text-[var(--faint)] lg:hidden">
              Scroll the matrix horizontally <MoveRight size={11} />
            </p>
            <div className="mt-4 overflow-x-auto border-y border-[var(--line-strong)]">
              <table className="w-full min-w-[760px] border-collapse text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-[var(--line-strong)]">
                    <th className="label sticky left-0 z-10 w-[150px] bg-[var(--surface)] py-3 pr-4 pl-4 text-[var(--faint)]">
                      Field
                    </th>
                    {selected.map((item) => (
                      <th key={item.id} className="min-w-[190px] border-l border-[var(--line)] py-3 pr-4 pl-4 align-bottom">
                        <span className="block text-[11.5px] leading-snug font-medium">{item.configuration.name}</span>
                        <Link
                          to={`/results/${item.id}`}
                          className="label mt-1 inline-flex min-h-6 items-center gap-1 text-[var(--accent)] hover:underline"
                        >
                          Open readout <ArrowUpRight size={9} />
                        </Link>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <CompareRow label="Variable" values={selected.map((item) => variables.find((entry) => entry.id === item.configuration.variableId)?.shortName ?? '—')} />
                  <CompareRow label="Region" values={selected.map((item) => regions.find((entry) => entry.id === item.configuration.regionId)?.name ?? '—')} />
                  <CompareRow label="Period" values={selected.map((item) => `${item.configuration.startDate.slice(0, 4)}–${item.configuration.endDate.slice(0, 4)}`)} />
                  <CompareRow label="Aggregation" values={selected.map((item) => item.configuration.aggregation)} />
                  <CompareRow label="Dataset" values={selected.map((item) => datasets.find((entry) => entry.id === item.configuration.datasetId)?.shortName ?? '—')} />
                  <CompareRow
                    label="Trend direction"
                    values={selected.map((item) => <TrendMark key={item.id} direction={item.results!.trend.direction} compact />)}
                  />
                  <CompareRow label="Sen’s slope" values={selected.map((item) => <span key={item.id} className="num">{formatSlope(item.results!.trend.senSlopePerYear)}</span>)} />
                  <CompareRow label="p-value" values={selected.map((item) => <span key={item.id} className="num">{formatPValue(item.results!.trend.pValue)}</span>)} />
                  <CompareRow
                    label="95% interval"
                    values={selected.map((item) => (
                      <span key={item.id} className="num">
                        {formatNumber(item.results!.trend.confidenceInterval[0], 3)} –{' '}
                        {formatNumber(item.results!.trend.confidenceInterval[1], 3)}
                      </span>
                    ))}
                  />
                  <CompareRow
                    label="Seasonal MK p"
                    values={selected.map((item) => (
                      <span key={item.id} className="num">
                        {item.results!.trend.seasonalMannKendallP === null ? 'n/a' : formatPValue(item.results!.trend.seasonalMannKendallP)}
                      </span>
                    ))}
                  />
                  <CompareRow label="Valid ratio" values={selected.map((item) => <span key={item.id} className="num">{formatPercent(item.results!.quality.validRatio)}</span>)} />
                  <CompareRow label="Anomalies" values={selected.map((item) => <span key={item.id} className="num">{item.results!.anomalies.length}</span>)} />
                  <CompareRow label="QC policy" values={selected.map((item) => item.configuration.qualityFilter)} />
                </tbody>
              </table>
            </div>
          </section>

          {/* Synchronized chart */}
          <section className="mt-8">
            <SectionHead
              title="Synchronized series"
              lede={`Observed series on a shared axis; dotted lines show each fitted trend. ${
                normalize ? 'Levels are mean-centred.' : 'Raw levels are shown.'
              }`}
              action={
                <Segmented
                  value={normalize ? 'centered' : 'raw'}
                  onChange={(value) => setNormalize(value === 'centered')}
                  ariaLabel="Comparison chart scale"
                  options={[
                    { value: 'raw', label: 'Raw °C' },
                    { value: 'centered', label: 'Mean-centred' },
                  ]}
                />
              }
            />
            <div className="mt-4 overflow-hidden border border-[var(--line-strong)] bg-[var(--surface)]">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
                <DemoMark label="Illustrative comparison" />
                <span className="text-[10px] font-medium text-[var(--faint)]">{selected.length} series, monthly support</span>
              </div>
              <div className="px-2 pt-3 md:px-3">
                <MultiSeriesChart experiments={selected} normalize={normalizeActive} height={420} />
              </div>
            </div>
          </section>

          {/* Interpretation */}
          <section className="mt-8">
            <SectionHead title="What the difference means" lede="Three reads to keep separate when comparing protocols." />
            <div className="mt-4 grid border-t border-[var(--line-strong)] md:grid-cols-3">
              {[
                {
                  title: 'Change the variable',
                  body: 'Daytime and nighttime LST respond to different energy-balance processes. A slope difference cannot be attributed to one factor without a matched protocol.',
                },
                {
                  title: 'Change the period',
                  body: 'Shortening the record removes early years and changes the sample. Compare slopes as rates, then check whether significance survives.',
                },
                {
                  title: 'Change the region',
                  body: 'Hurghada and Safaga are separate coastal extents. Local slope differences describe different places, not a single regional gradient.',
                },
              ].map((item, index) => (
                <article
                  key={item.title}
                  className={`py-4 md:px-5 ${index > 0 ? 'border-t border-[var(--line)] md:border-t-0 md:border-l' : 'md:pl-0'}`}
                >
                  <span className="font-mono text-[9px] tracking-[0.12em] text-[var(--violet)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <h3 className="display mt-2 text-[19px] leading-tight">{item.title}</h3>
                  <p className="mt-1.5 text-[10.5px] leading-relaxed text-[var(--muted)]">{item.body}</p>
                </article>
              ))}
            </div>
          </section>
        </>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line-strong)] pt-4">
        <p className="label text-[var(--faint)]">All values illustrative, not NASA findings</p>
        <Button variant="secondary" size="sm" asChild>
          <Link to="/experiments">Back to library</Link>
        </Button>
      </div>
    </div>
  )
}

function CompareRow({ label, values }: { label: string; values: ReactNode[] }) {
  return (
    <tr className="border-b border-[var(--line)] last:border-0 hover:bg-[var(--surface-2)]">
      <th className="sticky left-0 z-10 bg-[var(--surface)] py-2.5 pr-4 pl-4 text-left font-normal text-[var(--muted)]">{label}</th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className="border-l border-[var(--line)] py-2.5 pr-4 pl-4 text-[var(--ink)]">
          {value}
        </td>
      ))}
    </tr>
  )
}

function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[var(--r-control)] border border-dashed border-[var(--line-strong)] p-6 text-center">
      <p className="label text-[var(--faint)]">{title}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">{body}</p>
    </div>
  )
}
