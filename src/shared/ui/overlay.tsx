import * as AlertDialog from '@radix-ui/react-alert-dialog'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../cn'
import { Button } from './button'

const scrim = 'fixed inset-0 z-40 bg-black/55'

/** Right-side panel for forms and details. Esc and scrim close it. */
export function Drawer(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  wide?: boolean
  footer?: ReactNode
  children: ReactNode
}) {
  const { open, onOpenChange, title, wide, footer, children } = props
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={scrim} />
        <Dialog.Content
          aria-describedby={undefined}
          className={cn('fixed top-0 right-0 bottom-0 z-50 flex w-full flex-col border-l border-line bg-surface', wide ? 'max-w-[620px]' : 'max-w-[480px]')}
        >
          <header className="flex items-center justify-between border-b border-line px-[22px] py-4">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="ghost" size="sm" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </header>
          <div className="flex-1 overflow-auto p-[22px]">{children}</div>
          {footer && <footer className="flex justify-end gap-2.5 border-t border-line px-[22px] py-4">{footer}</footer>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Confirmation only. `danger` makes the confirm button solid red. */
export function ConfirmDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
}) {
  const { open, onOpenChange, title, description, confirmLabel, danger, onConfirm } = props
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={scrim} />
        <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(460px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-surface p-6">
          <AlertDialog.Title className="mb-2 text-[17px] font-semibold">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mb-5 text-text-2">{description}</AlertDialog.Description>
          <div className="flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button>Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={danger ? 'dangerSolid' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
