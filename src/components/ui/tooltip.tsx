import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { ReactNode } from 'react'

export function Hint({ content, children }: { content: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={7}
          className="z-[70] max-w-[280px] border border-[var(--line)] bg-[var(--elevated)] px-3 py-2 text-[11px] leading-relaxed text-[var(--ink)] shadow-[var(--shadow-lift)]"
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-[var(--elevated)]" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
