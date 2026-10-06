import { ChevronRight, CreditCard, Gavel, QrCode, ScanLine } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { buildStatement, disputeWindowEnd, draftPeriod, institutionStatements, stampNow } from '../../shared/billing/billing'
import { bdt, count, monthShort, percentSigned, periodName } from '../../shared/format'
import { BarChart, Button, Card, CardHeader, Kpi, StatusChip, Table, Td, Th, Tr } from '../../shared/ui'
import { useUsageEvents } from '../../shared/usage/api/hooks'
import { lastDayOf } from '../../shared/usage/api/mappers'
import { formatEventTime, meterLabel, verdictLabel } from '../../shared/usage/usage'
import { FiGate, type FiBilling } from './fi-gate'

const greeting = () => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

/** The institution's home: this month so far, the months side by side, the bills and the latest activity. */
export function OverviewPage({ session }: { session: Session }) {
  return <FiGate session={session}>{(data, institutionId) => <OverviewBody data={data} institutionId={institutionId} session={session} />}</FiGate>
}

function OverviewBody({ data, institutionId, session }: { data: FiBilling; institutionId: string; session: Session }) {
  const navigate = useNavigate()
  const { billing, usage } = data
  const period = draftPeriod(billing) ?? billing.periods[billing.periods.length - 1]
  const idx = billing.periods.indexOf(period)
  const previous = idx > 0 ? billing.periods[idx - 1] : null
  const counts = usage[period]?.[institutionId]
  const recent = useUsageEvents({ kind: 'fi' }, { from: `${period}-01`, to: lastDayOf(period) }).events.slice(0, 6)
  const calls = (counts?.staticGenerations ?? 0) + (counts?.dynamicGenerations ?? 0) + (counts?.validations ?? 0)
  const prev = previous ? usage[previous]?.[institutionId] : undefined
  const prevCalls = (prev?.staticGenerations ?? 0) + (prev?.dynamicGenerations ?? 0) + (prev?.validations ?? 0)
  const change = prevCalls ? `${percentSigned(((calls - prevCalls) / prevCalls) * 100)} vs ${monthShort(previous!)}` : undefined

  const statement = buildStatement(billing, institutionId, period)
  const statements = institutionStatements(billing, institutionId)
  const lastFinal = statements.find((s) => billing.periodMeta[s.period].status === 'Finalized')
  const finalizedAt = lastFinal ? billing.periodMeta[lastFinal.period].finalizedAt : undefined
  const disputeEnd = finalizedAt ? disputeWindowEnd(finalizedAt) : null
  const disputeOpen = disputeEnd !== null && disputeEnd >= stampNow().slice(0, 10)

  return (
    <>
      <section className="mb-4 flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface px-6 py-5">
        <div className="min-w-0">
          <h2 className="font-head text-2xl font-bold tracking-tight">
            {greeting()}, {session.name.split(' ')[0]}
          </h2>
          <p className="max-w-2xl text-text-2">
            {periodName(period)} {billing.periodMeta[period].status === 'Draft' ? 'is still open' : 'is final'}:{' '}
            {count(calls)} billed calls{statement ? `, ${bdt(statement.total)} so far` : ''}.
          </p>
        </div>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => navigate(`/fi/usage?period=${period}`)}>
          See this month’s usage <ChevronRight className="size-4" aria-hidden />
        </Button>
      </section>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<QrCode aria-hidden />} label={`Billed calls · ${monthShort(period)}`} value={count(calls)} sub={change} />
        <Kpi
          icon={<ScanLine aria-hidden />}
          label={`Validations · ${monthShort(period)}`}
          value={count(counts?.validations ?? 0)}
          sub={`${count((counts?.staticGenerations ?? 0) + (counts?.dynamicGenerations ?? 0))} QR codes generated`}
        />
        <Kpi
          icon={<CreditCard aria-hidden />}
          label={`${monthShort(period)} statement`}
          value={statement ? bdt(statement.total) : '—'}
          sub={statement ? (billing.periodMeta[period].status === 'Draft' ? 'Draft · may still change' : 'Finalized') : 'No usage or no rate card'}
        />
        <Kpi
          icon={<Gavel aria-hidden />}
          label="Dispute window"
          value={disputeEnd ? (disputeOpen ? 'Open' : 'Closed') : '—'}
          sub={lastFinal && disputeEnd ? `${periodName(lastFinal.period)} bill · ${disputeOpen ? 'until' : 'ended'} ${disputeEnd}` : 'Starts when a month is finalized'}
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader
            title="Billed calls by month"
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
              label="Billed calls by month, generations and validations"
              data={billing.periods.map((p) => {
                const c = usage[p]?.[institutionId]
                return {
                  label: monthShort(p),
                  a: (c?.staticGenerations ?? 0) + (c?.dynamicGenerations ?? 0),
                  b: c?.validations ?? 0,
                  draft: billing.periodMeta[p].status === 'Draft',
                }
              })}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="Latest statements" actions={<Link to="/fi/statements" className="text-[13px] font-semibold text-accent hover:underline">View all</Link>} />
          <div>
            {statements.slice(0, 4).map((s) => (
              <Link key={s.period} to={`/fi/statements/${s.period}`} className="flex items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-surface-2">
                <span className="min-w-0">
                  <b className="block">{periodName(s.period)}</b>
                  <span className="num block text-[12.5px] text-text-3">{bdt(s.total)}</span>
                </span>
                <span className="ml-auto">
                  <StatusChip status={billing.periodMeta[s.period].status} />
                </span>
                <ChevronRight className="size-4 shrink-0 text-text-3" aria-hidden />
              </Link>
            ))}
            {statements.length === 0 && <p className="p-5 text-text-3">No statements yet.</p>}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Latest activity" actions={<Link to="/fi/usage" className="text-[13px] font-semibold text-accent hover:underline">All usage</Link>} />
        <Table>
          <thead>
            <tr>
              <Th>Time</Th>
              <Th>Meter</Th>
              <Th>Result</Th>
              <Th>Billing</Th>
            </tr>
          </thead>
          <tbody>
            {recent.map((e) => (
              <Tr key={e.id} onClick={() => navigate(`/fi/usage?period=${e.at.slice(0, 7)}`)}>
                <Td className="num whitespace-nowrap">{formatEventTime(e.at)}</Td>
                <Td>{meterLabel(e.meter)}</Td>
                <Td>
                  <StatusChip status={e.verdict} label={verdictLabel(e.verdict)} />
                </Td>
                <Td>{e.billable ? <b className="text-ok">Billed</b> : <b className="text-text-2">Not billed</b>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
