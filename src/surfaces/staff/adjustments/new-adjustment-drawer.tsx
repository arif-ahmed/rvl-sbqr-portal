import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Session } from '../../../shared/auth/session'
import { periodName } from '../../../shared/format'
import { addAdjustment, useBilling } from '../../../shared/billing/store'
import { Button, Drawer, Field, Input, Select, Textarea, toast } from '../../../shared/ui'
import { adjustmentSchema, type AdjustmentForm } from './adjustment'

const empty: AdjustmentForm = { institutionId: '', period: '', amount: '', reason: '' }

/** Record a credit or charge against an open period. UI only: adds to the in-memory store. */
export function NewAdjustmentDrawer({ open, onClose, session }: { open: boolean; onClose: () => void; session: Session }) {
  const billing = useBilling()
  // Only institutions with usage and only draft periods can take an adjustment: a finalized month is locked.
  const institutions = billing.institutions.filter((i) => Object.keys(billing.counts[i.id] ?? {}).length > 0)
  const drafts = billing.periods.filter((p) => billing.periodMeta[p].status === 'Draft')
  const form = useForm<AdjustmentForm>({ resolver: zodResolver(adjustmentSchema), defaultValues: { ...empty, period: drafts[0] ?? '' } })
  const { errors } = form.formState

  const close = () => {
    form.reset({ ...empty, period: drafts[0] ?? '' })
    onClose()
  }

  const save = form.handleSubmit((v) => {
    addAdjustment({ ...v, amount: Number(v.amount), createdBy: session.userId })
    toast.success('Adjustment recorded')
    close()
  })

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Record adjustment"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Record adjustment
          </Button>
        </>
      }
    >
      <p className="mb-4 text-text-2">
        Adjustments settle onto the statement when their period is finalized. After that they cannot be changed or removed.
      </p>
      <Field label="Institution" htmlFor="adj-institution" error={errors.institutionId?.message}>
        <Select id="adj-institution" aria-invalid={!!errors.institutionId} {...form.register('institutionId')}>
          <option value="">Choose an institution</option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        label="Period"
        htmlFor="adj-period"
        error={errors.period?.message}
        hint={
          drafts.length === 0
            ? 'No open period right now. A new draft opens after the next month closes.'
            : drafts.length === 1
              ? `Settles when ${periodName(drafts[0])} is finalized.`
              : 'Only draft periods accept adjustments.'
        }
      >
        <Select id="adj-period" aria-invalid={!!errors.period} disabled={drafts.length === 0} {...form.register('period')}>
          <option value="">Choose a period</option>
          {[...drafts].reverse().map((p) => (
            <option key={p} value={p}>
              {p} · Draft
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
