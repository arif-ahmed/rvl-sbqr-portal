import { useState } from 'react'
import { Banner, Button, ConfirmDialog, Drawer, SwitchRow, toast } from '../../../shared/ui'
import { demoCredentials, demoSecret } from './credentials'
import { patchInstitution, useInstitutions } from './store'
import type { Access } from './types'

/**
 * Post-issue credential management for one institution: what the credentials may do, a fresh
 * secret when the old one is lost, and a fresh pair when the client ID itself must change.
 * UI only: patches the in-memory store; the API will enforce the same rules.
 */
export function CredentialsDrawer(props: { institutionId: string; onClose: () => void; onIssued: (access: Access, secret: string) => void }) {
  const { institutionId, onClose, onIssued } = props
  const inst = useInstitutions().find((i) => i.id === institutionId)
  const [confirm, setConfirm] = useState<'rotate' | 'regenerate' | null>(null)
  if (!inst?.access) return null
  const access = inst.access

  /** Capabilities apply immediately; the last one cannot be turned off. */
  function toggle(kind: 'generation' | 'validation', next: boolean) {
    const other = kind === 'generation' ? access.validation : access.generation
    if (!next && !other) return toast.error('Keep at least one capability on.')
    patchInstitution(institutionId, { access: { ...access, [kind]: next } })
    toast.success(`${kind === 'generation' ? 'QR generation' : 'QR validation'} ${next ? 'enabled' : 'disabled'}`)
  }

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title="Manage credentials">
      <p className="mb-5 text-text-2">
        {inst.name} · client ID <span className="num">{access.clientId}</span>. Capability changes apply the next time the
        institution&rsquo;s gateway connects.
      </p>

      <div className="flex flex-col gap-3">
        <SwitchRow
          id="cred-generation"
          label="QR generation"
          description="Create Secure Bangla QR codes (scope qr:generate)."
          checked={access.generation}
          onChange={(v) => toggle('generation', v)}
        />
        <SwitchRow
          id="cred-validation"
          label="QR validation"
          description="Verify Secure Bangla QR codes (scope qr:validate)."
          checked={access.validation}
          onChange={(v) => toggle('validation', v)}
        />
      </div>
      {access.generation && !inst.keyMode && (
        <Banner tone="info" title="Signing key needed">
          This institution has no signing key yet, so it cannot generate QR codes until one is created.
        </Banner>
      )}

      <div className="mt-6 border-t border-line pt-5">
        <h4 className="mb-1 text-[13px] font-semibold">Client secret</h4>
        <p className="mb-3 text-[13px] text-text-2">
          If the secret is lost or may have leaked, replace it. The institution keeps its client ID; the old secret stops
          working the moment a new one is issued.
        </p>
        <Button onClick={() => setConfirm('rotate')}>Rotate client secret</Button>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <h4 className="mb-1 text-[13px] font-semibold">Client ID and secret</h4>
        <p className="mb-3 text-[13px] text-text-2">
          Replace the whole credential pair — for example when the client ID itself was exposed. The old client ID stops
          working immediately; usage history and statements keep referring to the institution.
        </p>
        <Button variant="danger" onClick={() => setConfirm('regenerate')}>
          Regenerate client ID and secret
        </Button>
      </div>

      {confirm === 'rotate' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Rotate client secret?"
          description={
            <>
              The client ID stays <span className="num">{access.clientId}</span>. The old secret stops working immediately —
              the institution&rsquo;s gateway cannot connect until it is given the new one.
            </>
          }
          confirmLabel="Rotate secret"
          onConfirm={() => {
            setConfirm(null)
            onIssued({ ...access }, demoSecret())
          }}
        />
      )}
      {confirm === 'regenerate' && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title="Regenerate client ID and secret?"
          description={<>Both are replaced with a fresh pair and the old client ID stops working immediately. This cannot be undone.</>}
          confirmLabel="Regenerate"
          danger
          onConfirm={() => {
            const c = demoCredentials(inst.code)
            setConfirm(null)
            onIssued({ ...access, clientId: c.clientId }, c.secret)
          }}
        />
      )}
    </Drawer>
  )
}
