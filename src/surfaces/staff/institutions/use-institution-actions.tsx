import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ApiError, errorMessage } from '../../../shared/api/client'
import { ConfirmDialog, Textarea, toast } from '../../../shared/ui'
import type { ActionId } from './actions'
import { useRegisterCertificate, useTenantAction, type TenantAction } from './api/hooks'
import { CertificateDrawer } from './certificate-drawer'
import type { Institution } from './types'

type Confirm = { title: string; text: (n: string) => string; label: string; danger?: boolean; reason?: boolean; done: string }

const confirmCopy: Record<TenantAction, Confirm> = {
  activate: { title: 'Activate institution?', text: (n) => `${n} will go live and can use Secure Bangla QR.`, label: 'Activate', done: 'Institution activated' },
  suspend: { title: 'Suspend institution?', text: (n) => `${n} will stop being able to generate and validate QR codes until it is reactivated.`, label: 'Suspend', reason: true, done: 'Institution suspended' },
  reactivate: { title: 'Reactivate institution?', text: (n) => `${n} will be able to use Secure Bangla QR again, with its key and credentials restored.`, label: 'Reactivate', done: 'Institution reactivated' },
  terminate: { title: 'Terminate institution?', text: (n) => `${n} will be closed permanently. This cannot be undone, and its key and credentials stop working.`, label: 'Terminate', danger: true, reason: true, done: 'Institution terminated' },
}

/** The API's refusal, with the unmet preconditions (if it listed any) spelled out. */
function refusal(e: unknown) {
  const blockers = e instanceof ApiError ? e.blockers.map((b) => b.message) : []
  return [errorMessage(e), ...blockers].join(' ')
}

/**
 * Runs an institution action against the API. Returns `run` to start one and `dialogs` to render
 * once on the page (confirmation, reason box, certificate drawer). Lists and detail refresh on
 * their own: every mutation refetches the tenant queries before it resolves.
 */
export function useInstitutionActions(): {
  run: (inst: Institution, action: ActionId) => void
  dialogs: ReactNode
} {
  const navigate = useNavigate()
  const tenantAction = useTenantAction()
  const registerCertificate = useRegisterCertificate()
  const [pending, setPending] = useState<{ inst: Institution; action: TenantAction } | null>(null)
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
              {copy.reason && (
                <Textarea aria-label="Reason (optional)" placeholder="Reason (optional)" className="mt-3 min-h-20" value={reason} onChange={(e) => setReason(e.target.value)} />
              )}
            </>
          }
          confirmLabel={copy.label}
          danger={copy.danger}
          onConfirm={() => {
            const { inst, action } = pending
            tenantAction.mutate(
              { id: inst.id, action, reason },
              {
                onSuccess: () => toast.success(copy.done),
                onError: (e) => toast.error(refusal(e)),
                onSettled: () => setPending(null),
              },
            )
          }}
        />
      )}
      <CertificateDrawer
        open={!!certFor}
        name={certFor?.name ?? ''}
        onClose={() => setCertFor(null)}
        onSave={(certificate) => {
          if (!certFor) return
          registerCertificate.mutate(
            { id: certFor.id, certificate },
            {
              onSuccess: () => {
                toast.success('Certificate replaced')
                setCertFor(null)
              },
              onError: (e) => toast.error(refusal(e)),
            },
          )
        }}
      />
    </>
  )
  return { run, dialogs }
}
