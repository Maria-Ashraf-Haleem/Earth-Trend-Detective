import { EmptyState } from '@/components/common/EmptyState'
import { PageHeader, Tag } from '@/components/common/Primitives'
import { nullableNumber, environmentalUnit } from '@/components/common/LiveDataState'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/dialog'
import { useLabStore } from '@/store/useLabStore'
import { Copy, Plus, Search, Trash2, ArrowUpRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

export function ExperimentsPage() {
  const records = useLabStore(s => s.experiments)
  const open = useLabStore(s => s.openExperiment)
  const copy = useLabStore(s => s.duplicateExperiment)
  const remove = useLabStore(s => s.deleteExperiment)
  const [query, setQuery] = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const navigate = useNavigate()
  const rows = useMemo(() => records.filter(r => r.source === 'api' && `${r.configuration.name} ${r.context?.regionName ?? ''} ${r.configuration.variableId}`.toLowerCase().includes(query.toLowerCase())), [records, query])
  if (!records.length) return <div className="px-4 py-12 md:px-8"><EmptyState eyebrow="Library" title="No live analyses yet" body="Run a real analysis to retain its API response in this browser. The library contains no seeded demo results and is not a server experiment service." action={<Button asChild><Link to="/lab"><Plus size={13} /> New analysis</Link></Button>} /></div>
  return <div className="mx-auto max-w-[1480px] px-4 py-10 md:px-8 md:py-12"><PageHeader eyebrow="Library" title={<>Saved <em className="text-[var(--accent)]">observations.</em></>} lede="The last ten real API responses in this browser. Server-side experiment saving is not implemented. Copying a configuration does not fabricate another result." actions={<Button asChild><Link to="/lab"><Plus size={13} /> New analysis</Link></Button>} meta={<Tag>Local API response history</Tag>} />
    <label className="mt-7 flex max-w-md items-center gap-3 rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] px-3"><Search size={14} /><input className="h-11 w-full bg-transparent text-[13px] outline-none" aria-label="Search live analyses" placeholder="Search analyses" value={query} onChange={e => setQuery(e.target.value)} /></label>
    <div className="mt-5 overflow-x-auto rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)]"><table className="w-full min-w-[700px] text-left text-[12px]"><thead className="text-[var(--muted)]"><tr><th className="p-4">Analysis / indicator</th><th className="p-4">Period</th><th className="p-4">Status</th><th className="p-4">OLS slope / year</th><th className="p-4">Actions</th></tr></thead><tbody>{rows.map(r => <tr key={r.id} className="border-t border-[var(--line)]"><td className="p-4"><p className="font-medium">{r.configuration.name}</p><p className="mt-1 text-[11px] text-[var(--faint)]">{r.context?.indicatorName ?? r.configuration.variableId}</p></td><td className="p-4">{r.configuration.startDate} / {r.configuration.endDate}</td><td className="p-4"><Tag tone={r.status === 'failed' ? 'warn' : 'neutral'}>{r.status}</Tag></td><td className="p-4">{r.liveResult?.slope_per_year == null ? 'Unavailable' : `${nullableNumber(r.liveResult.slope_per_year, 4)} ${environmentalUnit(r.liveResult.unit)}`}</td><td className="p-4"><div className="flex gap-2"><Button size="sm" variant="ghost" disabled={!r.liveResult} onClick={() => { open(r.id); navigate(`/results/${r.id}`) }}><ArrowUpRight size={13} /> Open</Button><Button size="icon" variant="ghost" aria-label={`Copy configuration ${r.configuration.name}`} onClick={() => { copy(r.id); navigate('/lab') }}><Copy size={13} /></Button><Button size="icon" variant="ghost" aria-label={`Delete local result ${r.configuration.name}`} onClick={() => setPendingDelete(r.id)}><Trash2 size={13} /></Button></div></td></tr>)}</tbody></table></div>
    {rows.length === 0 ? <p className="mt-5 text-[13px]">No analyses match this search.</p> : null}
    <ConfirmDialog open={pendingDelete !== null} onOpenChange={value => { if (!value) setPendingDelete(null) }} title="Remove this local result?" description="Only this browser copy is removed. SQL observations and server history are unchanged." confirmLabel="Remove local copy" onConfirm={() => { if (pendingDelete) remove(pendingDelete); setPendingDelete(null) }} />
  </div>
}
