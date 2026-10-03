import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { bdtRate, periodName } from '../../../shared/format'
import { Banner, Button, Card, Field, Input, Select, StatusChip, SwitchRow, Textarea } from '../../../shared/ui'
import { certSchema } from '../institutions/schemas'
import { takenCodes } from '../institutions/store'
import type { Access, Certificate, KeyMode, Profile } from '../institutions/types'
import { InstitutionPicker } from './institution-picker'
import { type RegistryEntry } from './institution-registry'
import { institutionCode, institutionTypes, typeLabel } from './institution-types'
import { useInstitutionDirectory } from './use-institution-directory'
import { price, type RateCard } from '../rates/rates'

// UI-only for now: nothing here calls the API.


function StepCard({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        <p className="text-[13px] text-text-2">{text}</p>
      </div>
      <div className="p-5">{children}</div>
    </Card>
  )
}

function Actions({ children }: { children: ReactNode }) {
  return <div className="mt-2 flex flex-wrap justify-end gap-2.5 border-t border-line pt-4">{children}</div>
}

// ---------------------------------------------------------------- 1. Institution

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Enter the institution name.').max(200, 'Use 200 characters or fewer.'),
  type: z.string().min(1, 'Choose an institution type.'),
  institutionId: z.string().regex(/^[0-9]{4}$/, 'Enter the 4-digit institution ID.'),
  contactName: z.string().trim().min(2, 'Enter a contact name.'),
  email: z.email('Enter a valid email address.'),
  phone: z.string().trim().regex(/^$|^\+?[0-9 -]{7,18}$/, 'Enter a valid phone number.'),
  address: z.string().trim().max(300, 'Use 300 characters or fewer.'),
})

