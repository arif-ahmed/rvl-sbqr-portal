import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { errorMessage } from '../../../shared/api/client'
import type { Session } from '../../../shared/auth/session'
import { periodName } from '../../../shared/format'
import { draftPeriod, type BillingData } from '../../../shared/billing/billing'
import { Button, Drawer, Field, Input, Select, Textarea, toast } from '../../../shared/ui'
import { useAddAdjustment } from '../billing/api/hooks'
import { adjustmentSchema, type AdjustmentForm } from './adjustment'

const empty: AdjustmentForm = { institutionId: '', amount: '', reason: '' }

/**
 * Record a credit or charge. The API settles it onto the oldest month that is not finalized yet, so the
 * form has no period: it says which month that is. Any institution may receive one; if it has no statement
 * in that month the adjustment simply waits.
 */
export function NewAdjustmentDrawer({ open, onClose, session, billing }: { open: boolean; onClose: () => void; session: Session; billing: BillingData }) {
  const add = useAddAdjustment()
  const target = draftPeriod(billing)
  const form = useForm<AdjustmentForm>({ resolver: zodResolver(adjustmentSchema), defaultValues: empty })
  const { errors } = form.formState

  const close = () => {
    form.reset(empty)
    onClose()
  }

  const save = form.handleSubmit((v) =>
    add.mutate(
      { institutionId: v.institutionId, amount: Number(v.amount), reason: v.reason, createdBy: session.userId },
      {
        onSuccess: () => {
          toast.success('Adjustment recorded')
          close()
        },
        onError: (e) => toast.error(errorMessage(e, 'Could not record the adjustment.')),
      },
    ),
  )

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Record adjustment"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={add.isPending} onClick={save}>
            Record adjustment
          </Button>
        </>
      }
    >
      <p className="mb-4 text-text-2">
        {target ? `It settles onto the statement when ${periodName(target)} is finalized.` : 'It settles onto the next month that is finalized.'} After that it cannot be
        changed or removed.
      </p>
      <Field label="Institution" htmlFor="adj-institution" error={errors.institutionId?.message}>
        <Select id="adj-institution" aria-invalid={!!errors.institutionId} {...form.register('institutionId')}>
          <option value="">Choose an institution</option>
          {billing.institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (৳)" htmlFor="adj-amount" error={errors.amount?.message} hint="Negative is a credit for the institution.">
        <Input id="adj-amount" inputMode="decimal" autoComplete="off" placeholder="-500 for a credit, 250 for a charge" className="num" aria-invalid={!!errors.amount} {...form.register('amount')} />
      </Field>
      <Field label="Reason" htmlFor="adj-reason" error={errors.reason?.message} hint="Visible on the statement. Include a ticket reference.">
        <Textarea id="adj-reason" placeholder="What is this for? Include a ticket reference." aria-invalid={!!errors.reason} {...form.register('reason')} />
      </Field>
    </Drawer>
  )
}
