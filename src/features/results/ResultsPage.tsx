import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { MapLegend, StudyMap } from '@/components/maps/StudyMap'
import { DemoMark } from '@/components/common/Field'
import { EmptyState } from '@/components/common/EmptyState'
import { DataNote, KeyValue, Meter, PageHeader, SectionHead, Segmented, Tag, TrendMark } from '@/components/common/Primitives'
import { Button } from '@/components/ui/button'
import { datasets, regions, variables } from '@/data/mock/catalog'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { dataColor } from '@/utils/color'
import { exportExperimentCsv, exportExperimentJson } from '@/utils/export'
import { formatDate, formatNumber, formatPValue, formatPercent, formatSlope, trendLabel } from '@/utils/format'
import { aggregateSeries } from '@/utils/stats'
import {
  AlertTriangle,
  ArrowUpRight,
  Bookmark,
  Check,
  Clipboard,
  Download,
  FileJson,
  Info,
  MessageSquare,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Anomaly, SpatialCell, TemporalAggregation } from '@/types'

const SECTIONS = [
  { id: 'finding', label: 'Finding' },
  { id: 'series', label: 'Series' },
  { id: 'spatial', label: 'Spatial' },
  { id: 'statistics', label: 'Statistics' },
  { id: 'anomalies', label: 'Anomalies' },
  { id: 'quality', label: 'Quality' },
  { id: 'limits', label: 'Limits' },
]

const CARD = 'rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]'

