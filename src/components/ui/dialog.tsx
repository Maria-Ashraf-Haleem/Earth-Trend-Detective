import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  width = '580px',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  width?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--bg-deep)_78%,transparent)]" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 z-50 max-h-[86vh] w-[min(var(--modal-w),calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow-lift)]"
          style={{ ['--modal-w' as string]: width }}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--line-strong)] px-5 py-4">
            <div className="min-w-0">
              <Dialog.Title className="display text-[clamp(1.4rem,2.4vw,1.8rem)] leading-tight">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-1 text-[11.5px] leading-relaxed text-[var(--muted)]">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close
              className="flex h-7 w-7 shrink-0 items-center justify-center border border-[var(--line)] text-[var(--faint)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              aria-label="Close dialog"
            >
              <X size={14} />
            </Dialog.Close>
          </div>
          <div className="px-5 py-5">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  tone = 'danger',
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel: string
  onConfirm: () => void
  tone?: 'danger' | 'primary'
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-[color-mix(in_srgb,var(--bg-deep)_78%,transparent)]" />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(440px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 border border-[var(--line-strong)] bg-[var(--surface)] p-6 shadow-[var(--shadow-lift)]">
          <p className="kicker text-[var(--faint)]">Confirm action</p>
          <AlertDialog.Title className="display mt-2 text-[clamp(1.4rem,2.4vw,1.8rem)] leading-tight">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
            {description}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2 border-t border-[var(--line)] pt-4">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary" size="sm">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
