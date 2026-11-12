import { RUN_STEPS } from '@/config'
import type { ExperimentConfiguration } from '@/types'
import { regions, variables } from '@/data/mock/catalog'
// avoid-ai-design-ignore: I3 Check marks completed pipeline steps
import { Check, Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'

export function RunProgress({
  open,
  configuration,
  progressIndex,
}: {
  open: boolean
  configuration: ExperimentConfiguration | null
  progressIndex: number
}) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!open) {
      setElapsed(0)
      return
    }
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [open])

  if (!open) return null
  const activeIndex = Math.min(progressIndex + 1, RUN_STEPS.length)
  const percent = Math.round((activeIndex / RUN_STEPS.length) * 100)
  const region = regions.find((item) => item.id === configuration?.regionId)
  const variable = variables.find((item) => item.id === configuration?.variableId)

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[color-mix(in_srgb,var(--bg-deep)_82%,transparent)] p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Analysis running"
    >
      <div className="w-full max-w-[700px] border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-lift)]">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--line-strong)] px-5 py-2.5">
          <p className="flex items-center gap-2 font-mono text-[8.5px] tracking-[0.14em] uppercase text-[var(--warn)]">
            <span className="h-1.5 w-1.5 animate-pulse-dot bg-[var(--warn)]" aria-hidden />
            Demo simulation · no NASA processing
          </p>
          <span className="num text-[10px] text-[var(--faint)]">
            {String(Math.floor(elapsed / 60)).padStart(2, '0')}:{String(elapsed % 60).padStart(2, '0')}
          </span>
        </div>

        <div className="px-5 py-6 md:px-7 md:py-7">
          <div className="grid gap-x-8 gap-y-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">
              <p className="tech text-[var(--faint)]">Protocol executing</p>
              <h2 className="display mt-2 text-[clamp(1.9rem,4vw,2.7rem)] leading-none">Running the analysis.</h2>
              <p className="mt-2 truncate text-[11.5px] text-[var(--muted)]">
                {configuration?.name ?? 'Experiment'} · {region?.name} · {variable?.shortName}
              </p>
            </div>
            <div className="flex items-baseline gap-1 md:justify-end">
              <span className="num text-[clamp(2.4rem,5vw,3.4rem)] leading-none">{percent}</span>
              <span className="num text-[12px] text-[var(--faint)]">%</span>
            </div>
          </div>

          <div className="mt-6 h-1 w-full bg-[var(--line)]" aria-hidden>
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>

          <ol className="mt-6 border-t border-[var(--line-strong)]">
            {RUN_STEPS.map((step, index) => {
              const done =
                index < activeIndex - 1 || (progressIndex >= RUN_STEPS.length && index < RUN_STEPS.length)
              const active = index === activeIndex - 1 && progressIndex < RUN_STEPS.length
              return (
                <li
                  key={step.label}
                  className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-start gap-3 border-b border-[var(--line)] py-3"
                >
                  <span className="num pt-0.5 text-[9px] text-[var(--faint)]">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={`flex items-center gap-2 text-[12.5px] ${
                        done || active ? 'text-[var(--ink)]' : 'text-[var(--faint)]'
                      }`}
                    >
                      {done ? (
                        <Check size={11} strokeWidth={2.6} className="text-[var(--accent)]" />
                      ) : active ? (
                        <Loader2 size={11} className="animate-spin text-[var(--violet)]" />
                      ) : null}
                      {step.label}
                    </span>
                    <span
                      className={`mt-0.5 block text-[10px] leading-relaxed ${
                        active ? 'text-[var(--muted)]' : 'text-[var(--faint)]'
                      }`}
                    >
                      {step.detail}
                    </span>
                  </span>
                  <span
                    className={`pt-0.5 font-mono text-[8.5px] tracking-[0.12em] uppercase ${
                      active ? 'text-[var(--violet)]' : done ? 'text-[var(--accent)]' : 'text-[var(--faint)]'
                    }`}
                  >
                    {done ? 'Done' : active ? 'Active' : 'Queued'}
                  </span>
                </li>
              )
            })}
          </ol>

          <p className="mt-4 max-w-[66ch] text-[10px] leading-relaxed text-[var(--faint)]">
            A frontend simulation over the illustrative demo series. It demonstrates the intended FastAPI job lifecycle;
            it does not retrieve or process satellite data.
          </p>
        </div>
      </div>
    </div>
  )
}
