import * as Dialog from '@radix-ui/react-dialog'
import { Copy, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { Banner, Button, Input, toast } from '../../../shared/ui'

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`${what} copied`)
  } catch {
    toast.error(`Could not copy ${what.toLowerCase()}. Select it and copy manually.`)
  }
}

/** Shows a client secret exactly once. Cannot be dismissed until the admin confirms they stored it. */
export function SecretDialog(props: { clientId: string; secret: string; onDone: () => void }) {
  const { clientId, secret, onDone } = props
  const [shown, setShown] = useState(false)
  const [stored, setStored] = useState(false)

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <Dialog.Content
          aria-describedby="secret-desc"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 w-[min(520px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border border-line bg-surface p-6"
        >
          <Dialog.Title className="mb-1 text-[17px] font-semibold">Copy the client secret now</Dialog.Title>
          <Dialog.Description id="secret-desc" className="mb-4 text-text-2">
            It is shown once. Only a hash is kept, so it cannot be shown again.
          </Dialog.Description>
          <Banner tone="warn" title="Share it securely with the institution." />

          <label htmlFor="client-id" className="mb-1.5 block text-[12.5px] font-semibold text-text-2">
            Client ID
          </label>
          <div className="mb-3 flex gap-2">
            <Input id="client-id" readOnly value={clientId} className="num" />
            <Button aria-label="Copy client ID" onClick={() => copy(clientId, 'Client ID')}>
              <Copy className="size-4" />
            </Button>
          </div>

          <label htmlFor="client-secret" className="mb-1.5 block text-[12.5px] font-semibold text-text-2">
            Client secret
          </label>
          <div className="mb-4 flex gap-2">
            <Input id="client-secret" readOnly type={shown ? 'text' : 'password'} value={secret} className="num" />
            <Button aria-label={shown ? 'Hide secret' : 'Show secret'} onClick={() => setShown((s) => !s)}>
              {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
            <Button aria-label="Copy client secret" onClick={() => copy(secret, 'Client secret')}>
              <Copy className="size-4" />
            </Button>
          </div>

          <label className="mb-5 flex items-center gap-2.5">
            <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={stored} onChange={(e) => setStored(e.target.checked)} />I have stored the secret
          </label>
          <div className="flex justify-end">
            <Button variant="primary" disabled={!stored} onClick={onDone}>
              Continue
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
