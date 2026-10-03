import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Stepper, type StepDef } from '../../../shared/ui'
import { demoCredentials } from '../institutions/credentials'
import { addInstitution, getInstitutions, patchInstitution } from '../institutions/store'
import type { Access, Certificate, Institution, KeyMode, Profile } from '../institutions/types'
import { cardFor, currentMonth } from '../rates/rates'
import { addRateCard, useRateCards } from '../rates/store'
import { institutionCode } from './institution-types'
import { SecretDialog } from './secret-dialog'
import { CertificateStep, ConfigurationStep, CredentialsStep, InstitutionStep, KeyStep, RateCardStep, ReviewStep } from './steps'

// Institution onboarding. UI only: each step saves to the in-memory store (like the API will
// commit each step) and no request is sent. Reached from "Add institution", or with
// ?resume=<id> from "Continue setup" on a Pending institution.

type StepId = 'institution' | 'configuration' | 'rate' | 'certificate' | 'key' | 'credentials' | 'review'

const toProfile = (i: Institution): Profile => ({
  name: i.name, type: i.type, institutionId: i.code.slice(2), contactName: i.contactName, email: i.email, phone: i.phone, address: i.address,
})

function firstIncomplete(i: Institution, carded: boolean): StepId {
  if (!i.access) return 'configuration'
  if (!carded) return 'rate'
  if (!i.certificate) return 'certificate'
  if (i.access.generation && !i.keyMode) return 'key'
  return 'review'
}

export default function OnboardingPage() {
  const [params] = useSearchParams()
  const resumeId = params.get('resume')
  // Read once: later edits to the store must not move the user around.
  const [existing] = useState(() => (resumeId ? (getInstitutions().find((i) => i.id === resumeId) ?? null) : null))

  if (resumeId && existing?.status !== 'Pending') return <Navigate to="/staff/institutions" replace />
  return <Onboarding existing={existing} />
}

function Onboarding({ existing }: { existing: Institution | null }) {
  const navigate = useNavigate()
  const rateCards = useRateCards()
  const [recordId, setRecordId] = useState<string | null>(existing?.id ?? null)
  const [stepId, setStepId] = useState<StepId>(existing ? firstIncomplete(existing, !!cardFor(rateCards, existing.id, currentMonth())) : 'institution')
  const [profile, setProfile] = useState<Profile | null>(existing ? toProfile(existing) : null)
  const [config, setConfig] = useState<{ generation: boolean; validation: boolean }>(
    existing?.access ? { generation: existing.access.generation, validation: existing.access.validation } : { generation: true, validation: true },
  )
  const [access, setAccess] = useState<Access | null>(existing?.access ?? null)
  const [certificate, setCertificate] = useState<Certificate | null>(existing?.certificate ?? null)
  const [keyMode, setKeyMode] = useState<KeyMode | null>(existing?.keyMode ?? null)
  const [shownSecret, setShownSecret] = useState<{ clientId: string; secret: string } | null>(null)
  const [result, setResult] = useState<'Active' | 'Pending' | null>(null)

  // The signing key only matters if the institution may generate QR codes.
  const keyApplies = config.generation
  const steps: (StepDef & { id: StepId })[] = [
    { id: 'institution', label: 'Institution' },
    { id: 'configuration', label: 'Configuration' },
    { id: 'rate', label: 'Rate card' },
    { id: 'certificate', label: 'Certificate', optional: true },
    ...(keyApplies ? [{ id: 'key' as const, label: 'Signing key', optional: true }] : []),
    { id: 'credentials', label: 'Credentials' },
    { id: 'review', label: 'Review' },
  ]
  const index = steps.findIndex((s) => s.id === stepId)
  const go = (delta: number) => setStepId(steps[Math.min(steps.length - 1, Math.max(0, index + delta))].id)
  const save = (patch: Partial<Institution>) => recordId && patchInstitution(recordId, patch)
  // The card the activation gate and Review care about: one in effect for the current month.
  const rateCard = recordId ? cardFor(rateCards, recordId, currentMonth()) : null

  function register(p: Profile) {
    if (!recordId) {
      const id = `inst-${Date.now()}`
      addInstitution({
        id, name: p.name, type: p.type, code: institutionCode(p.type, p.institutionId), status: 'Pending',
        contactName: p.contactName, email: p.email, phone: p.phone, address: p.address,
        access: null, certificate: null, keyMode: null,
      })
      setRecordId(id)
    }
    setProfile(p)
    go(1)
  }

  function reset() {
    setRecordId(null)
    setStepId('institution')
    setProfile(null)
    setConfig({ generation: true, validation: true })
    setAccess(null)
    setCertificate(null)
    setKeyMode(null)
    setResult(null)
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
      <p className="mb-6 text-text-2">Register a financial institution and set it up to generate and validate Secure Bangla QR.</p>

      <Stepper steps={steps} current={index} />

      {stepId === 'institution' && <InstitutionStep initial={profile} locked={!!profile} onSubmit={register} />}
      {stepId === 'configuration' && (
        <ConfigurationStep
          generation={config.generation}
          validation={config.validation}
          issuedClientId={access?.clientId ?? null}
          onChange={(kind, value) => {
            setConfig((c) => ({ ...c, [kind]: value }))
            // After issuance a capability change applies to the issued credentials — no new secret.
            if (access && recordId) {
              const next = { ...access, [kind]: value }
              setAccess(next)
              save({ access: next })
            }
          }}
          onBack={() => go(-1)}
          onContinue={() => go(1)}
        />
      )}
      {stepId === 'rate' && (
        <RateCardStep
          capabilities={config}
          card={rateCard}
          startMonth={currentMonth()}
          onBack={() => go(-1)}
          onContinue={() => go(1)}
          onSave={(generationRate, validationRate) => {
            // Billing starts the month the institution goes live, so the card starts now.
            if (recordId) addRateCard({ institutionId: recordId, effectiveFrom: `${currentMonth()}-01`, generationRate, validationRate })
            go(1)
          }}
        />
      )}
      {stepId === 'certificate' && (
        <CertificateStep
          initial={certificate}
          onBack={() => go(-1)}
          onSkip={() => go(1)}
          onSubmit={(c) => {
            setCertificate(c)
            save({ certificate: c })
            go(1)
          }}
        />
      )}
      {stepId === 'key' && (
        <KeyStep
          initial={keyMode}
          onBack={() => go(-1)}
          onSkip={() => go(1)}
          onSubmit={(m) => {
            setKeyMode(m)
            save({ keyMode: m })
            go(1)
          }}
        />
      )}
      {stepId === 'credentials' && profile && (
        <CredentialsStep
          capabilities={config}
          access={access}
          onBack={() => go(-1)}
          onIssue={() => {
            const c = demoCredentials(institutionCode(profile.type, profile.institutionId))
            const next = { generation: config.generation, validation: config.validation, clientId: c.clientId }
            setAccess(next)
            save({ access: next })
            setShownSecret(c)
          }}
          onContinue={() => go(1)}
        />
      )}
      {stepId === 'review' && profile && access && (
        <ReviewStep
          profile={profile}
          access={access}
          rate={rateCard}
          certificate={certificate}
          keyMode={keyMode}
          keyApplies={keyApplies}
          onBack={() => go(-1)}
          onFinish={(activate) => {
            save({ status: activate ? 'Active' : 'Pending' })
            setResult(activate ? 'Active' : 'Pending')
          }}
        />
      )}

      {shownSecret && (
        <SecretDialog
          clientId={shownSecret.clientId}
          secret={shownSecret.secret}
          onDone={() => {
            setShownSecret(null)
          }}
        />
      )}
    </div>
  )
}