export function ResultsPage() {
  const { experimentId } = useParams()
  const experiments = useLabStore((s) => s.experiments)
  const activeId = useLabStore((s) => s.activeId)
  const openExperiment = useLabStore((s) => s.openExperiment)
  const saveActive = useLabStore((s) => s.saveActive)
  const setSelectedAnomaly = useLabStore((s) => s.setSelectedAnomaly)
  const selectedAnomalyId = useLabStore((s) => s.selectedAnomalyId)
  const mapLayer = useLabStore((s) => s.mapLayer)
  const setMapLayer = useLabStore((s) => s.setMapLayer)
  const setToast = useLabStore((s) => s.setToast)
  const theme = useAppStore((s) => s.theme)
  const navigate = useNavigate()
  const [agg, setAgg] = useState<TemporalAggregation>('monthly')
  const [selectedCell, setSelectedCell] = useState<string | null>(null)

  const experiment = experiments.find((item) => item.id === (experimentId ?? activeId))
  const results = experiment?.results
  const region = regions.find((item) => item.id === experiment?.configuration.regionId)
  const variable = variables.find((item) => item.id === experiment?.configuration.variableId)
  const dataset = datasets.find((item) => item.id === experiment?.configuration.datasetId)
  const layer = results?.spatial.find((item) => item.kind === mapLayer) ?? results?.spatial[0]
  const cell = layer?.cells.find((item) => item.id === selectedCell)

  useEffect(() => {
    if (experiment && activeId !== experiment.id) openExperiment(experiment.id)
  }, [experiment, activeId, openExperiment])

  useEffect(() => {
    setAgg('monthly')
    setSelectedCell(null)
  }, [experiment?.id])

  const series = useMemo(() => {
    if (!results) return []
    return aggregateSeries(results.monthlySeries ?? results.series, agg)
  }, [results, agg])

  if (!experiment || !results || !region || !variable) {
    return (
      <div className="mx-auto max-w-[1480px] px-4 py-12 md:px-8">
        <EmptyState
          eyebrow="Analysis workspace"
          title="No report selected"
          body="Run an analysis in the Analyze workspace to populate a readout. Nothing on this screen is a scientific result until the analysis has completed."
          action={
            <Button asChild>
              <Link to="/lab">Open Analyze</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const { trend, quality, anomalies } = results
  const selectedAnomaly = anomalies.find((item) => item.id === selectedAnomalyId)
  const startYear = experiment.configuration.startDate.slice(0, 4)
  const endYear = experiment.configuration.endDate.slice(0, 4)
  const studyYears = Math.max(1, Number(endYear) - Number(startYear) + 1)
  const totalChange = trend.senSlopePerYear * studyYears
  const headline =
    trend.direction === 'increasing'
      ? 'The surface is warming.'
      : trend.direction === 'decreasing'
        ? 'The surface is cooling.'
        : 'No clear monotonic change.'
  const missingRatio = quality.totalSlots ? quality.missingValues / quality.totalSlots : 0
  const rejectedRatio = quality.totalSlots ? quality.rejectedObservations / quality.totalSlots : 0
  const significantCells = layer ? layer.cells.filter((item) => item.pValue < 0.05).length : 0
  const hottest = layer ? [...layer.cells].sort((a, b) => b.meanValue - a.meanValue)[0] : undefined
  const steepest = layer ? [...layer.cells].sort((a, b) => b.slopePerYear - a.slopePerYear)[0] : undefined
  const evidence = [
    {
      ok: trend.significant,
      label: 'Monotonic association',
      note: `Mann–Kendall p ${formatPValue(trend.pValue)} ${trend.significant ? 'rejects' : 'does not reject'} the no-trend null at α = ${trend.alpha}.`,
    },
    {
      ok: Math.sign(trend.senSlopePerYear) === Math.sign(trend.linearSlopePerYear),
      label: 'Direction stability',
      note: 'Sen’s robust slope and the OLS comparison point the same way.',
    },
    {
      ok: trend.seasonalMannKendallP !== null && trend.seasonalMannKendallP < trend.alpha,
      label: 'Seasonal agreement',
      note: 'Month-wise Mann–Kendall is used as a supporting, not conclusive, check.',
    },
    {
      ok: quality.validRatio >= 0.7,
      label: 'Sample adequacy',
      note: `${formatPercent(quality.validRatio)} of slots pass the configured quality policy.`,
    },
  ]

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setToast('Report link copied')
    } catch {
      setToast('Clipboard unavailable in this browser')
    }
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-12">
      <PageHeader
        eyebrow="Results"
        title={experiment.configuration.name}
        lede={
          <>
            {region.name}, {region.country}. {variable.name}. {experiment.configuration.startDate} to{' '}
            {experiment.configuration.endDate}. {dataset?.shortName} {dataset?.version}
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="icon" onClick={copyLink} aria-label="Copy report link">
              <Clipboard size={15} />
            </Button>
            <Button variant="secondary" size="sm" onClick={() => saveActive()}>
              <Bookmark size={13} /> Save
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                exportExperimentCsv(experiment)
                setToast('CSV export prepared, Verified NASA Data')
              }}
            >
              <Download size={13} /> CSV
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                exportExperimentJson(experiment)
                setToast('JSON export prepared, Verified NASA Data')
              }}
            >
              <FileJson size={13} /> JSON
            </Button>
            <Button size="sm" onClick={() => navigate('/insights')}>
              <MessageSquare size={13} /> Interpret
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DemoMark />
            <Tag tone={trend.significant ? 'warn' : 'neutral'}>
              {trend.significant ? 'Significant result' : 'Inconclusive'}
            </Tag>
            <Tag tone="accent">{region.name}</Tag>
            <Tag tone="neutral">{variable.shortName}</Tag>
            <Tag tone="neutral">
              {startYear} — {endYear}
            </Tag>
            <span className="ml-auto hidden text-[11px] text-[var(--faint)] md:block">
              Report ID · {experiment.id.slice(-12).toUpperCase()}
            </span>
          </div>
        }
      />

      {/* Sticky section nav */}
      <nav
        className="sticky top-[var(--shell-offset,64px)] z-20 mt-7 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] px-1.5 py-1.5 shadow-[var(--shadow-card)] backdrop-blur"
        aria-label="Report sections"
      >
        <div className="no-scrollbar flex items-center gap-0.5 overflow-x-auto">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="group flex h-8 shrink-0 items-center rounded-full px-3 text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
            >
              {section.label}
            </a>
          ))}
          <Link
            to="/lab"
            className="ml-auto hidden h-8 shrink-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3 text-[12px] font-medium text-[var(--accent)] sm:flex"
          >
            New analysis
          </Link>
        </div>
      </nav>

      {/* Main finding */}
      <section id="finding" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-10">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
          <div className={`${CARD} p-6 md:p-7`}>
            <p className="flex items-center gap-2 text-[10.5px] font-medium tracking-[0.07em] uppercase text-[var(--accent)]">
              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
              Main finding
            </p>
            <h2 className="display mt-3 max-w-[20ch] text-[clamp(1.8rem,3.4vw,2.9rem)] text-[var(--ink)]">
              {headline}
            </h2>
            <p className="mt-4 max-w-[66ch] text-[13.5px] leading-relaxed text-[var(--muted)]">
              Sen’s slope on the illustrative {variable.shortName} series is{' '}
              <span className="num text-[var(--ink)]">{formatSlope(trend.senSlopePerYear)}</span>, with a Mann–Kendall
              p-value of <span className="num text-[var(--ink)]">{formatPValue(trend.pValue)}</span>.{' '}
              {trend.significant
                ? `The test rejects a no-trend null at α = ${trend.alpha}. Compounded across the study window, the central estimate implies roughly ${formatNumber(Math.abs(totalChange), 1)} °C of ${totalChange >= 0 ? 'warming' : 'cooling'}.`
                : 'The evidence does not support a confident directional claim for this sample.'}{' '}
              This is a frontend demonstration on designed data, not a NASA finding.
            </p>

            <div className="mt-6 grid gap-x-6 gap-y-4 border-t border-[var(--line)] pt-5 sm:grid-cols-3">
              <FindingMetric
                label="95% interval"
                value={`${formatNumber(trend.confidenceInterval[0], 3)} – ${formatNumber(trend.confidenceInterval[1], 3)}`}
                note="Approximate interval around the illustrative slope, in °C per year."
              />
              <FindingMetric
                label="Significance"
                value={trend.significant ? `Yes, α ${trend.alpha}` : `No, α ${trend.alpha}`}
                note="Direction and p-value are read together; significance is not a badge."
              />
              <FindingMetric
                label="Direction"
                value={trendLabel(trend.direction)}
                note="Stated in words and shape, never by colour alone."
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-4">
              <TrendMark direction={trend.direction} />
              <span className="h-3 w-px bg-[var(--line)]" />
              <span className="num text-[11.5px] text-[var(--muted)]">{trend.observationCount} observations</span>
              <span className="num text-[11.5px] text-[var(--muted)]">{anomalies.length} anomalies</span>
            </div>
          </div>

          <div className={`${CARD} flex flex-col justify-between p-5`}>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-[12.5px] font-medium text-[var(--ink)]">Sample integrity</p>
                <Tag tone="warn">Illustrative</Tag>
              </div>
              <p className="num mt-4 text-[24px] leading-none text-[var(--ink)]">{formatPercent(quality.validRatio)}</p>
              <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">valid slots retained</p>
              <Meter value={quality.validRatio} className="mt-4" />
              <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
                <span className="h-full" style={{ width: `${quality.validRatio * 100}%`, background: 'var(--accent)' }} />
                <span className="h-full opacity-70" style={{ width: `${rejectedRatio * 100}%`, background: 'var(--oxide)' }} />
                <span className="h-full" style={{ width: `${missingRatio * 100}%`, background: 'var(--line-strong)' }} />
              </div>
            </div>
            <dl className="mt-5">
              <KeyValue label="Mann–Kendall Z" value={formatNumber(trend.mannKendallZ, 2)} />
              <KeyValue label="Valid slots" value={`${quality.validObservations} / ${quality.totalSlots}`} />
              <KeyValue label="Generated" value={formatDate(results.generatedAt)} />
              <KeyValue label="QC policy" value={quality.qcMethod} />
            </dl>
            <a href="#quality" className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-medium text-[var(--accent)] hover:underline">
              Audit the sample
            </a>
          </div>
        </div>
      </section>

      {/* Time series */}
      <section id="series" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-12">
        <SectionHead
          title="The record over time."
          lede="Observed values, fitted trend and anomaly flags. Hover for exact values, drag to zoom, or use the range slider. The seasonal norm is available in the legend."
          action={
            <Segmented
              value={agg}
              onChange={setAgg}
              ariaLabel="Aggregate the time series"
              options={[
                { value: 'monthly', label: 'Monthly' },
                { value: 'seasonal', label: 'Seasonal' },
                { value: 'annual', label: 'Annual' },
              ]}
            />
          }
        />

        <div className={`${CARD} mt-5 overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <DemoMark label="MODIS & GHSL SERIES" />
              <span className="text-[11px] text-[var(--faint)]">
                {series.length} {agg} slots · {anomalies.length} anomalies
              </span>
            </div>
            <span className="text-[10.5px] font-medium tracking-[0.05em] uppercase text-[var(--faint)]">Interactive</span>
          </div>
          <div className="px-2 pt-3 md:px-3">
            <TimeSeriesChart
              series={series}
              anomalies={anomalies}
              selectedAnomalyId={selectedAnomalyId}
              onSelectAnomaly={setSelectedAnomaly}
              height={420}
              showRangeSlider
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-5 py-3">
            <p className="text-[10.5px] leading-relaxed text-[var(--faint)]">
              Aggregation is re-applied to the stored monthly series. Trend statistics above are computed on the monthly
              valid observations, not on the displayed aggregate.
            </p>
            {selectedAnomaly ? (
              <button
                type="button"
                onClick={() => setSelectedAnomaly(null)}
                className="text-[11px] font-medium text-[var(--accent)] hover:underline"
              >
                Clear marker
              </button>
            ) : null}
          </div>
        </div>
      </section>

      {/* Spatial */}
      <section id="spatial" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-12">
        <SectionHead
          title="Where the signal concentrates."
          lede={`A designed ${layer?.cells.length ?? 0}-cell field over the study extent. Switch between level and change; click a cell for a local readout.`}
          action={
            <Segmented
              value={mapLayer}
              onChange={(value) => {
                setMapLayer(value)
                setSelectedCell(null)
              }}
              ariaLabel="Spatial layer"
              options={[
                { value: 'mean_temperature', label: 'Mean LST' },
                { value: 'trend', label: 'Trend slope' },
              ]}
            />
          }
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className={`${CARD} h-[440px] overflow-hidden md:h-[520px]`}>
            {layer ? (
              <StudyMap
                region={region}
                layer={layer}
                dark={theme === 'dark'}
                selectedCellId={selectedCell}
                onSelectCell={setSelectedCell}
              />
            ) : null}
          </div>
          <div className="space-y-4">
            {layer ? (
              <div className={`${CARD} overflow-hidden`}>
                <MapLegend layer={layer} />
              </div>
            ) : null}
            <div className={`${CARD} p-4`}>
              <p className="text-[12.5px] font-medium text-[var(--ink)]">Local pattern</p>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--muted)]">
                {layer?.kind === 'trend'
                  ? `The steepest local slope is ${formatNumber(steepest?.slopePerYear ?? 0, 3)} °C/yr. ${significantCells} of ${layer?.cells.length ?? 0} cells carry a demo p-value below 0.05.`
                  : `The warmest sampled cell averages ${formatNumber(hottest?.meanValue ?? 0, 1)} °C. Coastal cells remain cooler than the inland desert fringe in this designed field.`}
              </p>
              <div className="mt-3 border-t border-[var(--line)] pt-3">
                <p className="label">Cell distribution</p>
                {layer ? <MiniHistogram cells={layer.cells} kind={layer.kind} /> : null}
              </div>
            </div>
            <div className={`${CARD} p-4`}>
              <p className="text-[12.5px] font-medium text-[var(--ink)]">Selected cell</p>
              {cell ? (
                <div className="mt-1">
                  <p className="text-[10px] font-medium tracking-[0.05em] uppercase text-[var(--accent)]">{cell.id}</p>
                  <dl className="mt-1">
                    <KeyValue label="Mean LST" value={`${cell.meanValue.toFixed(1)} °C`} />
                    <KeyValue label="Sen’s slope" value={`${cell.slopePerYear.toFixed(3)} °C/yr`} />
                    <KeyValue label="p-value" value={cell.pValue.toFixed(3)} />
                  </dl>
                </div>
              ) : (
                <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
                  Click a cell on the map to inspect its illustrative mean and slope.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section id="statistics" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-12">
        <SectionHead title="The evidence, stated plainly." lede="Statistical interpretation of the fitted trend and the checks that support it." />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <p className="text-[12.5px] font-medium text-[var(--ink)]">Test ledger</p>
            <dl className="mt-2">
              <KeyValue label="Mann–Kendall S" value={formatNumber(trend.mannKendallS, 0)} />
              <KeyValue label="Mann–Kendall Z" value={formatNumber(trend.mannKendallZ, 2)} />
              <KeyValue label="p-value" value={formatPValue(trend.pValue)} />
              <KeyValue label="Significance threshold" value={`α = ${trend.alpha}`} />
              <KeyValue label="Sen’s slope" value={formatSlope(trend.senSlopePerYear)} />
              <KeyValue
                label="Confidence interval"
                value={`${formatNumber(trend.confidenceInterval[0], 3)} – ${formatNumber(trend.confidenceInterval[1], 3)}`}
              />
              <KeyValue
                label="Seasonal Mann–Kendall p"
                value={trend.seasonalMannKendallP === null ? 'not available' : formatPValue(trend.seasonalMannKendallP)}
              />
              <KeyValue label="OLS comparison slope" value={formatSlope(trend.linearSlopePerYear)} />
              <KeyValue label="Valid observations" value={String(trend.observationCount)} />
              <KeyValue label="Missing ratio" value={formatPercent(missingRatio)} />
            </dl>
          </div>
          <div className={`${CARD} p-5`}>
            <p className="text-[12.5px] font-medium text-[var(--ink)]">Evidence checklist</p>
            <ul className="mt-2">
              {evidence.map((item) => (
                <li key={item.label} className="flex gap-3 border-b border-[var(--line)] py-3 last:border-0">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      item.ok
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)]'
                        : 'bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-[var(--warn)]'
                    }`}
                  >
                    {item.ok ? <Check size={11} strokeWidth={3} /> : <AlertTriangle size={11} />}
                  </span>
                  <div>
                    <p className="text-[12.5px] font-medium text-[var(--ink)]">{item.label}</p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">{item.note}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <DataNote label="Method note">{results.methodologyNote}</DataNote>
            </div>
          </div>
        </div>
      </section>

      {/* Anomalies */}
      <section id="anomalies" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-12">
        <SectionHead
          title="When the surface departed from expectation."
          lede="Flagged residuals from the fitted trend and seasonal norm, ordered by date."
          action={<Tag tone="violet">{anomalies.length} flagged</Tag>}
        />
        <AnomalyTimeline
          anomalies={anomalies}
          selectedId={selectedAnomalyId}
          onSelect={setSelectedAnomaly}
          startDate={experiment.configuration.startDate}
          endDate={experiment.configuration.endDate}
        />
      </section>

      {/* Quality */}
      <section id="quality" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-12">
        <SectionHead
          title="What entered the analysis."
          lede="Quality filtering changes the sample, and the sample changes what can be claimed. This is the audit trail for the configured policy."
        />
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div className={`${CARD} p-5`}>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[12.5px] font-medium text-[var(--ink)]">Valid ratio</p>
                <p className="num mt-1.5 text-[24px] leading-none text-[var(--ink)]">{formatPercent(quality.validRatio)}</p>
              </div>
              <p className="text-right text-[11px] leading-relaxed text-[var(--faint)]">
                {quality.validObservations} valid
                <br />
                {quality.totalSlots} total slots
              </p>
            </div>
            <Meter value={quality.validRatio} className="mt-4" />
            <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]" aria-hidden>
              <span className="h-full" style={{ width: `${quality.validRatio * 100}%`, background: 'var(--accent)' }} />
              <span className="h-full opacity-70" style={{ width: `${rejectedRatio * 100}%`, background: 'var(--oxide)' }} />
              <span className="h-full" style={{ width: `${missingRatio * 100}%`, background: 'var(--line-strong)' }} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <QualityStat label="Valid" value={quality.validObservations} tone="accent" />
              <QualityStat label="Rejected" value={quality.rejectedObservations} tone="oxide" />
              <QualityStat label="Missing" value={quality.missingValues} tone="neutral" />
            </div>
            <div className="mt-4 border-t border-[var(--line)] pt-2">
              <KeyValue label="QC method" value={quality.qcMethod} />
              <KeyValue label="Dataset" value={`${dataset?.shortName} ${dataset?.version}`} />
            </div>
          </div>
          <div className={`${CARD} p-5`}>
            <p className="text-[12.5px] font-medium text-[var(--ink)]">Quality interpretation</p>
            <ul className="mt-3 space-y-3 text-[12px] leading-relaxed text-[var(--muted)]">
              <li className="flex gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                Rejected observations are excluded from trend tests but retained in the record so the filter can be audited.
              </li>
              <li className="flex gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                Missing slots are handled by the selected policy. In demo mode, pairwise deletion is used by the in-browser calculation.
              </li>
              <li className="flex gap-2">
                <Info size={14} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                A high valid ratio does not guarantee representativeness: persistent cloud, aerosol or viewing geometry can bias the retained sample.
              </li>
            </ul>
            <div className="mt-4 rounded-[var(--r-inner)] bg-[var(--surface-2)] p-3">
              <p className="label">QC policy in this run</p>
              <p className="mt-1 text-[12px] capitalize text-[var(--ink)]">
                {experiment.configuration.qualityFilter}, minimum valid{' '}
                {(experiment.configuration.minValidRatio * 100).toFixed(0)}%
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Limitations */}
      <section id="limits" className="scroll-mt-[calc(var(--shell-offset,64px)+80px)] pt-12">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
          <div>
            <SectionHead title="What this analysis cannot tell you." />
            <p className="mt-3 max-w-[38ch] text-[12px] leading-relaxed text-[var(--muted)]">
              A trend in land surface temperature is a specific measurement. It is not a comfort index, an air-temperature
              record, or a tourism forecast.
            </p>
          </div>
          <ol className={`${CARD} px-5 py-2`}>
            {results.limitations.map((item) => (
              <li key={item} className="flex gap-3 border-b border-[var(--line)] py-3 last:border-0">
                <span className="mt-[9px] block h-px w-3 shrink-0 bg-[var(--line-strong)]" aria-hidden />
                <span className="text-[12px] leading-relaxed text-[var(--muted)]">{item}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className={`${CARD} mt-6 p-5 md:p-6`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-[60ch]">
              <p className="text-[12.5px] font-medium text-[var(--ink)]">Citation &amp; provenance</p>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted)]">
                Report generated {formatDate(results.generatedAt)} by EarthTrend Lab in demo mode. The analytical output is
                illustrative and must not be cited as a NASA Earth observation finding. Product documentation and the
                instrument user guide remain the authoritative references for {dataset?.shortName}.
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-[11px]">
                <a href={dataset?.documentationUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                  LP DAAC product page <ArrowUpRight size={11} />
                </a>
                <a href="https://lpdaac.usgs.gov/documents/1199/MOD11_User_Guide_V61.pdf" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                  MOD11 user guide <ArrowUpRight size={11} />
                </a>
                <Link to="/methodology" className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                  Full methodology
                </Link>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => exportExperimentJson(experiment)}>
                <Download size={13} /> Export report
              </Button>
              <Button size="sm" onClick={() => navigate('/insights')}>
                <MessageSquare size={13} /> Plain-language read
              </Button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

function FindingMetric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="label">{label}</p>
      <p className="num mt-1 text-[16px] leading-tight text-[var(--ink)]">{value}</p>
      <p className="mt-1 text-[10.5px] leading-relaxed text-[var(--muted)]">{note}</p>
    </div>
  )
}

