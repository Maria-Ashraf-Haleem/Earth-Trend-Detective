import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactNode } from 'react'
import { Hint } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'

export function Field({
  label,
  hint,
  children,
  htmlFor,
}: {
  label: string
  hint?: string
  children: ReactNode
  htmlFor?: string
}) {
  const generatedId = useId()
  const element = isValidElement<{ id?: string }>(children) ? children : null
  const controlId = htmlFor || element?.props.id || generatedId
  return (
    <div className="block space-y-1.5">
      <div className="label flex items-center gap-1">
        <label htmlFor={controlId}>{label}</label>
        {hint ? (
          <Hint content={hint}>
            <button
              type="button"
              className="-m-1 flex h-6 w-6 items-center justify-center rounded-full text-[var(--faint)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--accent)]"
              aria-label={`About ${label}`}
            >
              <Info size={12} />
            </button>
          </Hint>
        ) : null}
      </div>
      {element ? cloneElement(element, { id: controlId }) : children}
    </div>
  )
}

const control =
  'w-full rounded-[var(--r-control)] border border-[var(--line)] bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--ink)] transition-[border-color,background-color,box-shadow] duration-150 placeholder:text-[var(--faint)] hover:border-[var(--line-strong)] focus:border-[var(--accent)] focus:bg-[var(--elevated)] focus:shadow-[0_0_0_4px_var(--accent-soft)] focus:outline-none'

export function SelectField({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
  id,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string; disabled?: boolean }[]
  disabled?: boolean
  ariaLabel?: string
  id?: string
}) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      className={`${control} disabled:cursor-not-allowed disabled:opacity-55`}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${control} ${className ?? ''}`} />
}

export function DemoMark({ label = 'Demo data' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] px-2 py-[3px] text-[10px] font-medium tracking-[0.05em] uppercase text-[var(--warn)]">
      <span className="h-1 w-1 rounded-full bg-current" aria-hidden />
      {label}
    </span>
  )
}
