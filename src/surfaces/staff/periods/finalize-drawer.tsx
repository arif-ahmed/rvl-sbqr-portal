import { Lock } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../../shared/api/client'
import type { Session } from '../../../shared/auth/session'
import { bdt, bdtSigned, periodName } from '../../../shared/format'
import { Banner, Button, Drawer, Field, Input, toast } from '../../../shared/ui'
import type { Period, PeriodTotals } from '../../../shared/billing/billing'
import { useFinalizePeriod } from '../billing/api/hooks'

/** The typed-total keeps a reviewed month and a changed month from both being "approved". */
const matches = (typed: string, total: number) => parseFloat(typed.replace(/,/g, '')) === total

/**
 * Month close as a deliberate act: review the totals, retype the expected total, then the month
 * locks and its pending adjustments settle onto the statements. The API refuses when usage is still
 * outstanding or when the totals changed since review.
 */
export function FinalizeDrawer({ period, totals, session, onClose }: { period: Period; totals: PeriodTotals; session: Session; onClose: () => void }) {
  const [typed, setTyped] = useState('')
  const [blocked, setBlocked] = useState(false)
  const finalize = useFinalizePeriod()
  const ready = typed !== '' && matches(typed, totals.total)

  const confirm = () =>
    finalize.mutate(
      { period, expectedTotal: totals.total, finalizedBy: session.userId },
      {
        onSuccess: (outcome) => {
          if (outcome === 'Finalized') {
            toast.success(`${periodName(period)} finalized`)
            onClose()
            return
          }
          if (outcome === 'UsageNotComplete') {
            setBlocked(true)
            return
          }
          if (outcome === 'DraftChanged') toast.error('Totals changed since review. The draft was rebuilt: review the new total, then try again.')
          else if (outcome === 'PeriodNotReady') toast.error('This month has no draft yet. Create the draft first.')
          else toast.success('This period was already finalized.')
          onClose()
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not finalize the period.')),
      },
    )

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Finalize ${periodName(period)}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ready || finalize.isPending} onClick={confirm}>
            Finalize period
          </Button>
        </>
      }
    >
      <Banner tone="warn" title="This cannot be undone">
        The month locks for all {totals.statements.length} institutions at once and the statements become the billing record.
      </Banner>

      {blocked && (
        <Banner tone="bad" title="Usage not complete">
          Some usage events have not been recorded yet. Close this panel, requeue any dead-lettered events from the banner on the page, wait for the rest to be delivered, then try again.
        </Banner>
      )}

      <dl className="mb-6 grid grid-cols-[1fr_auto] gap-x-6 gap-y-3">
        <dt className="text-text-2">Subtotal</dt>
        <dd className="num text-right">{bdt(totals.subtotal)}</dd>
        <dt className="text-text-2">Adjustments (net)</dt>
        <dd className="num text-right">{totals.adjustmentsTotal ? bdtSigned(totals.adjustmentsTotal) : bdt(0)}</dd>
        <dt className="font-bold">Total to finalize</dt>
        <dd className="num text-right font-bold">{bdt(totals.total)}</dd>
        <dt className="text-text-2">Statements (one per institution)</dt>
        <dd className="num text-right">{totals.statements.length}</dd>
      </dl>

      <Field
        label="Confirm expected total (৳)"
        htmlFor="finalize-total"
        error={typed && !ready ? 'Does not match the period total.' : undefined}
        hint="Type the total above. If usage changes before you confirm, finalize is rejected."
      >
        <Input
          id="finalize-total"
          inputMode="decimal"
          autoComplete="off"
          placeholder={String(totals.total)}
          className="num"
          aria-invalid={!!typed && !ready}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </Field>

      <Field label="Finalized by" htmlFor="finalize-by" hint="Taken from your signed-in credential.">
        <Input id="finalize-by" value={session.userId} readOnly />
      </Field>

      <p className="flex items-center gap-2 text-[12.5px] text-text-3">
        <Lock className="size-4 shrink-0" aria-hidden /> After finalize, corrections go into a later period as adjustments.
      </p>
    </Drawer>
  )
}
