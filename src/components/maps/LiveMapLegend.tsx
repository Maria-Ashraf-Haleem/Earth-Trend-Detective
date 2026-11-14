import { gradientCss, TEMPERATURE_RAMP } from '@/utils/color'

export function LiveMapLegend({ values, unit, label = 'Observed source value' }: {
  values: ReadonlyMap<number, number | null>
  unit: string
  label?: string
}) {
  const finite = [...values.values()].filter((value): value is number => value !== null && Number.isFinite(value))
  const missing = [...values.values()].filter((value) => value === null).length
  const displayUnit = unit === 'degC' ? '\u00b0C' : unit === 'm2' ? 'm\u00b2' : unit
  return (
    <div className="max-w-[280px] bg-[var(--surface)] px-3 py-3">
      <p className="text-[11px] font-medium text-[var(--ink)]">{label}</p>
      {finite.length ? <>
        <div className="mt-2 h-2 rounded-full" style={{ background: gradientCss(TEMPERATURE_RAMP) }} />
        <div className="num mt-1 flex justify-between text-[10px] text-[var(--muted)]">
          <span>{Math.min(...finite).toFixed(2)} {displayUnit}</span><span>{Math.max(...finite).toFixed(2)} {displayUnit}</span>
        </div>
      </> : <p className="mt-1 text-[11px] text-[var(--muted)]">No nonmissing values in this page.</p>}
      <p className="mt-2 text-[10px] text-[var(--muted)]">{finite.length} nonmissing | {missing} NULL loaded observations</p>
      <p className="mt-2 text-[10px] leading-relaxed text-[var(--faint)]">Range is for loaded values only. Gray points have missing or unloaded values. Points are source cell centers; the outline is their regional bounding box.</p>
    </div>
  )
}
