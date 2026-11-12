import { cn } from '@/utils/cn'
import { Slot } from '@radix-ui/react-slot'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'subtle'
type Size = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  asChild?: boolean
}

const variants: Record<Variant, string> = {
  primary:
    'bg-[var(--action)] text-[var(--action-ink)] shadow-[0_1px_2px_rgba(16,24,40,0.14),0_8px_18px_-10px_color-mix(in_srgb,var(--action)_70%,transparent)] hover:bg-[var(--action-hover)]',
  secondary:
    'border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]',
  subtle: 'bg-[var(--accent-soft)] text-[var(--accent)] hover:bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]',
  ghost: 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]',
  danger:
    'border border-[color-mix(in_srgb,var(--danger)_26%,transparent)] bg-[color-mix(in_srgb,var(--danger)_6%,transparent)] text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]',
  link: 'px-0 text-[var(--accent)] underline-offset-4 hover:underline',
}

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-[12.5px] [@media(pointer:coarse)]:h-11',
  md: 'h-10 px-4 text-[13px] [@media(pointer:coarse)]:h-11',
  lg: 'h-11 px-5 text-[13.5px]',
  icon: 'h-10 w-10 p-0',
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  asChild,
  type = 'button',
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      type={asChild ? undefined : type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--r-control)] font-medium tracking-[-0.005em] transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45',
        variants[variant],
        variant === 'link' ? 'h-auto p-0' : sizes[size],
        className,
      )}
      {...props}
    />
  )
}
