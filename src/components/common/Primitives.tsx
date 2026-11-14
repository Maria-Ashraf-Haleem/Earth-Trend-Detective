import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import type { TrendDirection } from '@/types'
import { cn } from '@/utils/cn'

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden />
      <span className="label text-[var(--accent)]">{children}</span>
    </span>
  )
}

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
  meta,
  className,
}: {
  eyebrow: string
  title: ReactNode
  lede?: ReactNode
  actions?: ReactNode
  meta?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('relative', className)}>
      <div className="grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0 max-w-4xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="display mt-4 text-[clamp(2.1rem,3.6vw,3.1rem)] text-[var(--ink)]">{title}</h1>
          {lede ? (
            <p className="mt-4 max-w-[58ch] text-[14.5px] leading-relaxed text-[var(--muted)]">{lede}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2.5 lg:pb-1.5">{actions}</div> : null}
      </div>
      {meta ? <div className="mt-7">{meta}</div> : null}
    </header>
  )
}

export function SectionHead({
  title,
  lede,
  action,
  className,
  id,
  index,
}: {
  title: string
  lede?: string
  action?: ReactNode
  className?: string
  id?: string
  index?: string
}) {
  return (
    <div className={cn('', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          {index ? <span className="label shrink-0 text-[var(--accent)]">{index}</span> : null}
          <div className="min-w-0">
            <h2 id={id} className="display text-[clamp(1.25rem,1.8vw,1.55rem)] text-[var(--ink)]">
              {title}
            </h2>
            {lede ? (
              <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-[var(--muted)]">{lede}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="flex items-center gap-2">{action}</div> : null}
      </div>
    </div>
  )
}

export function Tag({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warn' | 'ok' | 'violet'
  className?: string
}) {
  const tones = {
    neutral: 'bg-[var(--surface-2)] text-[var(--muted)]',
    accent: 'bg-[var(--accent-soft)] text-[var(--accent)]',
    warn: 'bg-[color-mix(in_srgb,var(--warn)_12%,transparent)] text-[var(--warn)]',
    ok: 'bg-[color-mix(in_srgb,var(--ok)_12%,transparent)] text-[var(--ok)]',
    violet: 'bg-[color-mix(in_srgb,var(--violet)_12%,transparent)] text-[var(--violet)]',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-[3px] text-[10px] font-medium tracking-[0.05em] uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function TrendMark({
  direction,
  compact = false,
  label,
}: {
  direction: TrendDirection
  compact?: boolean
  label?: string
}) {
  const config = {
    increasing: {
      Icon: ArrowUpRight,
      text: 'Increasing',
      compactText: 'Rising',
      tone: 'text-[var(--warn)]',
      symbol: 'Trending up',
    },
    decreasing: {
      Icon: ArrowDownRight,
      text: 'Decreasing',
      compactText: 'Falling',
      tone: 'text-[var(--accent)]',
      symbol: 'Trending down',
    },
    no_significant_trend: {
      Icon: Minus,
      text: 'No significant trend',
      compactText: 'No trend',
      tone: 'text-[var(--muted)]',
      symbol: 'No significant trend',
    },
  }[direction]
  const { Icon, text, compactText, tone, symbol } = config
  return (
    <span className={cn('relative inline-flex items-center gap-1.5 font-medium', tone)}>
      <Icon size={compact ? 14 : 15} strokeWidth={1.9} aria-hidden />
      <span className="sr-only">{symbol}</span>
      {label ?? (compact ? compactText : text)}
    </span>
  )
}

export function Meter({
  value,
  className,
  tone = 'accent',
}: {
  value: number
  className?: string
  tone?: 'accent' | 'warn' | 'violet'
}) {
  const filled = Math.round(Math.max(0, Math.min(1, value)) * 100)
  const color = tone === 'warn' ? 'var(--warn)' : tone === 'violet' ? 'var(--violet)' : 'var(--accent)'
  return (
    <div
      className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-2)]', className)}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={filled}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ease-out"
        style={{ width: `${filled}%`, background: color }}
      />
    </div>
  )
}

export function ReadoutStrip({
  items,
  columns = 4,
  className,
}: {
  items: {
    label: string
    value: ReactNode
    detail?: ReactNode
    tone?: 'accent' | 'warn' | 'violet' | 'neutral'
  }[]
  columns?: 2 | 3 | 4
  className?: string
}) {
  const gridClass = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-3',
    4: 'sm:grid-cols-2 xl:grid-cols-4',
  }[columns]
  const toneClass = {
    accent: 'text-[var(--accent)]',
    warn: 'text-[var(--warn)]',
    violet: 'text-[var(--violet)]',
    neutral: 'text-[var(--ink)]',
  }
  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <dl className={cn('grid gap-px bg-[var(--line)]', gridClass)}>
        {items.map((item) => (
          <div key={item.label} className="bg-[var(--surface)] px-5 py-5">
            <dt className="label">{item.label}</dt>
            <dd className={cn('num mt-2 text-[24px] leading-none tracking-[-0.03em]', toneClass[item.tone ?? 'neutral'])}>
              {item.value}
            </dd>
            {item.detail ? (
              <dd className="mt-2 max-w-[36ch] text-[11.5px] leading-relaxed text-[var(--muted)]">{item.detail}</dd>
            ) : null}
          </div>
        ))}
      </dl>
    </div>
  )
}

export function DataNote({ children, label = 'Data context' }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[var(--r-card)] border border-[color-mix(in_srgb,var(--warn)_22%,transparent)] bg-[color-mix(in_srgb,var(--warn)_6%,transparent)] px-4 py-3.5 sm:flex-row sm:gap-4">
      <p className="label shrink-0 pt-0.5 whitespace-nowrap text-[var(--warn)]">{label}</p>
      <p className="text-[12px] leading-relaxed text-[var(--muted)]">{children}</p>
    </div>
  )
}

export function KeyValue({ label, value, className }: { label: string; value: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-3 last:border-0',
        className,
      )}
    >
      <dt className="text-[12.5px] text-[var(--muted)]">{label}</dt>
      <dd className="num text-right text-[12.5px] text-[var(--ink)]">{value}</dd>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  ariaLabel,
  className,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string; disabled?: boolean }[]
  size?: 'sm' | 'md'
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('inline-flex rounded-full bg-[var(--surface-2)] p-1', className)}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            disabled={option.disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'rounded-full font-medium transition-all duration-200 disabled:opacity-40',
              size === 'sm' ? 'min-h-6 px-2.5 text-[10.5px]' : 'min-h-8 px-3.5 text-[12px]',
              active
                ? 'bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgba(16,24,40,0.10)]'
                : 'text-[var(--muted)] hover:text-[var(--ink)]',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Frame for maps, charts and other data figures. Everything lives inside one
 * soft card: title, plot, source note.
 */
export function FigureFrame({
  label,
  meta,
  caption,
  children,
  className,
  bodyClassName,
  id,
}: {
  label: string
  meta?: ReactNode
  caption?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  id?: string
}) {
  return (
    <figure
      id={id}
      className={cn(
        'overflow-hidden rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-card)]',
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 px-5 pt-4 pb-3">
        <span className="text-[13px] font-medium text-[var(--ink)]">{label}</span>
        {meta ? <span className="text-[11.5px] text-[var(--faint)]">{meta}</span> : null}
      </figcaption>
      <div className={cn('min-w-0', bodyClassName)}>{children}</div>
      {caption ? (
        <p className="border-t border-[var(--line)] px-5 py-3 text-[11.5px] leading-relaxed text-[var(--muted)]">
          {caption}
        </p>
      ) : null}
    </figure>
  )
}
