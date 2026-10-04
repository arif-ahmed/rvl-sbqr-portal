import { ArrowLeft, Check, Circle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { ApiError, errorMessage } from '../../../shared/api/client'
import type { Role } from '../../../shared/auth/session'
import { cn } from '../../../shared/cn'
import { Banner, Button, Card, CardHeader, StatusChip } from '../../../shared/ui'
import { typeLabel } from '../onboarding/institution-types'
import { InstitutionUsageTab } from '../usage/institution-usage'
import { ActionButtons } from './action-buttons'
import { daysUntil, setupItems } from './actions'
import { useInstitution, useOnboarding } from './api/hooks'
import { InstitutionBillingTab } from './institution-billing'
import { useInstitutionActions } from './use-institution-actions'

function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 p-5">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-text-3">{label}</dt>
          <dd className="min-w-0 break-words">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="p-5 text-text-3">{children}</p>

/** One institution: profile, setup progress, credentials, certificate, signing key and billing, from the API. */
export function InstitutionDetail({ role, tab = 'overview' }: { role: Role; tab?: 'overview' | 'usage' | 'billing' }) {
  const { id } = useParams()
  const institution = useInstitution(id)
  const onboardingQuery = useOnboarding(id)
  const { run, dialogs } = useInstitutionActions()
  const inst = institution.data
  const onboarding = onboardingQuery.data

  if (institution.error instanceof ApiError && institution.error.status === 404) return <Navigate to="/staff/institutions" replace />
  if (institution.isError) {
    return (
      <Banner tone="bad" title="Could not load this institution">
        {errorMessage(institution.error)} <Link to="/staff/institutions">Back to institutions</Link>
      </Banner>
    )
  }
  if (!inst) return <p className="text-text-2">Loading…</p>
  // A pending institution cannot have usage yet, so it has no Usage or Billing tab.
  const hasUsage = inst.status !== 'Pending'
  if ((tab === 'usage' || tab === 'billing') && !hasUsage) return <Navigate to={`/staff/institutions/${inst.id}`} replace />

  const canManage = role === 'admin'
  const items = setupItems(onboarding)
  const done = items.filter((s) => s.done).length
  const certificate = onboarding?.certificate ?? null
  const expiry = certificate && inst.status === 'Active' ? daysUntil(certificate.expiresAt) : null
  const credential = onboarding?.credential ?? null
  const signingKey = onboarding?.signingKey ?? null
  const config = onboarding?.configuration ?? null

  return (
    <>
      <Link to="/staff/institutions" className="mb-3 inline-flex items-center gap-1.5 text-[13px] text-text-2 hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Institutions
      </Link>

      <div className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-head text-2xl font-bold tracking-tight">{inst.name}</h2>
            <StatusChip status={inst.status} />
          </div>
          <p className="text-text-2">
            {typeLabel(inst.type)} · code <span className="num">{inst.code}</span>
          </p>
        </div>
        <span className="flex-1" />
        {canManage && <ActionButtons inst={inst} onAction={run} />}
      </div>

      {hasUsage && (
        <nav aria-label="Institution sections" className="mb-5 flex gap-1 border-b border-line">
          {[
            { label: 'Overview', to: `/staff/institutions/${inst.id}`, on: tab === 'overview' },
            { label: 'Usage', to: `/staff/institutions/${inst.id}/usage`, on: tab === 'usage' },
            { label: 'Billing', to: `/staff/institutions/${inst.id}/billing`, on: tab === 'billing' },
          ].map((t) => (
            <Link
              key={t.label}
              to={t.to}
              aria-current={t.on ? 'page' : undefined}
              className={cn('-mb-px border-b-2 px-4 py-2.5 font-medium', t.on ? 'border-accent text-text' : 'border-transparent text-text-2 hover:text-text')}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}

      {tab === 'usage' ? (
        <InstitutionUsageTab institutionId={inst.id} />
      ) : tab === 'billing' ? (
        <InstitutionBillingTab institutionId={inst.id} institutionName={inst.name} hasRateCard={inst.hasRateCard} />
      ) : (
        <>
          {inst.status === 'Terminated' && <Banner tone="info" title="Closed permanently">This institution was terminated. Its key and credentials no longer work.</Banner>}
          {inst.status === 'Suspended' && <Banner tone="warn" title="Suspended">This institution cannot generate or validate QR codes until it is reactivated.</Banner>}
          {inst.status === 'Active' && !inst.hasRateCard && (
            <Banner tone="warn" title="No rate card">
              Usage is recorded but never billed until a rate card takes effect. Rate cards start on the 1st of a future month. <Link to="/staff/rates">Set a rate card</Link>.
            </Banner>
          )}
          {expiry !== null && expiry <= 30 && (
            <Banner tone="warn" title={expiry < 0 ? 'Certificate has expired' : `Certificate expires in ${expiry} days`}>
              Replace it before then so the institution&rsquo;s gateway keeps connecting.
            </Banner>
          )}
          {onboardingQuery.isError && <Banner tone="bad" title="Could not load setup details">{errorMessage(onboardingQuery.error)}</Banner>}

          {inst.status === 'Pending' && (
            <Card className="mb-4">
              <CardHeader title="Setup progress" sub={onboarding ? `${done} of ${items.length} done` : 'Loading…'} />
              <ul className="flex flex-wrap gap-x-8 gap-y-2 p-5">
                {items.map((s) => (
                  <li key={s.label} className="flex items-center gap-2">
                    {s.done ? <Check className="size-4 text-ok" aria-label="Done" /> : <Circle className="size-4 text-text-3" aria-label="Not done" />}
                    {s.label}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title="Profile" />
              <Facts
                rows={[
                  ['Type', typeLabel(inst.type)],
                  ['Code', <span key="c" className="num">{inst.code}</span>],
                  ['Contact', inst.contactName],
                  ['Email', inst.email],
                  ['Phone', inst.phone],
                  ['Address', inst.address],
                ]}
              />
            </Card>

            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader title="API credentials" />
                {credential ? (
                  <>
                    <Facts
                      rows={[
                        ['Client ID', <span key="i" className="num">{credential.clientId}</span>],
                        ['Access', config ? [config.isQrGenerationAllowed && 'Generation', config.isQrValidationAllowed && 'Validation'].filter(Boolean).join(' · ') : ''],
                        ['Expires', credential.expiresAt?.slice(0, 10) ?? ''],
                      ]}
                    />
                    <p className="px-5 pb-5 text-[12.5px] text-text-3">The client secret was shown once when issued and cannot be shown again.</p>
                  </>
                ) : (
                  <Empty>{onboarding ? 'No credentials issued yet.' : 'Loading…'}</Empty>
                )}
              </Card>

              <Card>
                <CardHeader
                  title="Client certificate"
                  actions={
                    canManage && certificate && inst.status !== 'Terminated' ? (
                      <Button size="sm" onClick={() => run(inst, 'certificate')}>
                        Replace certificate
                      </Button>
                    ) : undefined
                  }
                />
                {certificate ? (
                  <Facts
                    rows={[
                      ['Subject', certificate.subject],
                      ['Expires', certificate.expiresAt.slice(0, 10)],
                      ['Thumbprint', <span key="t" className="num text-[12.5px] break-all">{certificate.thumbprintSha256}</span>],
                    ]}
                  />
                ) : (
                  <Empty>{onboarding ? 'No certificate registered yet.' : 'Loading…'}</Empty>
                )}
              </Card>

              <Card>
                <CardHeader title="Signing key" />
                <Empty>
                  {signingKey ? `Key ${signingKey.keyId}, version ${signingKey.version} (${signingKey.status.toLowerCase()}). Held by the platform.` : onboarding ? 'No signing key yet.' : 'Loading…'}
                </Empty>
              </Card>
            </div>
          </div>
        </>
      )}
      {dialogs}
    </>
  )
}
