import { ArrowLeft, Check, Circle } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import type { Role } from '../../../shared/auth/session'
import { cn } from '../../../shared/cn'
import { Banner, Button, Card, CardHeader, StatusChip } from '../../../shared/ui'
import { typeLabel } from '../onboarding/institution-types'
import { InstitutionUsageTab } from '../usage/institution-usage'
import { ActionButtons } from './action-buttons'
import { daysUntil, setupItems } from './actions'
import { useInstitutions } from './store'
import type { Institution } from './types'
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

function keyText(i: Institution) {
  if (i.access && !i.access.generation) return 'Not needed. This institution can only validate QR codes.'
  if (!i.keyMode) return 'No signing key yet.'
  return i.keyMode === 'Generate' ? 'Generated and held by the platform.' : 'Existing key provided by the institution.'
}

/** One institution: profile, setup progress, credentials, certificate and signing key. UI only. */
export function InstitutionDetail({ role, tab = 'overview' }: { role: Role; tab?: 'overview' | 'usage' }) {
  const { id } = useParams()
  const institutions = useInstitutions()
  const { run, dialogs } = useInstitutionActions()
  const inst = institutions.find((i) => i.id === id)
  if (!inst) return <Navigate to="/staff/institutions" replace />
  // A pending institution cannot have usage yet, so it has no Usage tab.
  const hasUsage = inst.status !== 'Pending'
  if (tab === 'usage' && !hasUsage) return <Navigate to={`/staff/institutions/${inst.id}`} replace />

  const canManage = role === 'admin'
  const items = setupItems(inst)
  const done = items.filter((s) => s.done).length
  const expiry = inst.certificate && inst.status === 'Active' ? daysUntil(inst.certificate.expiresAt) : null

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
      ) : (
        <>
      {inst.status === 'Terminated' && <Banner tone="info" title="Closed permanently">This institution was terminated. Its key and credentials no longer work.</Banner>}
      {inst.status === 'Suspended' && <Banner tone="warn" title="Suspended">This institution cannot generate or validate QR codes until it is reactivated.</Banner>}
      {expiry !== null && expiry <= 30 && (
        <Banner tone="warn" title={expiry < 0 ? 'Certificate has expired' : `Certificate expires in ${expiry} days`}>
          Replace it before then so the institution&rsquo;s gateway keeps connecting.
        </Banner>
      )}

      {inst.status === 'Pending' && (
        <Card className="mb-4">
          <CardHeader title="Setup progress" sub={`${done} of ${items.length} done`} />
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
            {inst.access ? (
              <>
                <Facts
                  rows={[
                    ['Client ID', <span key="i" className="num">{inst.access.clientId}</span>],
                    ['Access', [inst.access.generation && 'Generation', inst.access.validation && 'Validation'].filter(Boolean).join(' · ')],
                  ]}
                />
                <p className="px-5 pb-5 text-[12.5px] text-text-3">The client secret was shown once when issued and cannot be shown again.</p>
              </>
            ) : (
              <Empty>No credentials issued yet.</Empty>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Client certificate"
              actions={
                canManage && inst.certificate && inst.status !== 'Terminated' ? (
                  <Button size="sm" onClick={() => run(inst, 'certificate')}>
                    Replace certificate
                  </Button>
                ) : undefined
              }
            />
            {inst.certificate ? (
              <Facts
                rows={[
                  ['Subject', inst.certificate.subject],
                  ['Expires', inst.certificate.expiresAt],
                  ['Thumbprint', <span key="t" className="num text-[12.5px] break-all">{inst.certificate.thumbprint}</span>],
                ]}
              />
            ) : (
              <Empty>No certificate registered yet.</Empty>
            )}
          </Card>

          <Card>
            <CardHeader title="Signing key" />
            <Empty>{keyText(inst)}</Empty>
          </Card>
        </div>
      </div>
        </>
      )}
      {dialogs}
    </>
  )
}