export function InstitutionStep(props: { initial: Profile | null; locked: boolean; onSubmit: (p: Profile) => void }) {
  const { initial, locked, onSubmit } = props
  const form = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial ?? { name: '', type: '', institutionId: '', contactName: '', email: '', phone: '', address: '' },
  })
  const { errors } = form.formState
  const [type, institutionId] = useWatch({ control: form.control, name: ['type', 'institutionId'] })

  // The name is fixed by the regulator, so it is picked from the directory rather than typed.
  // "Not listed" falls back to manual entry (also the only way to add an NBFI).
  // The directory is live from GET /v1/admin/institutions with the static Annex A
  // registry as fallback when the API is unreachable.
  const directory = useInstitutionDirectory()
  const inRegistry = (p: Profile | null) => directory.entries.find((e) => p && e.type === p.type && e.id === p.institutionId) ?? null
  const [picked, setPicked] = useState<RegistryEntry | null>(() => inRegistry(initial))
  const [manual, setManual] = useState(() => !!initial && !inRegistry(initial))

  function setIdentity(name: string, t: string, id: string) {
    const opts = { shouldValidate: form.formState.isSubmitted }
    form.setValue('name', name, opts)
    form.setValue('type', t, opts)
    form.setValue('institutionId', id, opts)
  }

  function submit(p: Profile) {
    if (locked) return onSubmit(p)
    if (takenCodes().includes(institutionCode(p.type, p.institutionId))) {
      form.setError('institutionId', { message: 'This institution code is already registered.' })
      return
    }
    onSubmit(p)
  }

  return (
    <StepCard title="Institution" text="Who is being onboarded. The institution code identifies it in every Bangla QR.">
      {locked && <Banner tone="info" title="Institution registered">Identity details are fixed once registered.</Banner>}
      <form onSubmit={form.handleSubmit(submit)} noValidate>
        <fieldset disabled={locked} className="min-w-0">
          {manual ? (
            <>
              <Field label="Institution name" htmlFor="name" error={errors.name?.message} hint="Enter it exactly as registered with Bangladesh Bank.">
                <Input id="name" autoComplete="off" aria-invalid={!!errors.name} {...form.register('name')} />
              </Field>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Institution type" htmlFor="type" error={errors.type?.message} hint="As defined by Bangladesh Bank.">
                  <Select id="type" aria-invalid={!!errors.type} {...form.register('type')}>
                    <option value="">Select type</option>
                    {institutionTypes.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  label="Institution ID"
                  htmlFor="institutionId"
                  error={errors.institutionId?.message}
                  hint={type && /^\d{4}$/.test(institutionId) ? `Institution code ${institutionCode(type, institutionId)}` : 'Type code + 4-digit ID makes the 6-digit code.'}
                >
                  <div className="flex">
                    <span className="num grid h-10 min-w-11 place-items-center rounded-l-[9px] border border-r-0 border-line-2 bg-surface-2 px-2.5 text-text-2">
                      {type || '--'}
                    </span>
                    <Input id="institutionId" inputMode="numeric" maxLength={4} className="num rounded-l-none" aria-invalid={!!errors.institutionId} {...form.register('institutionId')} />
                  </div>
                </Field>
              </div>
            </>
          ) : (
            <Field
              label="Institution"
              htmlFor="institution"
              error={errors.name || errors.type || errors.institutionId ? 'Choose an institution from the list.' : undefined}
              hint={
                directory.live
                  ? 'Registered Bangla QR institutions. Choosing one fills in its type and code.'
                  : 'Trust directory unreachable — showing the built-in list. Choosing one fills in its type and code.'
              }
            >
              <InstitutionPicker
                value={picked}
                disabled={locked}
                invalid={!!(errors.name || errors.institutionId)}
                entries={directory.entries}
                taken={takenCodes()}
                frozen={directory.frozen}
                onChange={(e) => {
                  setPicked(e)
                  setIdentity(e?.name ?? '', e?.type ?? '', e?.id ?? '')
                }}
              />
            </Field>
          )}
          {!locked && (
            <button
              type="button"
              className="-mt-2 mb-4 text-[13px] font-medium text-accent-strong underline"
              onClick={() => {
                setManual(!manual)
                setPicked(null)
                setIdentity('', '', '')
                form.clearErrors()
              }}
            >
              {manual ? 'Choose from the list instead' : 'Not listed? Enter details manually'}
            </button>
          )}
          <div className="grid gap-x-4 sm:grid-cols-2">
            <Field label="Contact name" htmlFor="contactName" error={errors.contactName?.message}>
              <Input id="contactName" autoComplete="off" aria-invalid={!!errors.contactName} {...form.register('contactName')} />
            </Field>
            <Field label="Contact email" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="off" aria-invalid={!!errors.email} {...form.register('email')} />
            </Field>
          </div>
          <Field label="Contact phone (optional)" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" type="tel" autoComplete="off" aria-invalid={!!errors.phone} {...form.register('phone')} />
          </Field>
          <Field label="Address (optional)" htmlFor="address" error={errors.address?.message}>
            <Textarea id="address" className="min-h-20" {...form.register('address')} />
          </Field>
        </fieldset>
        <Actions>
          <Button type="submit" variant="primary">
            {locked ? 'Continue' : 'Register institution'}
          </Button>
        </Actions>
      </form>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 2. Configuration

/**
 * What the institution may do. The capabilities chosen here scope the credentials issued near
 * the end of the wizard, and the switches stay editable even after issuance — a change then
 * applies to the issued credentials right away (no new secret), like the institution page does.
 */
export function ConfigurationStep(props: {
  generation: boolean
  validation: boolean
  issuedClientId: string | null
  onChange: (kind: 'generation' | 'validation', value: boolean) => void
  onBack: () => void
  onContinue: () => void
}) {
  const { generation, validation, issuedClientId, onChange, onBack, onContinue } = props
  const none = !generation && !validation

  return (
    <StepCard title="Tenant configuration" text="Choose what this institution may do. The API credentials issued later in this wizard are scoped to exactly these capabilities.">
      <div className="mb-4 flex flex-col gap-3">
        <SwitchRow
          id="generation"
          label="QR generation"
          description="Create Secure Bangla QR codes (scope qr:generate)."
          checked={generation}
          onChange={(v) => onChange('generation', v)}
        />
        <SwitchRow
          id="validation"
          label="QR validation"
          description="Verify Secure Bangla QR codes (scope qr:validate)."
          checked={validation}
          onChange={(v) => onChange('validation', v)}
        />
      </div>
      {none && <Banner tone="warn" title="Turn on at least one capability.">Credentials with neither capability could not be used.</Banner>}
      {issuedClientId && (
        <Banner tone="info" title="Credentials already issued">
          Client ID <span className="num">{issuedClientId}</span>. Changes here apply to the issued credentials right away —
          no new secret is needed.
        </Banner>
      )}
      <Actions>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={none} onClick={onContinue}>
          Continue
        </Button>
      </Actions>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 3. Rate card

const rateStepSchema = z.object({ generationRate: price, validationRate: price })
type RateStepForm = z.infer<typeof rateStepSchema>

/**
 * What the institution pays per call. Required: an institution cannot be activated without a
 * card in effect, so the card starts the month the institution goes live. A started card never
 * changes — repricing for later months is scheduled from the Rates page.
 */
export function RateCardStep(props: {
  capabilities: { generation: boolean; validation: boolean }
  /** The card in effect for the start month, if one exists. */
  card: RateCard | null
  /** 'YYYY-MM' the new card starts — the current month. */
  startMonth: string
  onBack: () => void
  onContinue: () => void
  onSave: (generationRate: number, validationRate: number) => void
}) {
  const { capabilities, card, startMonth, onBack, onContinue, onSave } = props
  const form = useForm<RateStepForm>({ resolver: zodResolver(rateStepSchema), defaultValues: { generationRate: '', validationRate: '' } })
  const { errors } = form.formState

  if (card) {
    return (
      <StepCard title="Rate card" text="What the institution is charged per billable call.">
        <Banner tone="ok" title="Rate card in effect">
          Since {periodName(card.effectiveFrom.slice(0, 7))}: {bdtRate(card.generationRate)} per generation and {bdtRate(card.validationRate)} per validation. A
          started card cannot be changed — schedule a new one for a future month from the Rates page.
        </Banner>
        <Actions>
          <Button onClick={onBack}>Back</Button>
          <Button variant="primary" onClick={onContinue}>
            Continue
          </Button>
        </Actions>
      </StepCard>
    )
  }

  return (
    <StepCard title="Rate card" text="Set the per-call prices the institution is charged. It cannot be activated without them.">
      <form onSubmit={form.handleSubmit((v) => onSave(Number(v.generationRate), Number(v.validationRate)))} noValidate>
        <Banner tone="info" title={`Billing starts ${periodName(startMonth)}`}>
          The card takes effect on the 1st of {periodName(startMonth)} — the month the institution goes live — and prices every billable call:
          static and dynamic generation cost the same. Zero is allowed for a capability that should be free. Later price changes are
          scheduled from the Rates page; a started card never changes.
        </Banner>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field
            label="Generation price per call (BDT)"
            htmlFor="rate-generation"
            error={errors.generationRate?.message}
            hint={capabilities.generation ? 'Static and dynamic QR codes cost the same.' : 'Not used while generation is off. Kept in case it is enabled later.'}
          >
            <Input id="rate-generation" inputMode="decimal" autoComplete="off" placeholder="0.50" className="num" aria-invalid={!!errors.generationRate} {...form.register('generationRate')} />
          </Field>
          <Field
            label="Validation price per call (BDT)"
            htmlFor="rate-validation"
            error={errors.validationRate?.message}
            hint={capabilities.validation ? 'Up to 4 decimals. Zero is allowed.' : 'Not used while validation is off. Kept in case it is enabled later.'}
          >
            <Input id="rate-validation" inputMode="decimal" autoComplete="off" placeholder="0.125" className="num" aria-invalid={!!errors.validationRate} {...form.register('validationRate')} />
          </Field>
        </div>
        <Actions>
          <Button onClick={onBack}>Back</Button>
          <Button type="submit" variant="primary">
            Save rate card
          </Button>
        </Actions>
      </form>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 4. Certificate

export function CertificateStep(props: { initial: Certificate | null; onBack: () => void; onSkip: () => void; onSubmit: (c: Certificate) => void }) {
  const { initial, onBack, onSkip, onSubmit } = props
  const form = useForm<Certificate>({ resolver: zodResolver(certSchema), defaultValues: initial ?? { thumbprint: '', subject: '', expiresAt: '' } })
  const { errors } = form.formState

  return (
    <StepCard title="Client certificate" text="mTLS certificate for the FI gateway connection. Add it now or later from the institution page.">
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <Field label="SHA-256 thumbprint" htmlFor="thumbprint" error={errors.thumbprint?.message}>
          <Input id="thumbprint" autoComplete="off" spellCheck={false} className="num" aria-invalid={!!errors.thumbprint} {...form.register('thumbprint')} />
        </Field>
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Field label="Subject" htmlFor="subject" error={errors.subject?.message}>
            <Input id="subject" autoComplete="off" placeholder="CN=gateway.example" aria-invalid={!!errors.subject} {...form.register('subject')} />
          </Field>
          <Field label="Expires on" htmlFor="expiresAt" error={errors.expiresAt?.message}>
            <Input id="expiresAt" type="date" aria-invalid={!!errors.expiresAt} {...form.register('expiresAt')} />
          </Field>
        </div>
        <Actions>
          <Button onClick={onBack}>Back</Button>
          <Button onClick={onSkip}>Skip for now</Button>
          <Button type="submit" variant="primary">
            Register certificate
          </Button>
        </Actions>
      </form>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 5. Signing key

const pemSchema = z.string().refine((v) => /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----/.test(v.trim()), 'Paste a PEM private key.')

export function KeyStep(props: { initial: KeyMode | null; onBack: () => void; onSkip: () => void; onSubmit: (m: KeyMode) => void }) {
  const { initial, onBack, onSkip, onSubmit } = props
  const [mode, setMode] = useState<KeyMode>(initial ?? 'Generate')
  const [pem, setPem] = useState('')
  const [error, setError] = useState('')

  function submit() {
    if (mode === 'Adopt') {
      const r = pemSchema.safeParse(pem)
      if (!r.success) return setError(r.error.issues[0].message)
    }
    // The pasted key is never kept: it is dropped here and would go straight to the API.
    setPem('')
    onSubmit(mode)
  }

  return (
    <StepCard title="Signing key" text="Ed25519 key used to sign this institution's QR codes.">
      <div role="radiogroup" aria-label="Key source" className="mb-4 grid gap-3 sm:grid-cols-2">
        {(['Generate', 'Adopt'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => {
              setMode(m)
              setError('')
            }}
            className={`rounded-xl border p-4 text-left ${mode === m ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}
          >
            <b className="block">{m === 'Generate' ? 'Generate a key pair' : 'Use an existing key'}</b>
            <span className="text-[12.5px] text-text-2">
              {m === 'Generate' ? 'The platform creates and holds a new Ed25519 key.' : 'Provide the institution’s own Ed25519 private key.'}
            </span>
          </button>
        ))}
      </div>
      {mode === 'Adopt' && (
        <Field label="Private key (PEM)" htmlFor="pem" error={error} hint="The matching public key must already be in the trust directory.">
          <Textarea id="pem" className="num min-h-36 text-xs" spellCheck={false} aria-invalid={!!error} value={pem} onChange={(e) => setPem(e.target.value)} />
        </Field>
      )}
      <Actions>
        <Button onClick={onBack}>Back</Button>
        <Button onClick={onSkip}>Skip for now</Button>
        <Button variant="primary" onClick={submit}>
          {mode === 'Generate' ? 'Create key' : 'Use this key'}
        </Button>
      </Actions>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 6. API credentials

/** The issuance ceremony: explains what will be generated, issues the pair, then confirms it. */
export function CredentialsStep(props: {
  capabilities: { generation: boolean; validation: boolean }
  access: Access | null
  onBack: () => void
  onIssue: () => void
  onContinue: () => void
}) {
  const { capabilities, access, onBack, onIssue, onContinue } = props
  const issued = !!access?.clientId
  const caps = [capabilities.generation && 'QR generation', capabilities.validation && 'QR validation'].filter(Boolean).join(' and ')

  return (
    <StepCard title="API credentials" text="Issue the client ID and client secret the institution's gateway will use to connect.">
      <div className="mb-4 rounded-xl border border-line px-4 py-3.5">
        <b className="block">Scoped to {caps}</b>
        <span className="text-[12.5px] text-text-3">Set on the Configuration step{issued ? '' : ' — go back to change it before issuing'}.</span>
      </div>
      <Banner tone="info" title="What issuing generates">
        A client ID identifies the institution in every API request. A client secret authenticates its gateway and is shown
        only once — only a hash is kept, so copy it when it appears. Both can be rotated or regenerated later from the
        institution page.
      </Banner>
      {issued && (
        <Banner tone="ok" title="Credentials issued">
          Client ID <span className="num">{access.clientId}</span>. The secret was shown once and cannot be shown again.
          Capabilities can be changed from the Configuration step or later from the institution page.
        </Banner>
      )}
      <Actions>
        <Button onClick={onBack}>Back</Button>
        {issued ? (
          <Button variant="primary" onClick={onContinue}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" onClick={onIssue}>
            Issue credentials
          </Button>
        )}
      </Actions>
    </StepCard>
  )
}

// ---------------------------------------------------------------- Review

function Row({ label, value, state }: { label: string; value: string; state: 'done' | 'todo' }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-0">
      <div>
        <b className="block">{label}</b>
        <span className="text-[13px] text-text-2">{value}</span>
      </div>
      <StatusChip status={state === 'done' ? 'Complete' : 'Pending'} />
    </div>
  )
}

export function ReviewStep(props: {
  profile: Profile
  access: Access
  rate: RateCard | null
  certificate: Certificate | null
  keyMode: KeyMode | null
  keyApplies: boolean
  onBack: () => void
  onFinish: (activate: boolean) => void
}) {
  const { profile, access, rate, certificate, onBack, onFinish } = props
  const caps = [access.generation && 'generation', access.validation && 'validation'].filter(Boolean).join(' and ')
  return (
    <StepCard title="Review and activate" text="Check the setup. Activating makes the institution live; otherwise it stays Pending.">
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-3">
          <b className="text-base">{profile.name}</b>
          <StatusChip status="Pending" />
        </div>
        <span className="text-[13px] text-text-2">
          {typeLabel(profile.type)} · code <span className="num">{institutionCode(profile.type, profile.institutionId)}</span> · {profile.contactName}, {profile.email}
        </span>
      </div>
      <Row label="Capabilities" value={caps} state="done" />
      <Row label="API credentials" value={access.clientId ? `Client ID ${access.clientId}` : 'Not issued'} state={access.clientId ? 'done' : 'todo'} />
      <Row
        label="Rate card"
        value={rate ? `${bdtRate(rate.generationRate)} per generation · ${bdtRate(rate.validationRate)} per validation, since ${periodName(rate.effectiveFrom.slice(0, 7))}` : 'Not set'}
        state={rate ? 'done' : 'todo'}
      />
      <Row label="Client certificate" value={certificate ? `${certificate.subject}, expires ${certificate.expiresAt}` : 'Not added yet'} state={certificate ? 'done' : 'todo'} />
      {props.keyApplies && <Row label="Signing key" value={props.keyMode ? (props.keyMode === 'Generate' ? 'Generated by the platform' : 'Existing key provided') : 'Not created yet'} state={props.keyMode ? 'done' : 'todo'} />}
      {!rate && (
        <Banner tone="warn" title="Rate card required">
          Set prices on the Rate card step before activating — usage without a card in effect is recorded but never billed.
        </Banner>
      )}
      <Actions>
        <Button onClick={onBack}>Back</Button>
        <Button onClick={() => onFinish(false)}>Finish later</Button>
        <Button variant="primary" disabled={!rate} onClick={() => onFinish(true)}>
          Activate institution
        </Button>
      </Actions>
    </StepCard>
  )
}
