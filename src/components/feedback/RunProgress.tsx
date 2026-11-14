import type { ExperimentConfiguration } from '@/types'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

export function RunProgress({ open, configuration, onCancel, regionName, indicatorName }: {
  open: boolean; configuration: ExperimentConfiguration | null; progressIndex: number
  onCancel?: () => void; regionName?: string; indicatorName?: string
}) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!open) { setElapsed(0); return }
    const started = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [open])
  if (!open) return null
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] p-4" role="dialog" aria-modal="true" aria-label="Analysis running">
    <div className="w-full max-w-[700px] rounded-[var(--r-card)] border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lift)] md:p-8">
      <p className="label text-[var(--accent)]">Live environmental request</p><div className="mt-5 flex items-center gap-4"><Loader2 className="animate-spin text-[var(--accent)]" size={24} /><h2 className="display text-[2rem]">Reading the observations.</h2></div>
      <p className="mt-4 text-[13px] text-[var(--muted)]">{configuration?.name} - {regionName ?? configuration?.regionId} - {indicatorName ?? configuration?.variableId}</p>
      <p className="mt-4 text-[12px] leading-relaxed text-[var(--muted)]">The API is aggregating the selected historical source data. Regional requests can take several seconds. Progress percentages are unavailable; elapsed time is shown below.</p>
      <p className="num mt-5 text-[22px]" role="status" aria-live="off">{elapsed}s elapsed</p>
      <div className="mt-6 flex items-center justify-between gap-4 border-t border-[var(--line)] pt-4"><span className="text-[11px] text-[var(--faint)]">Read-only analysis. No simulated processing stages.</span><Button variant="secondary" onClick={onCancel}>Cancel request</Button></div>
    </div>
  </div>
}
