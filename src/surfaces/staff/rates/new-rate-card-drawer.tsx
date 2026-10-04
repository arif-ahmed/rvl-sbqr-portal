import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { periodName } from '../../../shared/format'
import { Button, Drawer, Field, Input, Select, toast } from '../../../shared/ui'
import { useInstitutions } from '../institutions/api/hooks'
import { accessSummary, nextMonth, rateCardSchema, type RateCardForm } from './rates'
import { addRateCard, useRateCards } from './store'

const empty: RateCardForm = { institutionId: '', startMonth: '', generationRate: '', validationRate: '' }

/** Price an institution from the 1st of a future month. UI only: adds to the in-memory store. */
export function NewRateCardDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const institutions = useInstitutions().filter((i) => i.status !== 'Terminated')
  const cards = useRateCards()
  const form = useForm<RateCardForm>({ resolver: zodResolver(rateCardSchema), defaultValues: empty })
  const { errors } = form.formState
  const startMonth = useWatch({ control: form.control, name: 'startMonth' })
  const institutionId = useWatch({ control: form.control, name: 'institutionId' })
  const access = institutions.find((i) => i.id === institutionId)?.access ?? null
  const summary = accessSummary(access)
  // Both prices are always required, so enabling an operation later never leaves it unpriced.
  const unusedHint = (allowed: boolean | undefined, hint: string) =>
    access && !allowed ? `Not allowed for this institution today. Kept in case it is enabled later. ${hint}` : hint

  const close = () => {
    form.reset(empty)
    onClose()
  }

  const save = form.handleSubmit((v) => {
    if (cards.some((c) => c.institutionId === v.institutionId && c.effectiveFrom.startsWith(v.startMonth))) {
      form.setError('startMonth', { message: 'This institution already has a rate card starting that month. Withdraw it first.' })
      return
    }
    addRateCard({ institutionId: v.institutionId, effectiveFrom: `${v.startMonth}-01`, generationRate: Number(v.generationRate), validationRate: Number(v.validationRate) })
    toast.success('Rate card scheduled')
    close()
  })

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => !o && close()}
      title="New rate card"
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save}>
            Schedule rate card
          </Button>
        </>
      }
    >
      <p className="mb-4 text-text-2">Prices apply from the 1st of the month you choose. Once a card takes effect it cannot be changed or withdrawn.</p>
      <Field label="Institution" htmlFor="rc-institution" error={errors.institutionId?.message}>
        <Select id="rc-institution" aria-invalid={!!errors.institutionId} {...form.register('institutionId')}>
          <option value="">Choose an institution</option>
          {institutions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        {summary && <p className="mt-1.5 text-[12.5px] text-text-2">{summary}. Both prices are still required, so a later change in access never leaves one unpriced.</p>}
      </Field>
      <Field
        label="Starts on"
        htmlFor="rc-start"
        error={errors.startMonth?.message}
        hint={/^\d{4}-\d{2}$/.test(startMonth) ? `Applies from 1 ${periodName(startMonth)}.` : 'Choose a future month.'}
      >
        <Input id="rc-start" type="month" min={nextMonth()} aria-invalid={!!errors.startMonth} {...form.register('startMonth')} />
      </Field>
      <Field label="Generation price per call (BDT)" htmlFor="rc-gen" error={errors.generationRate?.message} hint={unusedHint(access?.generation, 'Static and dynamic QR codes cost the same.')}>
        <Input id="rc-gen" inputMode="decimal" autoComplete="off" placeholder="0.50" className="num" aria-invalid={!!errors.generationRate} {...form.register('generationRate')} />
      </Field>
      <Field label="Validation price per call (BDT)" htmlFor="rc-val" error={errors.validationRate?.message} hint={unusedHint(access?.validation, 'Up to 4 decimals. Zero is allowed.')}>
        <Input id="rc-val" inputMode="decimal" autoComplete="off" placeholder="0.125" className="num" aria-invalid={!!errors.validationRate} {...form.register('validationRate')} />
      </Field>
    </Drawer>
  )
}
