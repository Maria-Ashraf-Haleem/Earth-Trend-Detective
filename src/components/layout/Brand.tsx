import { cn } from '@/utils/cn'

export function BrandMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'relative grid shrink-0 place-items-center overflow-hidden rounded-[9px] bg-[var(--action)] text-[var(--action-ink)]',
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="8.2" stroke="currentColor" strokeWidth="1.4" opacity="0.95" />
        <ellipse cx="16" cy="16" rx="12.4" ry="4.6" stroke="currentColor" strokeWidth="1.1" opacity="0.6" transform="rotate(-24 16 16)" />
        <circle cx="23.6" cy="9.4" r="1.7" fill="currentColor" />
      </svg>
    </span>
  )
}

export function BrandLockup({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={compact ? 26 : 28} />
      <div className="min-w-0">
        <p className="font-display text-[16px] leading-none font-semibold tracking-[-0.03em] text-[var(--ink)]">
          EarthTrend <span className="font-normal text-[var(--muted)]">Lab</span>
        </p>
        {compact ? null : (
          <p className="mt-1 hidden text-[10.5px] leading-none font-medium tracking-[0.02em] text-[var(--faint)] sm:block">
            Earth observation workspace
          </p>
        )}
      </div>
    </div>
  )
}
