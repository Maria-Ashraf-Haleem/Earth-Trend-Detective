import type { TrendDirection } from '@/types'

export function formatNumber(value: number, digits = 2) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatPValue(value: number) {
  if (!Number.isFinite(value)) return '—'
  if (value < 0.001) return '< 0.001'
  return value.toFixed(3)
}

export function formatPercent(value: number, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`
}

export function formatSlope(value: number) {
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, 3)} °C / yr`
}

export function trendLabel(direction: TrendDirection) {
  if (direction === 'increasing') return 'Increasing'
  if (direction === 'decreasing') return 'Decreasing'
  return 'No statistically significant trend'
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function formatMonth(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export function downloadTextFile(filename: string, mimeType: string, contents: string) {
  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