function AnomalyTimeline({
  anomalies,
  selectedId,
  onSelect,
  startDate,
  endDate,
}: {
  anomalies: Anomaly[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  startDate: string
  endDate: string
}) {
  const start = new Date(startDate).getTime()
  const end = new Date(endDate).getTime()
  const span = end - start || 1
  const years = Array.from({ length: 6 }, (_, index) => {
    const time = start + (span * index) / 5
    return new Date(time).getUTCFullYear()
  })
  const selected = anomalies.find((item) => item.id === selectedId)

  if (anomalies.length === 0) {
    return (
      <div className="mt-5 rounded-[var(--r-card)] border border-dashed border-[var(--line-strong)] bg-[var(--surface)] px-5 py-8 text-[12px] text-[var(--muted)]">
        No anomalies crossed the demo detection threshold for this run.
      </div>
    )
  }

  return (
    <div className={`${CARD} mt-5 p-5`}>
      <div className="relative h-24">
        <div className="absolute inset-x-0 top-1/2 h-px bg-[var(--line-strong)]" />
        {years.map((year, index) => (
          <div key={`${year}-${index}`} className="absolute top-1/2 -translate-y-1/2" style={{ left: `${(index / 5) * 100}%` }}>
            <span className="block h-2 w-px bg-[var(--line-strong)]" />
            <span className="num absolute top-3 left-0 -translate-x-1/2 text-[9px] text-[var(--faint)]">{year}</span>
          </div>
        ))}
        {anomalies.map((anomaly) => {
          const left = Math.max(0, Math.min(100, ((new Date(anomaly.date).getTime() - start) / span) * 100))
          const isSelected = anomaly.id === selectedId
          const size = anomaly.severity === 'extreme' ? 13 : anomaly.severity === 'high' ? 10 : 8
          return (
            <button
              key={anomaly.id}
              type="button"
              onClick={() => onSelect(isSelected ? null : anomaly.id)}
              aria-label={`Anomaly ${anomaly.date}, ${anomaly.observed.toFixed(1)} °C, ${anomaly.severity}`}
              className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors"
              style={{ left: `${left}%` }}
            >
              <span
                className="block rounded-full border-2"
                style={{
                  width: size,
                  height: size,
                  background: isSelected ? 'var(--accent)' : 'var(--oxide)',
                  borderColor: isSelected ? 'var(--ink)' : 'var(--surface)',
                }}
              />
            </button>
          )
        })}
        {selected ? (
          <div
            className="absolute top-0 z-20 -translate-x-1/2 rounded-[var(--r-inner)] border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-center shadow-[var(--shadow-lift)]"
            style={{ left: `${Math.max(8, Math.min(92, ((new Date(selected.date).getTime() - start) / span) * 100))}%` }}
          >
            <p className="num text-[10px] text-[var(--ink)]">{selected.date}</p>
            <p className="num text-[9.5px] text-[var(--oxide)]">{selected.observed.toFixed(1)} °C</p>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
        <p className="text-[10.5px] text-[var(--faint)]">Selected: {selected ? formatDate(selected.date) : 'none'}</p>
        <div className="flex items-center gap-3 text-[10px] text-[var(--faint)]">
          <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[var(--oxide)]" /> moderate</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[var(--oxide)]" /> high</span>
          <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[var(--oxide)]" /> extreme</span>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[12px]">
          <thead className="border-b border-[var(--line)] text-[var(--faint)]">
            <tr>
              {['Date', 'Observed', 'Expected', 'Residual', 'Score', 'Severity'].map((label, index) => (
                <th key={label} className={`py-2 text-[10px] font-medium tracking-[0.06em] uppercase ${index === 5 ? 'text-right' : ''}`}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {anomalies.map((anomaly) => {
              const active = anomaly.id === selectedId
              return (
                <tr
                  key={anomaly.id}
                  tabIndex={0}
                  role="button"
                  aria-selected={active}
                  onClick={() => onSelect(active ? null : anomaly.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onSelect(active ? null : anomaly.id)
                    }
                  }}
                  className={`cursor-pointer border-b border-[var(--line)] transition-colors last:border-0 ${
                    active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-2)]'
                  }`}
                >
                  <td className="num py-2.5">{anomaly.date}</td>
                  <td className="num py-2.5">{anomaly.observed.toFixed(2)} °C</td>
                  <td className="num py-2.5 text-[var(--muted)]">{anomaly.expected.toFixed(2)} °C</td>
                  <td className="num py-2.5" style={{ color: anomaly.observed > anomaly.expected ? 'var(--warn)' : 'var(--accent)' }}>
                    {anomaly.observed > anomaly.expected ? '+' : ''}
                    {(anomaly.observed - anomaly.expected).toFixed(2)}
                  </td>
                  <td className="num py-2.5">{anomaly.score.toFixed(2)}</td>
                  <td className="py-2.5 text-right">
                    <Tag tone={anomaly.severity === 'extreme' ? 'warn' : anomaly.severity === 'high' ? 'violet' : 'neutral'}>
                      {anomaly.severity}
                    </Tag>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[10.5px] leading-relaxed text-[var(--faint)]">
        Anomalies are scored on the STL-style remainder using a MAD-scaled Z-score in this demo. Selecting a row marks the
        corresponding position in the chart above.
      </p>
    </div>
  )
}

function QualityStat({ label, value, tone }: { label: string; value: number; tone: 'accent' | 'oxide' | 'neutral' }) {
  const color = tone === 'accent' ? 'text-[var(--accent)]' : tone === 'oxide' ? 'text-[var(--oxide)]' : 'text-[var(--muted)]'
  return (
    <div className="rounded-[var(--r-inner)] bg-[var(--surface-2)] px-3 py-2">
      <p className="label">{label}</p>
      <p className={`num mt-0.5 text-[16px] ${color}`}>{value}</p>
    </div>
  )
}

function MiniHistogram({ cells, kind }: { cells: SpatialCell[]; kind: 'mean_temperature' | 'trend' }) {
  const values = cells.map((cell) => (kind === 'trend' ? cell.slopePerYear : cell.meanValue))
  const min = Math.min(...values)
  const max = Math.max(...values)
  const bins = Array.from({ length: 12 }, () => 0)
  for (const value of values) {
    const index = Math.min(11, Math.floor(((value - min) / (max - min || 1)) * 12))
    bins[index] += 1
  }
  const peak = Math.max(...bins, 1)
  return (
    <div className="mt-2">
      <div className="flex h-14 items-end gap-[3px]">
        {bins.map((count, index) => (
          <span
            key={index}
            className="min-h-[2px] flex-1 rounded-t-[2px]"
            style={{
              height: `${Math.max(4, (count / peak) * 100)}%`,
              background: dataColor(kind, index / 11),
              opacity: 0.85,
            }}
            title={`${count} cells`}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-[var(--faint)]">
        <span>{min.toFixed(2)}</span>
        <span>{max.toFixed(2)}</span>
      </div>
    </div>
  )
}
