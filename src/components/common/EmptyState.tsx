import type { ReactNode } from 'react'
import { Check } from 'lucide-react'

export function EmptyState({
  title,
  body,
  action,
  eyebrow = 'No record',
}: {
  title: string
  body: string
  action?: ReactNode
  eyebrow?: string
}) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="border-t border-[var(--line-strong)] pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="tech text-[var(--faint)]">00 / Empty plate</span>
          <span className="tech text-[var(--faint)]">{eyebrow}</span>
        </div>
      </div>
      <div className="relative mt-3 overflow-hidden border border-[var(--line-strong)] bg-[var(--surface)] px-7 py-14 md:px-14">
        <div className="pointer-events-none absolute inset-0 map-grid opacity-40" aria-hidden />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[var(--line-strong)]" aria-hidden />
        <div className="relative">
          <span className="block h-6 w-px bg-[var(--accent)]" aria-hidden />
          <h3 className="display mt-5 max-w-[24ch] text-[clamp(1.8rem,3vw,2.4rem)]">{title}</h3>
          <p className="mt-3 max-w-lg text-[12.5px] leading-relaxed text-[var(--muted)]">{body}</p>
          {action ? <div className="mt-7 flex justify-start">{action}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise fixed right-4 bottom-4 z-[60] flex max-w-sm items-stretch border border-[var(--line-strong)] bg-[var(--elevated)] text-[12.5px] shadow-[var(--shadow-lift)]"
    >
      <span className="flex w-9 shrink-0 items-center justify-center border-r border-[var(--line)] bg-[var(--accent-soft)] text-[var(--accent)]">
        <Check size={13} strokeWidth={2.2} />
      </span>
      <span className="flex-1 px-3 py-2.5">{message}</span>
      <button
        type="button"
        className="flex w-8 items-center justify-center border-l border-[var(--line)] font-mono text-[12px] text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  )
}
