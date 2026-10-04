import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, errorMessage, type Blocker } from '../../../shared/api/client'
import { Banner, Button, Card, Stepper, toast, type StepDef } from '../../../shared/ui'
import {
  useCreateSigningKey,
  useInstitution,
  useOnboarding,
  useProvisionCredentials,
  useRegisterTenant,
  useSaveConfiguration,
  useTenantAction,
} from '../institutions/api/hooks'
import { stepLabels, toProfile } from '../institutions/api/mappers'
import { stepOrder, type StepCode } from '../institutions/api/types'
import type { Institution, Profile } from '../institutions/types'
import { institutionCode } from './institution-types'
import { SecretDialog } from './secret-dialog'
import { ConfigurationStep, CredentialsStep, InstitutionStep, KeyStep, ReviewStep } from './steps'

// Institution onboarding. Every step saves to the API as it completes, so closing the tab loses
// nothing: `?resume=<tenantId>` (from "Continue setup" on a Pending institution) reads the
// institution's onboarding progress and opens at the first step that is not done.
// Reached from "Add institution".

const steps: (StepDef & { id: StepCode })[] = stepOrder.map((id) => ({ id, label: stepLabels[id] }))

/** Where a resumed wizard starts, read once so later refetches never move the user around. */
type Start = { existing: Institution; step: StepCode; capabilities: { generation: boolean; validation: boolean } }

export default function OnboardingPage() {
  const [params] = useSearchParams()
  const resumeId = params.get('resume')
  return resumeId ? <Resume key={resumeId} id={resumeId} /> : <Onboarding existing={null} startStep="PROFILE" capabilities={{ generation: true, validation: true }} />
}

function Resume({ id }: { id: string }) {
  const institution = useInstitution(id)
  const onboarding = useOnboarding(id)
  const [start, setStart] = useState<Start | null>(null)
  // Captured once: activating the institution later must not bounce this screen back to the list.
  if (!start && institution.data && onboarding.data) {
    const config = onboarding.data.configuration
    setStart({
      existing: institution.data,
      step: onboarding.data.currentStep ?? 'REVIEW',
      capabilities: { generation: config?.isQrGenerationAllowed ?? true, validation: config?.isQrValidationAllowed ?? true },
    })
  }

  const failure = institution.error ?? onboarding.error
  if (failure instanceof ApiError && failure.status === 404) return <Navigate to="/staff/institutions" replace />
  if (failure && !start) {
    return (
      <div className="mx-auto max-w-2xl">
        <Banner tone="bad" title="Could not load this institution">
          {errorMessage(failure)} <Link to="/staff/institutions">Back to institutions</Link>
        </Banner>
      </div>
    )
  }
  if (!start) return <p className="text-text-2">Loading…</p>
  if (start.existing.status !== 'Pending') return <Navigate to="/staff/institutions" replace />
  return <Onboarding existing={start.existing} startStep={start.step} capabilities={start.capabilities} />
}

