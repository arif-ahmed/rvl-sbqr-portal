import { AlertTriangle, Building2, ChevronRight, Clock, CreditCard, Flag, Info, Plus, QrCode } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { cn } from '../../shared/cn'
import { bdt, count, monthShort, periodName } from '../../shared/format'
import { draftPeriod, openIssues, pendingAdjustments, periodTotals, queuedEvents } from '../../shared/billing/billing'
import { useBilling } from '../../shared/billing/store'
import { useInstitutions } from './institutions/api/hooks'

import { BarChart, Button, Card, CardHeader, Kpi, Table, Td, Th, Tr } from '../../shared/ui'

type Tone = 'ok' | 'warn' | 'info' | 'bad'
const toneClasses: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  info: 'bg-info-bg text-info',
  bad: 'bg-bad-bg text-bad',
}

type AttentionItem = { tone: Tone; icon: LucideIcon; title: string; sub: string; to: string }

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/** The staff home: the month-close story for Finance, the platform story for Admin. UI only. */
export function OverviewPage({ session }: { session: Session }) {
  const navigate = useNavigate()
  const billing = useBilling()
  const institutions = useInstitutions()
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id

  const draft = draftPeriod(billing)
  const draftIndex = draft ? billing.periods.indexOf(draft) : -1
  const previous = draftIndex > 0 ? billing.periods[draftIndex - 1] : null
  const totals = draft ? periodTotals(billing, draft) : null
  const prevTotals = previous ? periodTotals(billing, previous) : null
  const queued = queuedEvents(billing).length
  const pending = pendingAdjustments(billing).length
  const issues = openIssues(billing)
  const active = institutions.filter((i) => i.status === 'Active')
  const calls = totals ? totals.counts.staticGenerations + totals.counts.dynamicGenerations + totals.counts.validations : 0
  const prevCalls = prevTotals
    ? prevTotals.counts.staticGenerations + prevTotals.counts.dynamicGenerations + prevTotals.counts.validations
    : 0
  const mom =
    previous && prevCalls
      ? `${calls >= prevCalls ? '+' : ''}${(((calls || 1) / prevCalls - 1) * 100).toFixed(1)}% vs ${monthShort(previous)}`
      : undefined

  const attention: AttentionItem[] = []
  if (queued > 0) attention.push({ tone: 'warn', icon: AlertTriangle, title: `${queued} usage events queued`, sub: `${nameOf(queuedEvents(billing)[0].institutionId)} · blocks finalizing`, to: '/staff/periods' })
  if (pending > 0 && draft) attention.push({ tone: 'info', icon: Info, title: `${pending} pending adjustments`, sub: `Applied when ${periodName(draft)} is finalized`, to: '/staff/adjustments' })
  // Certificate expiry is not in the tenant list; the institution page warns about it. A live institution with no rate card is.
  for (const i of active.filter((a) => !a.hasRateCard))
    attention.push({ tone: 'warn', icon: Clock, title: 'No rate card, usage is not billed', sub: i.name, to: `/staff/institutions/${i.id}` })
  const awaiting = institutions.find((i) => i.status === 'Pending')
  if (awaiting) attention.push({ tone: 'info', icon: Building2, title: 'Activation pending', sub: awaiting.name, to: `/staff/institutions/${awaiting.id}` })

  const share = totals ? [...totals.statements].sort((a, b) => b.total - a.total) : []

  return (
    <>
      <section className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-head text-2xl font-bold tracking-tight">
            {session.role === 'finance' && draft ? `${periodName(draft)} is ready to close` : `${greeting()}, ${session.name.split(' ')[0]}`}
          </h2>
          <p className="max-w-2xl text-text-2">
            {session.role === 'finance' && draft
              ? queued > 0
                ? `${queued} usage events are still queued. Resolve them, then finalize the month.`
                : 'All usage is delivered. Review the draft statements and finalize the month.'
              : `${active.length} institutions are live, ${institutions.filter((i) => i.status === 'Pending').length} awaiting activation. Onboard a new institution or review certificates nearing expiry.`}
          </p>
        </div>
        <span className="flex-1" />
        {session.role === 'finance' && draft ? (
          <Button variant="primary" onClick={() => navigate('/staff/periods')}>
            Open billing period <ChevronRight className="size-4" aria-hidden />
          </Button>
        ) : (
          <Button variant="primary" onClick={() => navigate('/staff/institutions/new')}>
            <Plus className="size-4" aria-hidden /> Add institution
          </Button>
        )}
      </section>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<Building2 aria-hidden />} label="Live institutions" value={<>{count(active.length)}<span className="text-base font-medium text-text-3"> / {count(institutions.length)}</span></>} sub={`${institutions.filter((i) => i.status === 'Pending').length} pending · ${institutions.filter((i) => i.status === 'Suspended').length} suspended`} />
        <Kpi
          icon={<QrCode aria-hidden />}
          label={draft ? `Billable calls · ${monthShort(draft)}` : 'Billable calls'}
          value={count(calls)}
          sub={mom}
        />
        <Kpi icon={<CreditCard aria-hidden />} label={draft ? `${periodName(draft)} total` : 'Period total'} value={totals ? bdt(totals.total) : bdt(0)} sub={draft && billing.periodMeta[draft].status === 'Draft' ? 'Draft · not yet finalized' : 'Finalized'} />
        <Kpi icon={<Flag aria-hidden />} label="Open items" value={count(issues)} sub={issues ? 'Need attention before month close' : 'All clear'} />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            title="Billable calls by month"
            actions={
              <div className="flex items-center gap-4 text-[12.5px] text-text-2">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-accent/40" aria-hidden /> Generations
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block size-2 rounded-full bg-accent" aria-hidden /> Validations
                </span>
              </div>
            }
          />
          <div className="p-5">
            <BarChart
              label="Monthly billable calls, generations and validations"
              data={billing.periods.map((p) => {
                const t = periodTotals(billing, p)
                return { label: monthShort(p), a: t.counts.staticGenerations + t.counts.dynamicGenerations, b: t.counts.validations, draft: billing.periodMeta[p].status === 'Draft' }
              })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Needs attention" />
          <div>
            {attention.length === 0 && <p className="p-5 text-text-3">All clear. Nothing needs attention before the month closes.</p>}
            {attention.map((item) => (
              <Link
                key={item.title}
                to={item.to}
                className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-surface-2"
              >
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg', toneClasses[item.tone])}>
                  <item.icon className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <b className="block">{item.title}</b>
                  <span className="block text-[12.5px] text-text-3">{item.sub}</span>
                </span>
                <ChevronRight className="ml-auto size-4 shrink-0 text-text-3" aria-hidden />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {draft && totals && (
        <Card>
          <CardHeader
            title={`Institutions · ${periodName(draft)}`}
            actions={
              <Button size="sm" onClick={() => navigate(session.role === 'finance' ? '/staff/periods' : '/staff/institutions')}>
                View all
              </Button>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Institution</Th>
                <Th right>Billable calls</Th>
                <Th right>Total</Th>
                <Th className="w-[22%]">Share of month</Th>
              </tr>
            </thead>
            <tbody>
              {share.map((s) => {
                const pct = totals.total ? (Math.abs(s.total) / totals.total) * 100 : 0
                return (
                  <Tr key={s.institutionId} onClick={() => navigate(`/staff/institutions/${s.institutionId}`)}>
                    <Td>
                      <button type="button" className="text-left font-bold hover:underline" onClick={(e) => { e.stopPropagation(); navigate(`/staff/institutions/${s.institutionId}`) }}>
                        {nameOf(s.institutionId)}
                        <small className="block font-normal text-text-3">{billing.institutions.find((i) => i.id === s.institutionId)?.code}</small>
                      </button>
                    </Td>
                    <Td right>{count(s.counts.staticGenerations + s.counts.dynamicGenerations + s.counts.validations)}</Td>
                    <Td right>
                      <b>{bdt(s.total)}</b>
                    </Td>
                    <Td>
                      <div className="h-2 w-full rounded-full bg-surface-2" role="img" aria-label={`${pct.toFixed(1)}% of the month`}>
                        <div className="h-2 rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, pct)).toFixed(1)}%` }} />
                      </div>
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  )
}
