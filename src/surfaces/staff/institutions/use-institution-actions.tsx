import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ConfirmDialog, Textarea, toast } from '../../../shared/ui'
import type { ActionId } from './actions'
import { CertificateDrawer } from './certificate-drawer'
import { currentMonth, priceGaps } from '../rates/rates'
import { useRateCards } from '../rates/store'
import { patchInstitution } from './store'
import type { Institution, InstitutionStatus } from './types'

type Confirm = { title: string; text: (n: string) => string; label: string; danger?: boolean; reason?: boolean; to: InstitutionStatus; done: string }

const confirmCopy: Partial<Record<ActionId, Confirm>> = {
  activate: { title: 'Activate institution?', text: (n) => `${n} will go live and can use Secure Bangla QR.`, label: 'Activate', to: 'Active', done: 'Institution activated' },
  suspend: { title: 'Suspend institution?', text: (n) => `${n} will stop being able to generate and validate QR codes until it is reactivated.`, label: 'Suspend', reason: true, to: 'Suspended', done: 'Institution suspended' },
  reactivate: { title: 'Reactivate institution?', text: (n) => `${n} will be able to use Secure Bangla QR again, with its key and credentials restored.`, label: 'Reactivate', to: 'Active', done: 'Institution reactivated' },
  terminate: { title: 'Terminate institution?', text: (n) => `${n} will be closed permanently. This cannot be undone, and its key and credentials stop working.`, label: 'Terminate', danger: true, reason: true, to: 'Terminated', done: 'Institution terminated' },
}

/**
 * Runs an institution action. Returns `run` to start one and `dialogs` to render once on the page
 * (confirmation, reason box, certificate drawer). UI only: changes the in-memory store.
 */
export function useInstitutionActions(): { run: (inst: Institution, action: ActionId) => void; dialogs: ReactNode } {
  const navigate = useNavigate()
  const rateCards = useRateCards()
  const [pending, setPending] = useState<{ inst: Institution; action: ActionId } | null>(null)
  const [reason, setReason] = useState('')
  const [certFor, setCertFor] = useState<Institution | null>(null)

  function run(inst: Institution, action: ActionId) {
    if (action === 'continue') return navigate(`/staff/institutions/new?resume=${inst.id}`)
    if (action === 'certificate') return setCertFor(inst)
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
              {pending.action === 'activate' && priceGaps(pending.inst.access, rateCards, pending.inst.id, currentMonth()).some((g) => g.reason === 'no-card') && (
                <span className="mt-2 block">There is no rate card yet, so usage will be recorded but not billed until one starts.</span>
              )}
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
    </>
  )
  return { run, dialogs }
}