function Onboarding({ existing, startStep, capabilities }: { existing: Institution | null; startStep: StepCode; capabilities: { generation: boolean; validation: boolean } }) {
  const navigate = useNavigate()
  const [tenantId, setTenantId] = useState<string | null>(existing?.id ?? null)
  const [stepId, setStepId] = useState<StepCode>(startStep)
  const [profile, setProfile] = useState<Profile | null>(existing ? toProfile(existing) : null)
  const [config, setConfig] = useState(capabilities)
  const [shownSecret, setShownSecret] = useState<{ clientId: string; secret: string } | null>(null)
  const [result, setResult] = useState<'Active' | 'Pending' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<Blocker[]>([])

  const onboarding = useOnboarding(tenantId).data
  const registerTenant = useRegisterTenant()
  const saveConfiguration = useSaveConfiguration()
  const provision = useProvisionCredentials()
  const createKey = useCreateSigningKey()
  const activate = useTenantAction()
  const busy = [registerTenant, saveConfiguration, provision, createKey, activate].some((m) => m.isPending)

  const index = steps.findIndex((s) => s.id === stepId)
  const goTo = (id: StepCode) => {
    setError(null)
    setStepId(id)
  }
  const go = (delta: number) => goTo(steps[Math.min(steps.length - 1, Math.max(0, index + delta))].id)
  const fail = (e: unknown) => setError(errorMessage(e))

  function register(p: Profile) {
    if (tenantId) {
      setProfile(p)
      return go(1)
    }
    setError(null)
    registerTenant.mutate(p, {
      onSuccess: (tenant) => {
        setTenantId(tenant.tenantId)
        setProfile(p)
        go(1)
      },
      onError: fail,
    })
  }

  function saveConfig() {
    if (!tenantId) return
    // Credentials already scope the capabilities, and the API refuses a change after that.
    if (onboarding?.credential) return go(1)
    setError(null)
    saveConfiguration.mutate({ id: tenantId, ...config }, { onSuccess: () => go(1), onError: fail })
  }

  function issueCredentials() {
    if (!tenantId) return
    setError(null)
    provision.mutate(
      { id: tenantId, ...config },
      {
        onSuccess: (issued) => {
          // null: the API said they already exist (a retry after a dropped connection). Nothing to show.
          if (issued) setShownSecret({ clientId: issued.clientId, secret: issued.clientSecret })
          else toast.success('Credentials were already issued.')
        },
        onError: fail,
      },
    )
  }

  function dismissSecret() {
    setShownSecret(null)
    // Drop the mutation result too: it holds the secret for as long as this screen is mounted.
    provision.reset()
  }

  function activateInstitution() {
    if (!tenantId) return
    setError(null)
    setRefusal([])
    activate.mutate(
      { id: tenantId, action: 'activate' },
      {
        onSuccess: () => setResult('Active'),
        onError: (e) => {
          fail(e)
          if (e instanceof ApiError) setRefusal(e.blockers)
        },
      },
    )
  }

  function reset() {
    provision.reset()
    setTenantId(null)
    setStepId('PROFILE')
    setProfile(null)
    setConfig({ generation: true, validation: true })
    setShownSecret(null)
    setResult(null)
    setError(null)
    setRefusal([])
  }

  if (result && profile) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="px-6 py-12 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-10 text-ok" aria-hidden />
          <h2 className="mb-1.5 font-head text-xl font-bold">{result === 'Active' ? 'Institution is live' : 'Saved as pending'}</h2>
          <p className="mx-auto mb-6 max-w-[48ch] text-text-2">
            {profile.name} (<span className="num">{institutionCode(profile.type, profile.institutionId)}</span>){' '}
            {result === 'Active' ? 'is active and can use Secure Bangla QR.' : 'is registered. Continue setup or activate it from the institutions list.'}
          </p>
          <div className="flex justify-center gap-2.5">
            <Button variant="primary" onClick={() => navigate('/staff/institutions')}>
              Back to institutions
            </Button>
            <Button onClick={reset}>Add another</Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/staff/institutions" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Institutions
      </Link>
      <h2 className="mb-1.5 font-head text-2xl font-bold tracking-tight">{existing ? `Continue setup: ${existing.name}` : 'New institution'}</h2>
      <p className="mb-6 text-text-2">Register a financial institution and set it up to generate and validate Secure Bangla QR. Each step is saved as you go.</p>

      <Stepper steps={steps} current={index} />

      {stepId === 'PROFILE' && <InstitutionStep initial={profile} locked={!!tenantId} busy={busy} error={error} onSubmit={register} />}
      {stepId === 'CONFIGURATION' && (
        <ConfigurationStep
          generation={config.generation}
          validation={config.validation}
          locked={!!onboarding?.credential}
          busy={busy}
          error={error}
          onChange={(kind, value) => setConfig((c) => ({ ...c, [kind]: value }))}
          onBack={() => go(-1)}
          onContinue={saveConfig}
        />
      )}
      {stepId === 'CREDENTIALS' && (
        <CredentialsStep capabilities={config} issued={onboarding?.credential ?? null} busy={busy} error={error} onBack={() => go(-1)} onIssue={issueCredentials} onContinue={() => go(1)} />
      )}
      {stepId === 'SIGNING_KEY' && (
        <KeyStep
          existing={onboarding?.signingKey ?? null}
          busy={busy}
          error={error}
          onBack={() => go(-1)}
          onContinue={() => go(1)}
          onSubmit={(mode, privateKeyPem) => {
            if (!tenantId) return
            setError(null)
            createKey.mutate({ id: tenantId, mode, privateKeyPem }, { onSuccess: () => go(1), onError: fail })
          }}
        />
      )}
      {stepId === 'REVIEW' && profile && (
        <ReviewStep
          profile={profile}
          onboarding={onboarding}
          refusal={refusal}
          busy={busy}
          error={error}
          onBack={() => go(-1)}
          onFinishLater={() => setResult('Pending')}
          onActivate={activateInstitution}
        />
      )}

      {shownSecret && <SecretDialog clientId={shownSecret.clientId} secret={shownSecret.secret} onDone={dismissSecret} />}
    </div>
  )
}
