// avoid-ai-design-ignore-file: SD4
// Ruled mono table headers are the archive-ledger system.
import { Sparkline } from '@/components/charts/Sparkline'
import { EmptyState } from '@/components/common/EmptyState'
import { DemoMark } from '@/components/common/Field'
import { PageHeader, ReadoutStrip, Segmented, Tag, TrendMark } from '@/components/common/Primitives'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { regions, variables } from '@/data/mock/catalog'
import { useLabStore } from '@/store/useLabStore'
import { formatDate, formatSlope } from '@/utils/format'
import {
  ArrowUpRight,
  Copy,
  GitCompare,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

type WindowFilter = 'all' | 'daytime' | 'nighttime'
type StatusFilter = 'all' | 'completed' | 'draft'
type SortMode = 'newest' | 'name' | 'slope'

export function ExperimentsPage() {
  const experiments = useLabStore((s) => s.experiments)
  const openExperiment = useLabStore((s) => s.openExperiment)
  const duplicateExperiment = useLabStore((s) => s.duplicateExperiment)
  const deleteExperiment = useLabStore((s) => s.deleteExperiment)
  const toggleCompare = useLabStore((s) => s.toggleCompare)
  const setCompareIds = useLabStore((s) => s.setCompareIds)
  const compareIds = useLabStore((s) => s.compareIds)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<SortMode>('newest')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  const completed = experiments.filter((item) => item.results)
  const anomalyTotal = completed.reduce((sum, item) => sum + (item.results?.anomalies.length ?? 0), 0)
  const selected = experiments.filter((item) => compareIds.includes(item.id) && item.results)
  const dayCount = experiments.filter((item) => item.configuration.observationWindow === 'daytime').length
  const nightCount = experiments.filter((item) => item.configuration.observationWindow === 'nighttime').length

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = experiments.filter((item) => {
      const region = regions.find((entry) => entry.id === item.configuration.regionId)?.name ?? ''
      const text = `${item.configuration.name} ${region} ${item.configuration.variableId}`.toLowerCase()
      return text.includes(q)
    })
    if (windowFilter !== 'all') list = list.filter((item) => item.configuration.observationWindow === windowFilter)
    if (statusFilter !== 'all') {
      list = list.filter((item) => (statusFilter === 'completed' ? Boolean(item.results) : !item.results))
    }
    return [...list].sort((a, b) => {
      if (sort === 'name') return a.configuration.name.localeCompare(b.configuration.name)
      if (sort === 'slope') {
        return Math.abs(b.results?.trend.senSlopePerYear ?? 0) - Math.abs(a.results?.trend.senSlopePerYear ?? 0)
      }
      return b.createdAt.localeCompare(a.createdAt)
    })
  }, [experiments, query, windowFilter, statusFilter, sort])

  if (experiments.length === 0) {
    return (
      <div className="px-4 py-12 md:px-7">
        <EmptyState
          eyebrow="Library"
          title="No experiments saved"
          body="Runs persist in this browser. Configure a protocol in Analyze to create the first record."
          action={
            <Button asChild>
              <Link to="/lab">Design a study</Link>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-12">
      <PageHeader
        eyebrow="Library"
        title={
          <>
            Saved <em className="text-[var(--accent)]">missions.</em>
          </>
        }
        lede="Every completed or draft protocol in this browser. Open a readout, duplicate a study, or stage runs for a controlled comparison."
        actions={
          <>
            <Button variant="secondary" size="sm" asChild>
              <Link to="/compare">
                <GitCompare size={13} /> Compare {compareIds.length ? `(${compareIds.length})` : ''}
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/lab">
                <Plus size={13} /> New analysis
              </Link>
            </Button>
          </>
        }
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <DemoMark label="Illustrative data" />
          </div>
        }
      />

      <ReadoutStrip
        className="mt-6"
        columns={3}
        items={[
          {
            label: 'Records',
            value: String(experiments.length),
            detail: `${completed.length} completed, ${experiments.length - completed.length} draft`,
          },
          {
            label: 'Day / night',
            value: `${dayCount} / ${nightCount}`,
            detail: 'Protocol split across retrieval bands',
            tone: 'violet',
          },
          {
            label: 'Flagged anomalies',
            value: String(anomalyTotal),
            detail: 'Illustrative detections across completed runs',
            tone: 'warn',
          },
        ]}
      />

      {/* Toolbar */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-card)]">
        <label className="relative min-w-[200px] flex-1 sm:max-w-[330px]">
          <Search size={14} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-[var(--faint)]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, region or variable…"
            aria-label="Search experiments"
            className="h-10 w-full rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] pr-3 pl-10 text-[12px] transition-colors placeholder:text-[var(--faint)] hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <Segmented
          size="sm"
          value={windowFilter}
          onChange={setWindowFilter}
          ariaLabel="Filter by observation window"
          options={[
            { value: 'all', label: 'All' },
            { value: 'daytime', label: 'Day' },
            { value: 'nighttime', label: 'Night' },
          ]}
        />
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          aria-label="Filter by status"
          className="h-10 rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11.5px] transition-colors hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:outline-none"
        >
          <option value="all">Any status</option>
          <option value="completed">Completed</option>
          <option value="draft">Draft</option>
        </select>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as SortMode)}
          aria-label="Sort experiments"
          className="ml-auto h-10 rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] px-3 text-[11.5px] transition-colors hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:outline-none"
        >
          <option value="newest">Newest first</option>
          <option value="name">Name A–Z</option>
          <option value="slope">Largest |slope|</option>
        </select>
      </div>

      {/* Ledger table */}
      <div className="mt-6 overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]">
        <div className="hidden grid-cols-[36px_minmax(0,1.5fr)_minmax(0,0.7fr)_110px_92px_minmax(0,0.75fr)_88px] items-center gap-3 border-b border-[var(--line)] px-4 py-3 lg:grid">
          <span className="label">Sel</span>
          <span className="label">Experiment</span>
          <span className="label">Result</span>
          <span className="label">Series</span>
          <span className="label">Created</span>
          <span className="label">Protocol</span>
          <span className="label text-right">Actions</span>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
            <p className="text-[13px] text-[var(--muted)]">No experiments match these filters.</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQuery('')
                setWindowFilter('all')
                setStatusFilter('all')
              }}
            >
              Clear filters
            </Button>
          </div>
        ) : (
          rows.map((item, index) => {
            const region = regions.find((entry) => entry.id === item.configuration.regionId)
            const variable = variables.find((entry) => entry.id === item.configuration.variableId)
            const trend = item.results?.trend
            const inCompare = compareIds.includes(item.id)
            return (
              <div
                key={item.id}
                className="group grid gap-3 border-b border-[var(--line)] px-4 py-4 transition-colors last:border-0 hover:bg-[var(--surface-2)] lg:grid-cols-[36px_minmax(0,1.5fr)_minmax(0,0.7fr)_110px_92px_minmax(0,0.75fr)_88px] lg:items-center"
              >
                <div className="flex items-center gap-2">
                  <label
                    className={`flex h-6 w-6 items-center justify-center ${item.results ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                  >
                    <input
                      type="checkbox"
                      checked={inCompare}
                      disabled={!item.results}
                      onChange={() => toggleCompare(item.id)}
                      aria-label={`Select ${item.configuration.name} for comparison`}
                      className="h-3.5 w-3.5"
                    />
                  </label>
                  <span className="text-[10px] text-[var(--faint)] lg:hidden">{index + 1}</span>
                </div>

                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => {
                      openExperiment(item.id)
                      navigate(item.results ? `/results/${item.id}` : '/lab')
                    }}
                    className="-my-0.5 block max-w-full truncate py-0.5 text-left text-[13px] font-medium transition-colors hover:text-[var(--accent)]"
                  >
                    {item.configuration.name}
                  </button>
                  <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] font-medium text-[var(--faint)]">
                    <span>{region?.name ?? '—'},</span>
                    <span>{variable?.shortName ?? '—'},</span>
                    <span>
                      {item.configuration.startDate.slice(0, 4)}–{item.configuration.endDate.slice(0, 4)}
                    </span>
                    {item.isDemo ? <Tag tone="warn" className="ml-1">demo</Tag> : null}
                  </p>
                </div>

                <div className="text-[11px]">
                  {trend ? (
                    <>
                      <TrendMark direction={trend.direction} compact />
                      <p className="num mt-1 text-[10px] text-[var(--muted)]">{formatSlope(trend.senSlopePerYear)}</p>
                    </>
                  ) : (
                    <span className="text-[var(--faint)]">No results</span>
                  )}
                </div>

                <div className="hidden lg:block">
                  {item.results ? (
                    <Sparkline
                      series={item.results.monthlySeries ?? item.results.series}
                      width={104}
                      height={30}
                      fill={false}
                      className="h-[30px] w-[104px]"
                    />
                  ) : null}
                </div>

                <div className="text-[11.5px] text-[var(--faint)]">
                  <p>{formatDate(item.createdAt)}</p>
                  <p className="mt-0.5 text-[10px] capitalize">{item.status}</p>
                </div>

                <p className="truncate text-[10px] text-[var(--faint)]">
                  {item.configuration.aggregation}, {item.configuration.observationWindow}, QC{' '}
                  {item.configuration.qualityFilter}
                </p>
                <div className="flex items-center justify-end gap-0.5 lg:opacity-55 lg:transition-opacity lg:group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      openExperiment(item.id)
                      navigate(item.results ? `/results/${item.id}` : '/lab')
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--r-control)] text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
                    aria-label={`Open ${item.configuration.name}`}
                  >
                    <ArrowUpRight size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => duplicateExperiment(item.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--r-control)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
                    aria-label={`Duplicate ${item.configuration.name}`}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(item.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-[var(--r-control)] text-[var(--muted)] transition-colors hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] hover:text-[var(--danger)]"
                    aria-label={`Delete ${item.configuration.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-[var(--faint)]">
          Showing {rows.length} of {experiments.length} records
        </p>
      </div>

      {compareIds.length > 0 ? (
        <div className="z-20 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-4 py-3 shadow-[var(--shadow-lift)]">
          <div className="min-w-0">
            <p className="text-[10.5px] font-medium tracking-[0.06em] uppercase text-[var(--accent)]">Comparison tray</p>
            <p className="mt-1 truncate text-[11px] text-[var(--muted)]">
              {selected.length
                ? selected.map((item) => item.configuration.name).join(', ')
                : 'No completed runs selected yet.'}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCompareIds([])}
              className="rounded-[var(--r-control)] p-1.5 text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
              aria-label="Clear comparison selection"
            >
              <X size={14} />
            </button>
            <Button size="sm" asChild>
              <Link to="/compare">Open comparison [{selected.length}]</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={() => setPendingDelete(null)}
        title="Delete this experiment?"
        description="This removes the local demo record and any comparison selection. It cannot be undone."
        confirmLabel="Delete record"
        onConfirm={() => {
          if (pendingDelete) deleteExperiment(pendingDelete)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
