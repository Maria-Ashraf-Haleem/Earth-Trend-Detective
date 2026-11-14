import { AlertTriangle, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/services/api/client'

const ERROR_TITLES: Record<string, string> = { network: 'Backend unavailable',
  database_unavailable: 'Database unavailable', external_provider_unavailable: 'External provider unavailable',
  timeout: 'Request timed out', invalid_response: 'Invalid service response' }

export function LiveDataState({ loading, error, onRetry, onCancel, message = 'Reading certified observations. Regional queries can take several seconds.' }: {
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  onCancel?: () => void
  message?: string
}) {
  if (!loading && !error) return null
  const title = error instanceof ApiError ? (ERROR_TITLES[error.code] ?? 'Request failed') : 'Request failed'
  return (
    <div className="rounded-[var(--r-card)] border border-[var(--line)] bg-[var(--surface)] px-5 py-4" role={error ? 'alert' : 'status'} aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        {error ? <AlertTriangle size={17} className="text-[var(--warn)]" /> : <LoaderCircle size={17} className="animate-spin text-[var(--accent)]" />}
        <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--muted)]">
          {error ? <><strong className="block font-medium text-[var(--ink)]">{title}</strong>{error instanceof Error ? error.message : 'The environmental service could not complete this request.'}</> : message}
        </p>
        {error && onRetry ? <Button variant="secondary" size="sm" onClick={onRetry}>Try again</Button> : null}
        {loading && onCancel ? <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button> : null}
      </div>
    </div>
  )
}

export function environmentalUnit(unit: string) {
  return unit === 'degC' ? '°C' : unit === 'm2' ? 'm²' : unit
}

export function nullableNumber(value: number | null | undefined, digits = 2) {
  return value == null || !Number.isFinite(value) ? 'Unavailable' : value.toLocaleString(undefined, { maximumFractionDigits: digits })
}
