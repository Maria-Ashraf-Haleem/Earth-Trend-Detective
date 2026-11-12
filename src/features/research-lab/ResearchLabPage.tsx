import type { ReactNode } from 'react'
import { Field, SelectField, TextInput } from '@/components/common/Field'
import { DataNote, PageHeader, KeyValue, Segmented, Tag } from '@/components/common/Primitives'
import { RunProgress } from '@/components/feedback/RunProgress'
import { Button } from '@/components/ui/button'
import { Hint } from '@/components/ui/tooltip'
import { ANOMALY_METHODS, TREND_METHODS } from '@/data/methods'
import { datasets, regions, variables } from '@/data/mock/catalog'
import { useLabStore } from '@/store/useLabStore'
import type { AnomalyMethodId, ExperimentConfiguration, QualityFilter, TrendMethodId } from '@/types'
// avoid-ai-design-ignore: I3 Check marks a completed wizard step
import { ArrowLeft, ArrowUpRight, Check, Info, Play, RotateCcw } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

const STEPS = [
  { id: 1, label: 'Data', detail: 'Place, period, variable' },
  { id: 2, label: 'Method', detail: 'Quality and statistics' },
  { id: 3, label: 'Review', detail: 'Confirm and run' },
]

const AGGREGATIONS: { value: ExperimentConfiguration['aggregation']; label: string; detail: string }[] = [
  { value: 'monthly', label: 'Monthly', detail: 'Preserve the seasonal cycle. Best for anomaly timing.' },
  { value: 'seasonal', label: 'Seasonal', detail: 'Aggregate into DJF, MAM, JJA and SON.' },
  { value: 'annual', label: 'Annual', detail: 'One value per year. Best for a clean trend line.' },
]

const QUALITY_OPTIONS: { value: QualityFilter; label: string; detail: string }[] = [
  { value: 'all', label: 'Keep all', detail: 'Retain every retrieved value. Maximum sample, more noise.' },
  { value: 'good', label: 'Good quality', detail: 'Exclude poor QC flags. Recommended default.' },
  { value: 'best', label: 'Best only', detail: 'Highest-quality bits. Smallest sample, strongest filter.' },
]

const MISSING_OPTIONS = [
  { value: 'pairwise', label: 'Pairwise deletion' },
  { value: 'interpolate', label: 'Linear interpolation' },
  { value: 'drop_month', label: 'Drop incomplete months' },
]

