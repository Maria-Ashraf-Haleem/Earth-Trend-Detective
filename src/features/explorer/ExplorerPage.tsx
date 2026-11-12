import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart'
import { DemoMark, Field, SelectField, TextInput } from '@/components/common/Field'
import { Meter, Segmented, Tag } from '@/components/common/Primitives'
import { MapLegend, StudyMap } from '@/components/maps/StudyMap'
import { Button } from '@/components/ui/button'
import { datasets, regions, variables } from '@/data/mock/catalog'
import { buildSpatialLayers, daytimeSeries, nighttimeSeries, sliceSeries } from '@/data/mock/series'
import { useAppStore } from '@/store/useAppStore'
import { useLabStore } from '@/store/useLabStore'
import { aggregateSeries, analyzeTrend } from '@/utils/stats'
import { formatSlope } from '@/utils/format'
import { Crosshair, Eye, EyeOff, Layers, MoveRight, RotateCcw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

// Clearance for the map header plate on narrow layouts.
const MAP_FIT_PADDING: [number, number, number, number] = [108, 20, 36, 20]

export function ExplorerPage() {
  const theme = useAppStore((s) => s.theme)
  const draft = useLabStore((s) => s.draft)
  const setDraft = useLabStore((s) => s.setDraft)
  const explorerWindow = useLabStore((s) => s.explorerWindow)
  const setExplorerWindow = useLabStore((s) => s.setExplorerWindow)
  const mapLayer = useLabStore((s) => s.mapLayer)
  const setMapLayer = useLabStore((s) => s.setMapLayer)
  const [cellId, setCellId] = useState<string | null>(null)
  const [showLayer, setShowLayer] = useState(true)
  const [showBoundary, setShowBoundary] = useState(true)

  const region = regions.find((item) => item.id === draft.regionId) ?? regions[0]
  const dataset = datasets[0]
  const variable = variables.find((item) => item.id === draft.variableId) ?? variables[0]
  const invalidRange = draft.startDate > draft.endDate

  const layers = useMemo(() => buildSpatialLayers(explorerWindow), [explorerWindow])
  const activeLayer = layers.find((layer) => layer.kind === mapLayer) ?? layers[0]
  const visibleLayer = showLayer ? activeLayer : null

  const preview = useMemo(() => {
    if (invalidRange) return { series: [], trend: null, valid: 0, rejected: 0, missing: 0 }
    const source = explorerWindow === 'nighttime' ? nighttimeSeries : daytimeSeries
    const sliced = sliceSeries(source, draft.startDate, draft.endDate)
    const trend = analyzeTrend(sliced)
    const series = aggregateSeries(sliced, draft.aggregation)
    return {
      series,
      trend,
      valid: sliced.filter((point) => point.qualityFlag === 'valid').length,
      rejected: sliced.filter((point) => point.qualityFlag === 'rejected').length,
      missing: sliced.filter((point) => point.qualityFlag === 'missing').length,
    }
  }, [explorerWindow, draft.startDate, draft.endDate, draft.aggregation, invalidRange])

  const cell = activeLayer.cells.find((item) => item.id === cellId)
  const totalSlots = preview.valid + preview.rejected + preview.missing

  const resetView = () => {
    setExplorerWindow('daytime')
    setDraft({ startDate: '2003-01-01', endDate: '2024-12-31', aggregation: 'monthly', regionId: 'hurghada' })
    setCellId(null)
  }

  return (
    <div className="relative xl:h-[calc(100dvh-var(--shell-offset,64px))] xl:overflow-hidden">
      <div className="relative h-[68vh] min-h-[440px] xl:h-full">
        <div className="absolute inset-0">
          <StudyMap
            region={region}
            layer={visibleLayer}
            dark={theme === 'dark'}
            selectedCellId={cellId}
            onSelectCell={setCellId}
            showBoundary={showBoundary}
            docked
            fitPadding={MAP_FIT_PADDING}
          />
        </div>

        {/* Map header overlay */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-wrap items-start justify-between gap-2 md:inset-x-5 md:top-5">
          <div className="pointer-events-auto max-w-[380px] rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3.5 shadow-[var(--shadow-pop)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.07em] uppercase text-[var(--accent)]">
                <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                Explore
              </span>
              <DemoMark label="Demo field" />
            </div>
            <h1 className="display mt-2 text-[clamp(1.5rem,2.2vw,1.95rem)] text-[var(--ink)]">Read the surface.</h1>
            <p className="num mt-1.5 text-[10.5px] leading-relaxed text-[var(--muted)]">
              {region.name} · {variable.shortName} · {draft.startDate.slice(0, 4)}—{draft.endDate.slice(0, 4)}
            </p>
          </div>

          <div className="pointer-events-auto hidden flex-wrap items-center gap-2 xl:flex">
            <Button variant="secondary" size="sm" onClick={resetView}>
              <RotateCcw size={13} /> Reset
            </Button>
            <Button size="sm" asChild>
              <Link to="/lab">
                Analyze this view <MoveRight size={13} />
              </Link>
            </Button>
          </div>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute top-[112px] right-3 z-[500] hidden max-w-[300px] md:right-5 xl:top-[92px] xl:block">
          <div className="pointer-events-auto overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-pop)]">
            <MapLegend layer={activeLayer} />
          </div>
        </div>

        {!showLayer ? (
          <div className="pointer-events-none absolute inset-0 z-[450] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg-deep)_22%,transparent)]">
            <p className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-3.5 py-1.5 text-[11px] font-medium text-[var(--muted)] shadow-[var(--shadow-card)]">
              Temperature field hidden
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-3 pb-6 md:p-4 xl:contents">
        {/* Field actions: inline below the map on narrow layouts, overlaid on desktop */}
        <div className="flex flex-wrap items-center gap-2 xl:hidden">
          <Button variant="secondary" size="sm" onClick={resetView}>
            <RotateCcw size={13} /> Reset
          </Button>
          <Button size="sm" asChild>
            <Link to="/lab">
              Analyze this view <MoveRight size={13} />
            </Link>
          </Button>
          <span className="ml-auto text-[11px] text-[var(--faint)]">Field view · {region.name}</span>
        </div>

        {/* Control rail */}
        <aside className="z-[500] overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-pop)] xl:absolute xl:top-[104px] xl:bottom-4 xl:left-4 xl:w-[324px] xl:overflow-y-auto">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
            <p className="text-[12.5px] font-medium text-[var(--ink)]">Controls</p>
            <span className="text-[10.5px] text-[var(--faint)]">20 × 16 cells</span>
          </div>

          <div className="space-y-5 px-4 py-4">
            <section>
              <div className="flex items-center justify-between">
                <p className="label">Observation</p>
                <span className="text-[10.5px] text-[var(--faint)]">{variable.unit}</span>
              </div>
              <div className="mt-2 grid gap-2">
                {variables.map((item) => {
                  const active = item.observationWindow === explorerWindow
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setExplorerWindow(item.observationWindow)}
                      className={`group flex items-start gap-3 rounded-[var(--r-inner)] border px-3 py-2.5 text-left transition-colors duration-150 ${
                        active
                          ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[var(--accent-soft)]'
                          : 'border-[var(--line)] hover:bg-[var(--surface-2)]'
                      }`}
                    >
                      <span
                        className={`mt-1 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border-2 ${
                          active ? 'border-[var(--accent)]' : 'border-[var(--line-strong)]'
                        }`}
                      >
                        {active ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-[var(--ink)]">
                          {item.shortName}
                          <span className="text-[10px] font-normal text-[var(--faint)]">Terra</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--muted)]">
                          {item.observationWindow === 'daytime'
                            ? 'Afternoon surface heating signal'
                            : 'Nighttime residual heat signal'}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <p className="label">Study area</p>
              <div className="mt-2 space-y-2">
                <SelectField
                  value={draft.regionId}
                  ariaLabel="Study area"
                  onChange={(value) => {
                    setDraft({ regionId: value })
                    setCellId(null)
                  }}
                  options={regions.map((item) => ({ value: item.id, label: `${item.name}, ${item.country}` }))}
                />
                <div className="grid grid-cols-2 gap-1 rounded-[var(--r-inner)] bg-[var(--surface-2)] px-2.5 py-2 text-[10px] text-[var(--faint)]">
                  <span>W {region.bounds.west.toFixed(2)}°</span>
                  <span className="text-right">E {region.bounds.east.toFixed(2)}°</span>
                  <span>S {region.bounds.south.toFixed(2)}°</span>
                  <span className="text-right">N {region.bounds.north.toFixed(2)}°</span>
                </div>
              </div>
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between">
                <p className="label">Period</p>
                <span className="text-[10.5px] text-[var(--faint)]">
                  {draft.startDate.slice(0, 4)}—{draft.endDate.slice(0, 4)}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Field label="From">
                  <TextInput
                    type="date"
                    value={draft.startDate}
                    min="2003-01-01"
                    max="2024-12-31"
                    onChange={(event) => setDraft({ startDate: event.target.value })}
                  />
                </Field>
                <Field label="To">
                  <TextInput
                    type="date"
                    value={draft.endDate}
                    min="2003-01-01"
                    max="2024-12-31"
                    onChange={(event) => setDraft({ endDate: event.target.value })}
                  />
                </Field>
              </div>
              {invalidRange ? (
                <p className="mt-2 rounded-[var(--r-inner)] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] px-2.5 py-1.5 text-[11px] text-[var(--danger)]">
                  Start date must precede the end date.
                </p>
              ) : (
                <div className="mt-2 flex gap-1.5">
                  {[
                    { label: 'Full record', start: '2003-01-01', end: '2024-12-31' },
                    { label: 'Last decade', start: '2015-01-01', end: '2024-12-31' },
                  ].map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDraft({ startDate: preset.start, endDate: preset.end })}
                      className="rounded-full border border-[var(--line)] px-2.5 py-1 text-[10.5px] text-[var(--muted)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <p className="label">Map layer</p>
              <Segmented
                className="mt-2 w-full"
                value={mapLayer}
                onChange={(value) => setMapLayer(value)}
                ariaLabel="Map layer"
                size="sm"
                options={[
                  { value: 'mean_temperature', label: 'Mean LST' },
                  { value: 'trend', label: 'Trend slope' },
                ]}
              />
              <div className="mt-2 space-y-0.5">
                <label className="flex cursor-pointer items-center justify-between py-2 text-[11.5px] text-[var(--ink)]">
                  <span className="flex items-center gap-2">
                    {showLayer ? (
                      <Layers size={13} className="text-[var(--accent)]" />
                    ) : (
                      <EyeOff size={13} className="text-[var(--faint)]" />
                    )}
                    Temperature field
                  </span>
                  <input type="checkbox" checked={showLayer} onChange={(event) => setShowLayer(event.target.checked)} />
                </label>
                <label className="flex cursor-pointer items-center justify-between py-2 text-[11.5px] text-[var(--ink)]">
                  <span className="flex items-center gap-2">
                    <Crosshair size={13} className="text-[var(--accent)]" /> Study extent
                  </span>
                  <input
                    type="checkbox"
                    checked={showBoundary}
                    onChange={(event) => setShowBoundary(event.target.checked)}
                  />
                </label>
              </div>
              <div className="mt-2 overflow-hidden rounded-[var(--r-inner)] border border-[var(--line)] xl:hidden">
                <MapLegend layer={activeLayer} compact />
              </div>
            </section>

            <section className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between">
                <p className="label">Cell inspector</p>
                <span className="text-[10.5px] text-[var(--faint)]">Click the grid</span>
              </div>
              {cell ? (
                <div className="mt-2 rounded-[var(--r-inner)] bg-[var(--surface-2)] p-3">
                  <p className="text-[10px] font-medium tracking-[0.06em] uppercase text-[var(--accent)]">
                    {cell.id}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <div>
                      <p className="label">Mean LST</p>
                      <p className="num mt-0.5 text-[15px] text-[var(--ink)]">{cell.meanValue.toFixed(1)} °C</p>
                    </div>
                    <div>
                      <p className="label">Sen’s slope</p>
                      <p className="num mt-0.5 text-[15px] text-[var(--ink)]">{cell.slopePerYear.toFixed(3)}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--faint)]">p {cell.pValue.toFixed(3)} · illustrative</p>
                </div>
              ) : (
                <p className="mt-2 flex items-start gap-2 text-[11px] leading-relaxed text-[var(--muted)]">
                  <Eye size={13} className="mt-0.5 shrink-0 text-[var(--faint)]" /> Select a grid cell on the map for a
                  local readout.
                </p>
              )}
            </section>

            <div className="border-t border-[var(--line)] pt-4">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--muted)]">Data availability</span>
                <span className="num text-[var(--ink)]">{totalSlots ? `${preview.valid}/${totalSlots}` : '—'}</span>
              </div>
              <Meter value={totalSlots ? preview.valid / totalSlots : 0} className="mt-2" />
              <p className="mt-1.5 text-[10px] text-[var(--faint)]">
                {dataset.shortName} {dataset.version} · {dataset.temporalResolution}
              </p>
            </div>
          </div>
        </aside>

        {/* Preview dock */}
        <section className="z-[500] overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-pop)] xl:absolute xl:right-4 xl:bottom-4 xl:left-[352px]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-[12.5px] font-medium text-[var(--ink)]">Series preview</p>
              <DemoMark />
              {preview.trend ? (
                <span className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
                  <span className="h-3 w-px bg-[var(--line-strong)]" />
                  Browser slope{' '}
                  <span className="num text-[var(--ink)]">{formatSlope(preview.trend.senSlopePerYear)}</span>
                </span>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-[10.5px] text-[var(--faint)] sm:inline">
                {preview.valid} valid · {preview.rejected} rejected · {preview.missing} missing
              </span>
              <Segmented
                size="sm"
                value={draft.aggregation}
                onChange={(value) => setDraft({ aggregation: value })}
                ariaLabel="Preview aggregation"
                options={[
                  { value: 'monthly', label: 'M' },
                  { value: 'seasonal', label: 'S' },
                  { value: 'annual', label: 'A' },
                ]}
              />
            </div>
          </div>
          <div className="px-2 pt-1 md:px-3">
            {invalidRange ? (
              <div className="flex h-[160px] items-center justify-center text-[12px] text-[var(--danger)]">
                Fix the study period to render a preview.
              </div>
            ) : preview.series.length > 0 ? (
              <TimeSeriesChart series={preview.series} height={160} compact showRangeSlider={false} />
            ) : (
              <div className="flex h-[160px] flex-col items-center justify-center gap-1 text-center">
                <p className="text-[12px] text-[var(--muted)]">No observations in this window.</p>
                <p className="text-[11px] text-[var(--faint)]">Widen the period or choose another aggregation.</p>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] px-4 py-2">
            <p className="max-w-[70ch] text-[10px] leading-relaxed text-[var(--faint)]">
              Exploration preview only — no experiment has been run. Values are computed in your browser from the
              illustrative demo series, not retrieved from NASA.
            </p>
            <Tag tone="accent">Preview</Tag>
          </div>
        </section>
      </div>
    </div>
  )
}
