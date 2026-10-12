import { CreditCard, Download, FilePlus2, PlusCircle, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../../shared/api/client'
import type { Session } from '../../../shared/auth/session'
import { cn } from '../../../shared/cn'
import { bdt, bdtSigned, count, periodName } from '../../../shared/format'
import {
  blockingEvents,
  draftPeriod,
  pendingAdjustments,
  periodTotals,
  stampNow,
  type BillingData,
  type Period,
  type Statement,
} from '../../../shared/billing/billing'
import { downloadText as download } from '../../../shared/download'
import { PeriodPicker } from '../../../shared/billing/period-picker'
import { StatementDrawer } from '../../../shared/billing/statement-drawer'
import { Banner, Button, Card, CardHeader, EmptyRow, Kpi, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'
import { fetchStatementsCsv, fetchUsageCsv, useDraftPeriod, useRecalculatePeriod, useRequeueDeadEvents } from '../billing/api/hooks'
import { BillingGate } from '../billing/billing-gate'
import { FinalizeDrawer } from './finalize-drawer'

/**
 * Preparing the month's bills for every institution: draft the month, review the statements, clear
 * what blocks the close, then finalize. Every figure is the API's.
 */
export function PeriodsPage({ session }: { session: Session }) {
  return <BillingGate>{(billing) => <PeriodsBody billing={billing} session={session} />}</BillingGate>
}

function PeriodsBody({ billing, session }: { billing: BillingData; session: Session }) {
  const [period, setPeriod] = useState<Period>(() => draftPeriod(billing) ?? billing.periods[billing.periods.length - 1])
  const [selected, setSelected] = useState<Statement | null>(null)
  const [finalizing, setFinalizing] = useState(false)
  const draft = useDraftPeriod()
  const recalculate = useRecalculatePeriod()
  const requeue = useRequeueDeadEvents()

  const meta = billing.periodMeta[period]
  const finalized = meta.status === 'Finalized'
  const provisional = meta.status === 'Provisional'
  const totals = periodTotals(billing, period)
  const blocking = blockingEvents(billing, period)
  const dead = blocking.filter((e) => e.status === 'Dead')
  const pending = pendingAdjustments(billing, period).length
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id

  const createDraft = () =>
    draft.mutate(period, {
      onSuccess: () => toast.success(`${periodName(period)} draft created`),
      onError: (e) => toast.error(errorMessage(e, 'Could not create the draft.')),
    })
  const recalc = () =>
    recalculate.mutate(period, {
      onSuccess: () => toast.success(`Draft recalculated from the latest usage at ${stampNow().slice(11)}`),
      onError: (e) => toast.error(errorMessage(e, 'Could not recalculate the draft.')),
    })
  const requeueDead = () =>
    requeue.mutate(blocking, {
      onSuccess: (n) => toast.success(`${n} dead-lettered ${n === 1 ? 'event' : 'events'} requeued`),
      onError: (e) => toast.error(errorMessage(e, 'Could not requeue the events.')),
    })
  const exportStatements = async () => {
    try {
      download(`statements-${period}.csv`, await fetchStatementsCsv(period))
      toast.success('statements.csv downloaded')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not download statements.csv.'))
    }
  }
  const exportUsage = async (s: Statement) => {
    try {
      download(`usage-${period}-${nameOf(s.institutionId)}.csv`, await fetchUsageCsv(period, s.institutionId, true))
      toast.success('usage.csv downloaded')
    } catch (e) {
      toast.error(errorMessage(e, 'Could not download usage.csv.'))
    }
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-head text-2xl font-bold tracking-tight">{periodName(period)}</h2>
          <StatusChip status={meta.status} />
        </div>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2.5">
          <PeriodPicker billing={billing} value={period} onChange={setPeriod} />
          {provisional && (
            <Button variant="primary" className="h-10" disabled={draft.isPending} onClick={createDraft}>
              <FilePlus2 className="size-4" aria-hidden /> Create draft
            </Button>
          )}
          {!finalized && !provisional && (
            <>
              <Button className="h-10" disabled={recalculate.isPending} onClick={recalc}>
                <RefreshCw className="size-4" aria-hidden /> Recalculate
              </Button>
              <Button variant="primary" className="h-10" onClick={() => setFinalizing(true)}>
                Finalize period
              </Button>
            </>
          )}
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-text-2">
        {finalized
          ? `Finalized by ${meta.finalizedBy} on ${meta.finalizedAt}. This month is locked: usage and statements cannot change.`
          : provisional
            ? 'No draft exists for this month yet. The figures below are a live view of the usage so far and are not saved. A draft can be created once the month has ended and the month before is finalized.'
            : meta.calculatedAt
              ? `Statements are calculated from the usage ledger and the rate card in effect. Draft as of ${meta.calculatedAt}. Finalizing locks the month for every institution at once; corrections go into a later period.`
              : 'Statements are calculated from the usage ledger and the rate card in effect. Finalizing locks the month for every institution at once; corrections go into a later period.'}
      </p>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={<QrCode aria-hidden />} label="Billable generations" value={count(totals.counts.staticGenerations + totals.counts.dynamicGenerations)} sub={`Static ${count(totals.counts.staticGenerations)} · Dynamic ${count(totals.counts.dynamicGenerations)}`} />
        <Kpi icon={<ShieldCheck aria-hidden />} label="Billable validations" value={count(totals.counts.validations)} sub="Conclusive verdicts only" />
        <Kpi
          icon={<PlusCircle aria-hidden />}
          label="Adjustments (net)"
          value={<span className={cn(totals.adjustmentsTotal < 0 && 'text-bad')}>{totals.adjustmentsTotal ? bdtSigned(totals.adjustmentsTotal) : bdt(0)}</span>}
          sub={`${totals.statements.reduce((t, s) => t + s.adjustments.length, 0)} total${pending ? ` · ${pending} pending` : ''}`}
        />
        <Kpi icon={<CreditCard aria-hidden />} label="Period total" value={bdt(totals.total)} sub={`${totals.statements.length} institutions · BDT`} />
      </div>

      {!finalized && blocking.length > 0 && (
        <Banner tone="warn" title="Usage not complete">
          {blocking.length} usage {blocking.length === 1 ? 'event has' : 'events have'} not been recorded yet ({dead.length} dead-lettered,{' '}
          {blocking.length - dead.length} still being delivered). Finalizing is blocked until they are recorded.
          {dead.length > 0 && (
            <div className="mt-2">
              <Button size="sm" disabled={requeue.isPending} onClick={requeueDead}>
                Requeue dead-lettered ({dead.length})
              </Button>
            </div>
          )}
        </Banner>
      )}
      {!finalized && pending > 0 && (
        <Banner tone="info" title={`${pending} pending adjustment${pending > 1 ? 's' : ''}`}>
          They are included in the totals below and become part of the statements on finalize.{' '}
          <Link to="/staff/adjustments">Review adjustments</Link>
        </Banner>
      )}

      <Card>
        <CardHeader
          title="Statements"
          sub="Select a row for line items"
          actions={
            <Button size="sm" disabled={totals.statements.length === 0 || provisional} onClick={exportStatements}>
              <Download className="size-4" aria-hidden /> statements.csv
            </Button>
          }
        />
        <Table>
          <thead>
            <tr>
              <Th>Institution</Th>
              <Th right>Static gen.</Th>
              <Th right>Dynamic gen.</Th>
              <Th right>Validations</Th>
              <Th right>Subtotal</Th>
              <Th right>Adjustments</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {totals.statements.length === 0 && <EmptyRow cols={7} title="No usage in this period" />}
            {totals.statements.map((s) => (
              <Tr key={s.institutionId} onClick={() => setSelected(s)}>
                <Td>
                  <button type="button" className="text-left font-bold hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(s) }}>
                    {nameOf(s.institutionId)}
                    {s.rate.effectiveFrom && <small className="block font-normal text-text-3">Rate card from {periodName(s.rate.effectiveFrom.slice(0, 7))}</small>}
                  </button>
                </Td>
                <Td right>{count(s.counts.staticGenerations)}</Td>
                <Td right>{count(s.counts.dynamicGenerations)}</Td>
                <Td right>{count(s.counts.validations)}</Td>
                <Td right>{bdt(s.subtotal)}</Td>
                <Td right>{s.adjustmentsTotal ? <span className={cn(s.adjustmentsTotal < 0 ? 'text-bad' : 'text-ok')}>{bdtSigned(s.adjustmentsTotal)}</span> : '—'}</Td>
                <Td right>
                  <b>{bdt(s.total)}</b>
                </Td>
              </Tr>
            ))}
          </tbody>
          {totals.statements.length > 0 && (
            <tfoot>
              <tr>
                <td className="border-t border-line px-5 py-3 font-semibold">Total</td>
                <td className="num border-t border-line px-5 py-3 text-right font-semibold">{count(totals.counts.staticGenerations)}</td>
                <td className="num border-t border-line px-5 py-3 text-right font-semibold">{count(totals.counts.dynamicGenerations)}</td>
                <td className="num border-t border-line px-5 py-3 text-right font-semibold">{count(totals.counts.validations)}</td>
                <td className="num border-t border-line px-5 py-3 text-right font-semibold">{bdt(totals.subtotal)}</td>
                <td className="num border-t border-line px-5 py-3 text-right font-semibold">
                  {totals.adjustmentsTotal ? bdtSigned(totals.adjustmentsTotal) : '—'}
                </td>
                <td className="num border-t border-line px-5 py-3 text-right font-bold">{bdt(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
          Statements are billing records, not tax invoices. Finance issues invoices from approved statements.
        </p>
      </Card>

      {selected && (
        <StatementDrawer
          statement={selected}
          institutionName={nameOf(selected.institutionId)}
          meta={meta}
          printHref={`/staff/periods/${selected.period}/statements/${selected.institutionId}`}
          extraActions={
            <Button onClick={() => exportUsage(selected)}>
              <Download className="size-4" aria-hidden /> usage.csv
            </Button>
          }
          onClose={() => setSelected(null)}
        />
      )}
      {finalizing && !finalized && <FinalizeDrawer period={period} totals={totals} session={session} onClose={() => setFinalizing(false)} />}
    </>
  )
}