export function ResearchLabPage() {
  const draft = useLabStore((s) => s.draft)
  const setDraft = useLabStore((s) => s.setDraft)
  const resetDraft = useLabStore((s) => s.resetDraft)
  const runDraft = useLabStore((s) => s.runDraft)
  const experiments = useLabStore((s) => s.experiments)
  const activeId = useLabStore((s) => s.activeId)
  const setToast = useLabStore((s) => s.setToast)
  const active = experiments.find((item) => item.id === activeId)
  const [step, setStep] = useState(1)
  const [running, setRunning] = useState(false)
  const [progressConfig, setProgressConfig] = useState<ExperimentConfiguration | null>(null)
  const navigate = useNavigate()

  const region = regions.find((item) => item.id === draft.regionId) ?? regions[0]
  const variable = variables.find((item) => item.id === draft.variableId) ?? variables[0]
  const dataset = datasets.find((item) => item.id === draft.datasetId) ?? datasets[0]
  const startYear = Number(draft.startDate.slice(0, 4))
  const endYear = Number(draft.endDate.slice(0, 4))
  const invalidDates = !draft.startDate || !draft.endDate || draft.startDate > draft.endDate
  const validName = draft.name.trim().length > 2
  const validRatio = draft.minValidRatio >= 0.3 && draft.minValidRatio <= 0.98
  const hasTrend = draft.trendMethods.length > 0
  const dataValid = validName && !invalidDates
  const methodValid = validRatio && hasTrend
  const valid = dataValid && methodValid
  const estimatedSlots = invalidDates ? 0 : Math.max(0, (endYear - startYear + 1) * 12)
  const selectedQuality = QUALITY_OPTIONS.find((item) => item.value === draft.qualityFilter) ?? QUALITY_OPTIONS[1]

  const toggleTrend = (id: TrendMethodId) => {
    const has = draft.trendMethods.includes(id)
    setDraft({ trendMethods: has ? draft.trendMethods.filter((item) => item !== id) : [...draft.trendMethods, id] })
  }
  const toggleAnomaly = (id: AnomalyMethodId) => {
    const has = draft.anomalyMethods.includes(id)
    setDraft({ anomalyMethods: has ? draft.anomalyMethods.filter((item) => item !== id) : [...draft.anomalyMethods, id] })
  }

  const handleRun = async () => {
    if (!valid || running) {
      setToast('Complete the protocol before running')
      return
    }
    setProgressConfig(draft)
    setRunning(true)
    try {
      const id = await runDraft()
      await new Promise((resolve) => window.setTimeout(resolve, 520))
      navigate(`/results/${id}`)
    } catch {
      setRunning(false)
      setToast('The simulated run could not complete. Try again.')
    }
  }

  const goTo = (next: number) => {
    if (next > 1 && !dataValid) return
    if (next > 2 && !methodValid) return
    setStep(Math.max(1, Math.min(3, next)))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-12">
      <PageHeader
        eyebrow="Analyze"
        title={
          <>
            Design an <em className="text-[var(--accent)]">observation.</em>
          </>
        }
        lede="Three guided steps. Every choice writes to the same typed protocol object, and the run sheet stays visible so you always know what will execute."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/methodology">
                Method reference <ArrowUpRight size={13} />
              </Link>
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                resetDraft()
                setStep(1)
              }}
            >
              <RotateCcw size={13} /> Reset
            </Button>
          </>
        }
      />

      {/* Stepper */}
      <nav
        className="mt-8 grid gap-1 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[var(--shadow-card)] sm:grid-cols-3"
        aria-label="Analysis steps"
      >
        {STEPS.map((item) => {
          const active = step === item.id
          const done = item.id < step
          const reachable = item.id === 1 || (item.id === 2 && dataValid) || (item.id === 3 && methodValid)
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'step' : undefined}
              disabled={!reachable}
              onClick={() => goTo(item.id)}
              className={`group relative flex items-center gap-3 rounded-[var(--r-control)] px-3.5 py-3 text-left transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45 ${
                active
                  ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                  : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-semibold ${
                  done
                    ? 'bg-[var(--accent)] text-[var(--action-ink)]'
                    : active
                      ? 'bg-[var(--surface)] text-[var(--accent)] shadow-[0_1px_2px_rgba(16,24,40,0.1)]'
                      : 'bg-[var(--surface-2)] text-[var(--faint)]'
                }`}
              >
                {done ? <Check size={11} strokeWidth={3} /> : item.id}
              </span>
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium">{item.label}</span>
                <span className="mt-0.5 block truncate text-[10.5px] text-[var(--faint)]">{item.detail}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12">
        <div className="min-w-0">
          {step === 1 ? (
            <WizardPanel
              index="01"
              title="Where and when?"
              description="Choose the study extent, the physical variable and the observation window."
              aside={<Tag tone={dataValid ? 'ok' : 'warn'}>{dataValid ? 'Ready' : 'Needs attention'}</Tag>}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Experiment name" hint="A short, specific label. It appears in the library and exports.">
                  <TextInput
                    value={draft.name}
                    onChange={(event) => setDraft({ name: event.target.value })}
                    placeholder="Hurghada daytime LST 2003–2024"
                  />
                </Field>
                <Field label="Dataset" hint="This build supports the MOD11A2 case study. More products will arrive through the API catalog.">
                  <SelectField
                    value={draft.datasetId}
                    onChange={(value) => setDraft({ datasetId: value })}
                    options={datasets.map((item) => ({ value: item.id, label: `${item.shortName} ${item.version}` }))}
                  />
                </Field>
              </div>

              <div className="mt-5">
                <p className="kicker mb-2">Study area</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {regions.map((item) => {
                    const selected = draft.regionId === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDraft({ regionId: item.id })}
                        className={`rounded-[var(--r-control)] border p-3 text-left transition-colors ${
                          selected
                            ? 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--line)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span>
                            <span className="block text-[13px] font-medium">
                              {item.name}, {item.country}
                            </span>
                            <span className="mt-0.5 block text-[10px] text-[var(--faint)]">
                              {item.centroid[0].toFixed(2)}°N, {item.centroid[1].toFixed(2)}°E
                            </span>
                          </span>
                          <span
                            className={`mt-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border ${
                              selected ? 'border-[var(--accent)]' : 'border-[var(--line-strong)]'
                            }`}
                          >
                            {selected ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> : null}
                          </span>
                        </span>
                        <span className="mt-2 block text-[10.5px] leading-relaxed text-[var(--muted)]">
                          {item.description}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-2">
                <Field label="Environmental variable" hint="Daytime and nighttime LST are different physical measurements and should not be compared as interchangeable °C values.">
                  <SelectField
                    value={draft.variableId}
                    onChange={(value) => {
                      const next = variables.find((item) => item.id === value)
                      setDraft({ variableId: value, observationWindow: next?.observationWindow ?? 'daytime' })
                    }}
                    options={variables.map((item) => ({ value: item.id, label: item.name }))}
                  />
                </Field>
                <div className="rounded-[var(--r-control)] bg-[var(--surface-2)] p-3.5">
                  <p className="label">Product dossier</p>
                  <p className="mt-1 text-[12px] leading-snug text-[var(--ink)]">
                    {dataset.shortName} {dataset.version}, {dataset.provider}
                  </p>
                  <p className="mt-1 text-[10.5px] text-[var(--faint)]">
                    {dataset.temporalResolution}, {dataset.spatialResolution}, Terra
                  </p>
                </div>
              </div>

              <div className="mt-5 border-t border-[var(--line)] pt-4">
                <div className="flex items-center justify-between">
                  <p className="kicker">Study period</p>
                  <span className="text-[10.5px] text-[var(--faint)]">Available 2003 — 2024</span>
                </div>
                <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
                  <Field label="Start date">
                    <TextInput
                      type="date"
                      min="2003-01-01"
                      max="2024-12-31"
                      value={draft.startDate}
                      onChange={(event) => setDraft({ startDate: event.target.value })}
                    />
                  </Field>
                  <Field label="End date">
                    <TextInput
                      type="date"
                      min="2003-01-01"
                      max="2024-12-31"
                      value={draft.endDate}
                      onChange={(event) => setDraft({ endDate: event.target.value })}
                    />
                  </Field>
                  <div className="flex items-end gap-1.5 pb-0.5">
                    <button
                      type="button"
                      onClick={() => setDraft({ startDate: '2003-01-01', endDate: '2024-12-31' })}
                      className="h-[42px] rounded-[var(--r-control)] border border-[var(--line)] px-2.5 text-[10.5px] whitespace-nowrap text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      Full record
                    </button>
                    <button
                      type="button"
                      onClick={() => setDraft({ startDate: '2015-01-01', endDate: '2024-12-31' })}
                      className="h-[42px] rounded-[var(--r-control)] border border-[var(--line)] px-2.5 text-[10.5px] whitespace-nowrap text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      Last 10 yrs
                    </button>
                  </div>
                </div>
                {invalidDates ? (
                  <p className="mt-2 rounded-[var(--r-control)] border-l-2 border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-2 py-1 text-[10.5px] text-[var(--danger)]">
                    Enter a valid period. The start date must not follow the end date.
                  </p>
                ) : (
                  <div className="mt-3 flex items-center justify-between text-[10.5px] text-[var(--faint)]">
                    <span>
                      {startYear} — {endYear}
                    </span>
                    <span>≈ {estimatedSlots} monthly slots before QC</span>
                  </div>
                )}
              </div>
            </WizardPanel>
          ) : null}

          {step === 2 ? (
            <div className="space-y-5">
              <WizardPanel
                index="02"
                title="How should it be read?"
                description="Set the temporal support, quality policy and statistical tests."
              >
                <p className="kicker mb-2">Temporal aggregation</p>
                <div className="grid gap-2 md:grid-cols-3">
                  {AGGREGATIONS.map((option) => {
                    const selected = draft.aggregation === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDraft({ aggregation: option.value })}
                        className={`rounded-[var(--r-control)] border p-3 text-left transition-colors ${
                          selected
                            ? 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--line)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-[12px] font-medium">{option.label}</span>
                          {selected ? <Check size={13} className="text-[var(--accent)]" /> : null}
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-[var(--muted)]">{option.detail}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
                  <div>
                    <p className="text-[11px] font-medium">Observation window</p>
                    <p className="text-[10px] text-[var(--muted)]">Terra overpass: daytime or nighttime retrieval band.</p>
                  </div>
                  <Segmented
                    value={draft.observationWindow}
                    onChange={(value) =>
                      setDraft({
                        observationWindow: value,
                        variableId: value === 'nighttime' ? 'lst-night' : 'lst-day',
                      })
                    }
                    ariaLabel="Observation window"
                    options={[
                      { value: 'daytime', label: 'Daytime' },
                      { value: 'nighttime', label: 'Nighttime' },
                    ]}
                  />
                </div>
              </WizardPanel>

              <WizardPanel
                index="03"
                title="Quality control"
                description="Decide which retrievals are admissible. This choice changes the sample and can change the conclusion."
                aside={
                  <Hint content="Quality filtering is applied before aggregation. Rejected observations are excluded from trend tests but retained in the audit trail.">
                    <button type="button" aria-label="About quality control" className="text-[var(--faint)] transition-colors hover:text-[var(--ink)]">
                      <Info size={14} />
                    </button>
                  </Hint>
                }
              >
                <div className="grid gap-2 md:grid-cols-3">
                  {QUALITY_OPTIONS.map((option) => {
                    const selected = draft.qualityFilter === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setDraft({ qualityFilter: option.value })}
                        className={`rounded-[var(--r-control)] border p-3 text-left transition-colors ${
                          selected
                            ? 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[var(--accent-soft)]'
                            : 'border-[var(--line)] hover:bg-[var(--surface-2)]'
                        }`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="text-[12px] font-medium">{option.label}</span>
                          {selected ? <Check size={13} className="text-[var(--accent)]" /> : null}
                        </span>
                        <span className="mt-1 block text-[10px] leading-relaxed text-[var(--muted)]">{option.detail}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-4 grid gap-4 border-t border-[var(--line)] pt-4 md:grid-cols-2">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="kicker">Minimum valid ratio</p>
                      <span className="num text-[12px]">{(draft.minValidRatio * 100).toFixed(0)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.3}
                      max={0.98}
                      step={0.01}
                      value={draft.minValidRatio}
                      onChange={(event) => setDraft({ minValidRatio: Number(event.target.value) })}
                      className="mt-3 w-full"
                      aria-label="Minimum valid observation ratio"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-[var(--faint)]">
                      {/* avoid-ai-design-ignore: L4 range slider bound labels, not proof metrics */}
                      <span>30%</span>
                      <span>65%</span>
                      <span>98%</span>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
                      A month or season below this ratio is flagged in the quality report.
                    </p>
                  </div>
                  <Field label="Missing data handling" hint="Pairwise deletion is the most conservative default for trend tests. Interpolation should be disclosed in the methodology note.">
                    <SelectField
                      value={draft.missingDataHandling}
                      onChange={(value) => setDraft({ missingDataHandling: value as typeof draft.missingDataHandling })}
                      options={MISSING_OPTIONS}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex items-center justify-between rounded-[var(--r-control)] bg-[var(--surface-2)] px-3 py-2 text-[10.5px] text-[var(--muted)]">
                  <span>Selected policy</span>
                  <span>
                    {selectedQuality.label}, ≥ {(draft.minValidRatio * 100).toFixed(0)}% valid
                  </span>
                </div>
              </WizardPanel>

              <WizardPanel
                index="04"
                title="Trend analysis"
                description="Select at least one inferential method. Mann–Kendall and Sen’s slope are the primary pair."
              >
                <div className="grid gap-2 md:grid-cols-2">
                  {TREND_METHODS.map((method) => {
                    const selected = draft.trendMethods.includes(method.id)
                    return (
                      <MethodCard
                        key={method.id}
                        selected={selected}
                        onClick={() => toggleTrend(method.id)}
                        name={method.name}
                        short={method.short}
                        detail={method.detail}
                        badge={method.id === 'sens_slope' ? 'PRIMARY' : undefined}
                      />
                    )
                  })}
                </div>
                {!hasTrend ? (
                  <p className="mt-2 rounded-[var(--r-control)] border-l-2 border-[var(--danger)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] px-2 py-1 text-[10.5px] text-[var(--danger)]">
                    Select at least one trend method to run the analysis.
                  </p>
                ) : null}
              </WizardPanel>

              <WizardPanel
                index="05"
                title="Anomaly detection"
                description="Flag observations that depart from the fitted trend and seasonal expectation."
              >
                <div className="grid gap-2 md:grid-cols-2">
                  {ANOMALY_METHODS.map((method) => {
                    const selected = draft.anomalyMethods.includes(method.id)
                    const future = method.id === 'isolation_forest'
                    return (
                      <MethodCard
                        key={method.id}
                        selected={selected}
                        onClick={() => toggleAnomaly(method.id)}
                        name={method.name}
                        short={method.short}
                        detail={method.detail}
                        badge={future ? 'API ONLY' : 'DEMO'}
                        warn={future}
                      />
                    )
                  })}
                </div>
                <div className="mt-3">
                  <DataNote label="Demo behaviour">
                    {/* avoid-ai-design-ignore: CP2 (statistical term) */}
                    STL decomposition and robust Z-score are approximated in the browser. Isolation Forest is a
                    configuration option only; it is not executed until the FastAPI service is connected.
                  </DataNote>
                </div>
              </WizardPanel>
            </div>
          ) : null}

          {step === 3 ? (
            <WizardPanel
              index="06"
              title="Review the protocol."
              description="This is exactly what will run. Check the sample, the quality policy and the tests before committing."
              aside={<Tag tone={valid ? 'ok' : 'warn'}>{valid ? 'Ready to run' : 'Incomplete'}</Tag>}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <ReviewBlock label="Study" value={`${region.name}, ${region.country}`} detail={variable.name} />
                <ReviewBlock label="Period" value={`${startYear} — ${endYear}`} detail={`≈ ${estimatedSlots} monthly slots before QC`} />
                <ReviewBlock label="Product" value={`${dataset.shortName} ${dataset.version}`} detail={`${dataset.temporalResolution}, ${dataset.spatialResolution}`} />
                <ReviewBlock label="Aggregation" value={draft.aggregation} detail={`${draft.observationWindow} retrieval band`} />
                <ReviewBlock label="Quality policy" value={selectedQuality.label} detail={`Minimum ${(draft.minValidRatio * 100).toFixed(0)}% valid, ${MISSING_OPTIONS.find((item) => item.value === draft.missingDataHandling)?.label}`} />
                <ReviewBlock label="Evidence" value={`${draft.trendMethods.length} trend, ${draft.anomalyMethods.length} anomaly`} detail="Tests computed on valid observations only" />
              </div>

              <div className="mt-4 border-t border-[var(--line)] pt-4">
                <p className="kicker">Selected methods</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {[...draft.trendMethods, ...draft.anomalyMethods].length === 0 ? (
                    <span className="text-[11px] text-[var(--faint)]">None selected</span>
                  ) : (
                    [...draft.trendMethods, ...draft.anomalyMethods].map((id) => (
                      <span
                        key={id}
                        className="rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[10px] text-[var(--muted)]"
                      >
                        {[...TREND_METHODS, ...ANOMALY_METHODS].find((method) => method.id === id)?.name ?? id}
                      </span>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-4">
                <details className="overflow-hidden rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface-2)]">
                  <summary className="flex items-center justify-between px-3.5 py-2.5 text-[11.5px] font-medium text-[var(--muted)]">
                    Request payload <span className="text-[var(--accent)]">JSON</span>
                  </summary>
                  <pre className="max-h-60 overflow-auto border-t border-[var(--line)] p-3 text-[10.5px] leading-relaxed text-[var(--muted)]">
{JSON.stringify(draft, null, 2)}
                  </pre>
                </details>
              </div>

              <div className="mt-4">
                <DataNote label="Demo run">
                  Execution is simulated in the browser on an MODIS & GHSL SERIES. No satellite granule is downloaded or
                  processed.
                </DataNote>
              </div>

              <Button className="mt-4 w-full" size="lg" disabled={!valid || running} onClick={handleRun}>
                <Play size={15} />
                {running ? 'Running analysis…' : 'Run analysis'}
              </Button>
            </WizardPanel>
          ) : null}

          {/* Step navigation */}
          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => goTo(step - 1)} disabled={step === 1}>
              <ArrowLeft size={14} /> Back
            </Button>
            {step < 3 ? (
              <Button
                size="sm"
                onClick={() => goTo(step + 1)}
                disabled={(step === 1 && !dataValid) || (step === 2 && !methodValid)}
              >
                Continue
              </Button>
            ) : (
              <span className="label text-[var(--faint)]">
                Step 3 of 3
              </span>
            )}
          </div>
        </div>

        {/* Run sheet */}
        <aside className="h-fit lg:sticky lg:top-[calc(var(--shell-offset,64px)+20px)]">
          <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
              <div>
                <p className="text-[12.5px] font-medium text-[var(--ink)]">Run sheet</p>
                <p className="mt-1 text-[10px] font-medium tracking-[0.05em] uppercase text-[var(--faint)]">
                  Protocol · {valid ? 'Ready' : 'Incomplete'}
                </p>
              </div>
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  valid ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : 'bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-[var(--warn)]'
                }`}
              >
                <Check size={14} />
              </span>
            </div>

            <h2 className="display mt-4 text-[22px] text-[var(--ink)]">{draft.name.trim() || 'Untitled experiment'}</h2>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {region.name}, {region.country} · {variable.shortName}
            </p>

            <dl className="mt-4">
              <KeyValue label="Period" value={`${startYear}–${endYear}`} />
              <KeyValue label="Dataset" value={`${dataset.shortName} ${dataset.version}`} />
              <KeyValue label="Aggregation" value={draft.aggregation} />
              <KeyValue label="Quality" value={selectedQuality.label} />
              <KeyValue label="Min valid" value={`${(draft.minValidRatio * 100).toFixed(0)}%`} />
              <KeyValue label="Trend tests" value={`${draft.trendMethods.length} selected`} />
              <KeyValue label="Anomaly tests" value={`${draft.anomalyMethods.length} selected`} />
            </dl>

            <div className="mt-4 border-t border-[var(--line)] pt-3">
              <p className="label text-[var(--faint)]">Selected methods</p>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {[...draft.trendMethods, ...draft.anomalyMethods].length === 0 ? (
                  <span className="text-[10px] text-[var(--faint)]">None</span>
                ) : (
                  [...draft.trendMethods, ...draft.anomalyMethods].map((id) => (
                    <span
                      key={id}
                      className="rounded-full border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[10px] text-[var(--muted)]"
                    >
                      {[...TREND_METHODS, ...ANOMALY_METHODS].find((method) => method.id === id)?.name ?? id}
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="mt-4">
              <DataNote label="Demo run">
                Execution is simulated in the browser on an MODIS & GHSL SERIES. No satellite granule is downloaded or
                processed.
              </DataNote>
            </div>

            <Button className="mt-4 w-full" size="md" disabled={!valid || running} onClick={handleRun}>
              <Play size={14} />
              {running ? 'Running analysis…' : 'Run analysis'}
            </Button>
            {!valid ? (
              <p className="mt-2 text-center text-[9.5px] leading-relaxed text-[var(--warn)]">
                Complete the protocol: name, period and at least one trend method.
              </p>
            ) : (
              <p className="mt-2 text-center text-[10.5px] text-[var(--faint)]">
                ≈ {estimatedSlots} slots, {draft.trendMethods.length + draft.anomalyMethods.length} methods
              </p>
            )}
          </div>

          <div className="mt-4 rounded-[var(--r-card)] bg-[var(--accent-soft)] p-4">
            <p className="text-[11px] font-medium tracking-[0.06em] uppercase text-[var(--accent)]">Method note</p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--muted)]">
              Mann–Kendall tests monotonic association without assuming normality. Sen’s slope reports the median
              pairwise rate of change. Both are computed on valid observations only.
            </p>
          </div>
        </aside>
      </div>

      <RunProgress open={running} configuration={progressConfig} progressIndex={active?.progressIndex ?? -1} />
    </div>
  )
}

function WizardPanel({
  index,
  title,
  description,
  aside,
  children,
}: {
  index: string
  title: string
  description: string
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow-card)] md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-4">
          <span className="hidden h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] px-2 text-[10.5px] font-semibold text-[var(--accent)] sm:flex">
            {index}
          </span>
          <div>
            <h2 className="display text-[clamp(1.35rem,2.1vw,1.7rem)] text-[var(--ink)]">{title}</h2>
            <p className="mt-1.5 max-w-[68ch] text-[12px] leading-relaxed text-[var(--muted)]">{description}</p>
          </div>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
      <div className="mt-6">{children}</div>
    </section>
  )
}

function MethodCard({
  selected,
  onClick,
  name,
  short,
  detail,
  badge,
  warn = false,
}: {
  selected: boolean
  onClick: () => void
  name: string
  short: string
  detail: string
  badge?: string
  warn?: boolean
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`group rounded-[var(--r-control)] border p-3 text-left transition-colors ${
        selected
          ? 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] bg-[var(--accent-soft)]'
          : 'border-[var(--line)] hover:bg-[var(--surface-2)]'
      }`}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2">
          <span
            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
              selected
                ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--action-ink)]'
                : 'border-[var(--line-strong)]'
            }`}
          >
            {selected ? <Check size={10} strokeWidth={3} /> : null}
          </span>
          <span className="text-[12px] font-medium">{name}</span>
        </span>
        {badge ? <Tag tone={warn ? 'warn' : 'neutral'}>{badge}</Tag> : null}
      </span>
      <span className="mt-1.5 block text-[10.5px] leading-relaxed text-[var(--muted)]">{short}</span>
      <span className="mt-1 block text-[9.5px] leading-relaxed text-[var(--faint)]">{detail}</span>
    </button>
  )
}

function ReviewBlock({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-[var(--r-control)] bg-[var(--surface-2)] p-3">
      <p className="label">{label}</p>
      <p className="num mt-1.5 text-[15px] leading-tight text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--muted)]">{detail}</p>
    </div>
  )
}
