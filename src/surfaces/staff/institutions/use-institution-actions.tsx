import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog, Textarea, toast } from '../../../shared/ui'
import { SecretDialog } from '../onboarding/secret-dialog'
import { cardFor, currentMonth } from '../rates/rates'
import { useRateCards } from '../rates/store'
import type { ActionId } from './actions'
import { CertificateDrawer } from './certificate-drawer'
import { CredentialsDrawer } from './credentials-drawer'
import { patchInstitution } from './store'
import type { Access, Institution, InstitutionStatus } from './types'

type Confirm = { title: string; text: (n: string) => string; label: string; danger?: boolean; reason?: boolean; to: InstitutionStatus; done: string }

const confirmCopy: Partial<Record<ActionId, Confirm>> = {
  activate: { title: 'Activate institution?', text: (n) => `${n} will go live and can use Secure Bangla QR.`, label: 'Activate', to: 'Active', done: 'Institution activated' },
  suspend: { title: 'Suspend institution?', text: (n) => `${n} will stop being able to generate and validate QR codes until it is reactivated.`, label: 'Suspend', reason: true, to: 'Suspended', done: 'Institution suspended' },
  reactivate: { title: 'Reactivate institution?', text: (n) => `${n} will be able to use Secure Bangla QR again, with its key and credentials restored.`, label: 'Reactivate', to: 'Active', done: 'Institution reactivated' },
  terminate: { title: 'Terminate institution?', text: (n) => `${n} will be closed permanently. This cannot be undone, and its key and credentials stop working.`, label: 'Terminate', danger: true, reason: true, to: 'Terminated', done: 'Institution terminated' },
}

/**
 * Runs an institution action. Returns `run` to start one, `manageCredentials` to open the
 * credential manager, and `dialogs` to render once on the page (confirmation, reason box,
 * certificate drawer, credential rotation). UI only: changes the in-memory store.
 */
export function useInstitutionActions(): {
  run: (inst: Institution, action: ActionId) => void
  manageCredentials: (institutionId: string) => void
  dialogs: ReactNode
} {
  const navigate = useNavigate()
  const rateCards = useRateCards()
  const [pending, setPending] = useState<{ inst: Institution; action: ActionId } | null>(null)
  const [reason, setReason] = useState('')
  const [certFor, setCertFor] = useState<Institution | null>(null)
  const [credId, setCredId] = useState<string | null>(null)
  const [issued, setIssued] = useState<{ clientId: string; secret: string } | null>(null)

  function run(inst: Institution, action: ActionId) {
    if (action === 'continue') return navigate(`/staff/institutions/new?resume=${inst.id}`)
    if (action === 'certificate') return setCertFor(inst)
    // No card in effect, no going live: usage would be recorded but never billed.
    if (action === 'activate' && !cardFor(rateCards, inst.id, currentMonth()))
      return toast.error('No rate card in effect. Complete the Rate card step of setup, or schedule a card from Rates, before activating.')
    setReason('')
    setPending({ inst, action })
  }

  const copy = pending ? confirmCopy[pending.action] : undefined
  const dialogs = (
    <>
      {copy && pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={copy.title}
          description={
            <>
              {copy.text(pending.inst.name)}
              {copy.reason && (
                <Textarea aria-label="Reason (optional)" placeholder="Reason (optional)" className="mt-3 min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
            </>
          }
          confirmLabel={copy.label}
          danger={copy.danger}
          onConfirm={() => {
            patchInstitution(pending.inst.id, { status: copy.to })
            toast.success(copy.done)
            setPending(null)
          }}
        />
      )}
      <CertificateDrawer
        open={!!certFor}
        name={certFor?.name ?? ''}
        onClose={() => setCertFor(null)}
        onSave={(c) => {
          if (certFor) patchInstitution(certFor.id, { certificate: c })
          toast.success('Certificate replaced')
          setCertFor(null)
        }}
      />
      {credId && (
        <CredentialsDrawer
          key={credId}
          institutionId={credId}
          onClose={() => setCredId(null)}
          onIssued={(access: Access, secret: string) => {
            patchInstitution(credId, { access })
            setIssued({ clientId: access.clientId, secret })
            setCredId(null)
          }}
        />
      )}
      {issued && <SecretDialog clientId={issued.clientId} secret={issued.secret} onDone={() => setIssued(null)} />}
    </>
  )
  return { run, manageCredentials: setCredId, dialogs }
}
