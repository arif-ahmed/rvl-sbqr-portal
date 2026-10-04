import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { Blocker } from '../../../shared/api/client'
import { Banner, Button, Card, Field, Input, Select, StatusChip, SwitchRow, Textarea } from '../../../shared/ui'
import { useInstitutions } from '../institutions/api/hooks'
import type { OnboardingDto } from '../institutions/api/types'
import { certSchema } from '../institutions/schemas'
import type { Certificate, KeyMode, Profile } from '../institutions/types'
import { InstitutionPicker } from './institution-picker'
import { type RegistryEntry } from './institution-registry'
import { institutionCode, institutionTypes, typeLabel } from './institution-types'
import { useInstitutionDirectory } from './use-institution-directory'

// The wizard steps. Each one is a plain form: the page owns the requests (see onboarding-page.tsx)
// and hands every step its `busy` / `error` state, so a step only decides what to show.

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

/** A failed request, shown above the step's buttons. */
function StepError({ error }: { error: string | null | undefined }) {
  return error ? <Banner tone="bad" title="That didn’t work">{error}</Banner> : null
}

type StepState = { busy?: boolean; error?: string | null }

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

export function InstitutionStep(props: StepState & { initial: Profile | null; locked: boolean; onSubmit: (p: Profile) => void }) {
  const { initial, locked, onSubmit, busy, error } = props
  const form = useForm<Profile>({
    resolver: zodResolver(profileSchema),
    defaultValues: initial ?? { name: '', type: '', institutionId: '', contactName: '', email: '', phone: '', address: '' },
  })
  const { errors } = form.formState
  const [type, institutionId] = useWatch({ control: form.control, name: ['type', 'institutionId'] })
  // Codes already registered: the picker greys them out. The API still refuses a duplicate with a 409.
  const taken = useInstitutions().map((i) => i.code)

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
    if (taken.includes(institutionCode(p.type, p.institutionId))) {
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
                taken={taken}
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
        <StepError error={error} />
        <Actions>
          <Button type="submit" variant="primary" disabled={busy}>
            {locked ? 'Continue' : busy ? 'Registering…' : 'Register institution'}
          </Button>
        </Actions>
      </form>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 2. Configuration

/**
 * What the institution may do. The capabilities chosen here scope the credentials issued on the
 * next step. Once credentials exist the API no longer accepts a change here (the credentials are
 * already scoped), so the switches lock.
 */
export function ConfigurationStep(
  props: StepState & {
    generation: boolean
    validation: boolean
    /** Credentials already exist, so the capabilities are fixed. */
    locked: boolean
    onChange: (kind: 'generation' | 'validation', value: boolean) => void
    onBack: () => void
    onContinue: () => void
  },
) {
  const { generation, validation, locked, busy, error, onChange, onBack, onContinue } = props
  const none = !generation && !validation

  return (
    <StepCard title="Tenant configuration" text="Choose what this institution may do. The API credentials issued on the next step are scoped to exactly these capabilities.">
      <div className="mb-4 flex flex-col gap-3">
        <SwitchRow
          id="generation"
          label="QR generation"
          description="Create Secure Bangla QR codes (scope qr:generate)."
          checked={generation}
          disabled={locked}
          onChange={(v) => onChange('generation', v)}
        />
        <SwitchRow
          id="validation"
          label="QR validation"
          description="Verify Secure Bangla QR codes (scope qr:validate)."
          checked={validation}
          disabled={locked}
          onChange={(v) => onChange('validation', v)}
        />
      </div>
      {none && <Banner tone="warn" title="Turn on at least one capability.">Credentials with neither capability could not be used.</Banner>}
      {locked && (
        <Banner tone="info" title="Credentials already issued">
          The credentials are scoped to these capabilities, so they can no longer be changed here.
        </Banner>
      )}
      <StepError error={error} />
      <Actions>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={none || busy} onClick={onContinue}>
          {busy ? 'Saving…' : 'Continue'}
        </Button>
      </Actions>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 3. API credentials

/** The issuance ceremony: explains what will be generated, issues the pair, then confirms it. */
export function CredentialsStep(
  props: StepState & {
    capabilities: { generation: boolean; validation: boolean }
    /** The active credential, if one was issued. Its secret is never available here. */
    issued: NonNullable<OnboardingDto['credential']> | null
    onBack: () => void
    onIssue: () => void
    onContinue: () => void
  },
) {
  const { capabilities, issued, busy, error, onBack, onIssue, onContinue } = props
  const caps = [capabilities.generation && 'QR generation', capabilities.validation && 'QR validation'].filter(Boolean).join(' and ')

  return (
    <StepCard title="API credentials" text="Issue the client ID and client secret the institution's gateway will use to connect.">
      <div className="mb-4 rounded-xl border border-line px-4 py-3.5">
        <b className="block">Scoped to {caps}</b>
        <span className="text-[13px] text-text-3">Set on the Configuration step{issued ? '' : ' — go back to change it before issuing'}.</span>
      </div>
      <Banner tone="info" title="What issuing generates">
        A client ID identifies the institution in every API request. A client secret authenticates its gateway and is shown
        only once — only a hash is kept, so copy it when it appears.
      </Banner>
      {issued && (
        <Banner tone="ok" title="Credentials issued">
          Client ID <span className="num">{issued.clientId}</span>. The secret was shown once and cannot be shown again.
        </Banner>
      )}
      <StepError error={error} />
      <Actions>
        <Button onClick={onBack}>Back</Button>
        {issued ? (
          <Button variant="primary" onClick={onContinue}>
            Continue
          </Button>
        ) : (
          <Button variant="primary" disabled={busy} onClick={onIssue}>
            {busy ? 'Issuing…' : 'Issue credentials'}
          </Button>
        )}
      </Actions>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 4. Certificate

export function CertificateStep(
  props: StepState & {
    /** The certificate already registered, if any. */
    registered: OnboardingDto['certificate']
    onBack: () => void
    onSkip: () => void
    onContinue: () => void
    onSubmit: (c: Certificate) => void
  },
) {
  const { registered, busy, error, onBack, onSkip, onContinue, onSubmit } = props
  const form = useForm<Certificate>({ resolver: zodResolver(certSchema), defaultValues: { thumbprint: '', subject: '', expiresAt: '' } })
  const { errors } = form.formState

  if (registered) {
    return (
      <StepCard title="Client certificate" text="mTLS certificate for the FI gateway connection.">
        <Banner tone="ok" title="Certificate registered">
          {registered.subject}, expires {registered.expiresAt.slice(0, 10)}. Replace it later from the institution page.
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
        <StepError error={error} />
        <Actions>
          <Button onClick={onBack}>Back</Button>
          <Button disabled={busy} onClick={onSkip}>
            Skip for now
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {busy ? 'Registering…' : 'Register certificate'}
          </Button>
        </Actions>
      </form>
    </StepCard>
  )
}

// ---------------------------------------------------------------- 5. Signing key

const pemSchema = z.string().refine((v) => /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----/.test(v.trim()), 'Paste a PEM private key.')

/** Required: an institution cannot go live without an active signing key. */
export function KeyStep(
  props: StepState & {
    /** The active key, if one exists. */
    existing: OnboardingDto['signingKey']
    onBack: () => void
    onContinue: () => void
    onSubmit: (mode: KeyMode, privateKeyPem?: string) => void
  },
) {
  const { existing, busy, error, onBack, onContinue, onSubmit } = props
  const [mode, setMode] = useState<KeyMode>('Generate')
  const [pem, setPem] = useState('')
  const [invalid, setInvalid] = useState('')

  if (existing) {
    return (
      <StepCard title="Signing key" text="Ed25519 key used to sign this institution's QR codes.">
        <Banner tone="ok" title="Signing key active">
          Key <span className="num">{existing.keyId}</span>, version {existing.version}.
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

  function submit() {
    if (mode === 'Adopt') {
      const r = pemSchema.safeParse(pem)
      if (!r.success) return setInvalid(r.error.issues[0].message)
      // The pasted key is sent once and dropped here: it is not kept in state, storage or logs.
      const key = pem
      setPem('')
      return onSubmit(mode, key)
    }
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
              setInvalid('')
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
        <Field label="Private key (PEM)" htmlFor="pem" error={invalid} hint="The matching public key must already be in the trust directory.">
          <Textarea id="pem" className="num min-h-36 text-xs" spellCheck={false} aria-invalid={!!invalid} value={pem} onChange={(e) => setPem(e.target.value)} />
        </Field>
      )}
      <StepError error={error} />
      <Actions>
        <Button onClick={onBack}>Back</Button>
        <Button variant="primary" disabled={busy} onClick={submit}>
          {busy ? 'Working…' : mode === 'Generate' ? 'Create key' : 'Use this key'}
        </Button>
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

/** What stops activation, in the API's words. `TRUST_ENTRY_MISSING` needs a pointer: the wizard cannot fix it. */
function Blockers({ blockers }: { blockers: Blocker[] }) {
  if (blockers.length === 0) return null
  return (
    <Banner tone="warn" title="Not ready to activate yet">
      <ul className="list-disc pl-4">
        {blockers.map((b) => (
          <li key={b.code}>
            {b.message}
            {b.code === 'TRUST_ENTRY_MISSING' && ' This institution must be published in the Bangladesh Bank trust directory before it can go live.'}
          </li>
        ))}
      </ul>
    </Banner>
  )
}

export function ReviewStep(
  props: StepState & {
    profile: Profile
    onboarding: OnboardingDto | undefined
    /** Blockers from a refused activation (fresher than the last onboarding read). */
    refusal: Blocker[]
    onBack: () => void
    onFinishLater: () => void
    onActivate: () => void
  },
) {
  const { profile, onboarding, refusal, busy, error, onBack, onFinishLater, onActivate } = props
  const config = onboarding?.configuration
  const caps = config ? [config.isQrGenerationAllowed && 'generation', config.isQrValidationAllowed && 'validation'].filter(Boolean).join(' and ') : ''
  const certificate = onboarding?.certificate
  const skipped = onboarding?.steps.find((s) => s.code === 'CERTIFICATE')?.status === 'SKIPPED'
  const blockers = refusal.length > 0 ? refusal : (onboarding?.blockers ?? [])

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
      <Row label="Capabilities" value={caps || 'Not set'} state={caps ? 'done' : 'todo'} />
      <Row label="API credentials" value={onboarding?.credential ? `Client ID ${onboarding.credential.clientId}` : 'Not issued'} state={onboarding?.credential ? 'done' : 'todo'} />
      <Row
        label="Client certificate"
        value={certificate ? `${certificate.subject}, expires ${certificate.expiresAt.slice(0, 10)}` : skipped ? 'Skipped for now' : 'Not added yet'}
        state={certificate || skipped ? 'done' : 'todo'}
      />
      <Row
        label="Signing key"
        value={onboarding?.signingKey ? `Key ${onboarding.signingKey.keyId}, version ${onboarding.signingKey.version}` : 'Not created yet'}
        state={onboarding?.signingKey ? 'done' : 'todo'}
      />
      <Blockers blockers={blockers} />
      {onboarding && !onboarding.hasRateCard && (
        <Banner tone="info" title="No rate card yet">
          You can activate without one, but usage is recorded and never billed until a rate card takes effect. Rate cards start on the 1st of the current or a future month and are set from Rates.
        </Banner>
      )}
      <StepError error={error} />
      <Actions>
        <Button onClick={onBack}>Back</Button>
        <Button onClick={onFinishLater}>Finish later</Button>
        <Button variant="primary" disabled={busy || !onboarding?.canActivate} onClick={onActivate}>
          {busy ? 'Activating…' : 'Activate institution'}
        </Button>
      </Actions>
    </StepCard>
  )
}
