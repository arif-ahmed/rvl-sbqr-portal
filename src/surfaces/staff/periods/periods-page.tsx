import { ChevronLeft, ChevronRight, CreditCard, Download, PlusCircle, QrCode, RefreshCw, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from '../../../shared/auth/session'
import { cn } from '../../../shared/cn'
import { bdt, bdtSigned, count, periodName } from '../../../shared/format'
import {
  draftPeriod,
  pendingAdjustments,
  periodTotals,
  queuedEvents,
  stampNow,
  statementsToCsv,
  usageToCsv,
  type Period,
  type Statement,
} from '../../../shared/billing/billing'
import { recalculatePeriod, useBilling } from '../../../shared/billing/store'
import { StatementDrawer } from '../../../shared/billing/statement-drawer'
import { Banner, Button, Card, CardHeader, EmptyRow, Kpi, Select, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'
import { FinalizeDrawer } from './finalize-drawer'

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Preparing the month's bills for every institution: review the draft statements, clear what
 * blocks the close, then finalize. UI only: reads the in-memory store.
 */
export function PeriodsPage({ session }: { session: Session }) {
  const billing = useBilling()
  const [period, setPeriod] = useState<Period>(() => draftPeriod(billing) ?? billing.periods[billing.periods.length - 1])
  const [selected, setSelected] = useState<Statement | null>(null)
  const [finalizing, setFinalizing] = useState(false)

  const meta = billing.periodMeta[period]
  const finalized = meta.status === 'Finalized'
  const totals = periodTotals(billing, period)
  const queued = queuedEvents(billing, period).length
  const pending = pendingAdjustments(billing, period).length
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id

  const idx = billing.periods.indexOf(period)
  // Newest first, one optgroup per year — the list stays scannable as months accumulate.
  const groups: { year: string; months: Period[] }[] = []
  for (const p of [...billing.periods].reverse()) {
    const year = p.slice(0, 4)
    const last = groups.at(-1)
    if (last?.year === year) last.months.push(p)
    else groups.push({ year, months: [p] })
  }

  const recalc = () => {
    recalculatePeriod(period)
    toast.success(`Draft recalculated from the latest usage at ${stampNow().slice(11)}`)
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
          <Button aria-label="Previous period" className="h-10 px-3" disabled={idx === 0} onClick={() => setPeriod(billing.periods[idx - 1])}>
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Select aria-label="Billing period" className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {groups.map((g) => (
              <optgroup key={g.year} label={g.year}>
                {g.months.map((p) => (
                  <option key={p} value={p}>
                    {periodName(p).split(' ')[0]} · {billing.periodMeta[p].status}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Button aria-label="Next period" className="h-10 px-3" disabled={idx === billing.periods.length - 1} onClick={() => setPeriod(billing.periods[idx + 1])}>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
          {!finalized && (
            <>
              <Button className="h-10" onClick={recalc}>
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

      {!finalized && queued > 0 && (
        <Banner tone="warn" title="Usage not complete">
          {queued} usage {queued === 1 ? 'event is' : 'events are'} still queued in the outbox. Finalizing is blocked until
          they are delivered. <Link to="/staff/reports">Resolve in Reports</Link>
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
            <>
              <Button
                size="sm"
                disabled={totals.statements.length === 0}
                onClick={() => {
                  download(`statements-${period}.csv`, statementsToCsv(billing, period, nameOf))
                  toast.success('statements.csv downloaded')
                }}
              >
                <Download className="size-4" aria-hidden /> statements.csv
              </Button>
              <Button
                size="sm"
                disabled={totals.statements.length === 0}
                onClick={() => {
                  download(`usage-${period}.csv`, usageToCsv(billing, period, nameOf))
                  toast.success('usage.csv downloaded')
                }}
              >
                <Download className="size-4" aria-hidden /> usage.csv
              </Button>
            </>
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
              <Th>Usage</Th>
            </tr>
          </thead>
          <tbody>
            {totals.statements.length === 0 && <EmptyRow cols={8} title="No usage in this period" />}
            {totals.statements.map((s) => (
              <Tr key={s.institutionId} onClick={() => setSelected(s)}>
                <Td>
                  <button type="button" className="text-left font-bold hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(s) }}>
                    {nameOf(s.institutionId)}
                    <small className="block font-normal text-text-3">Rate card from {periodName(s.rate.effectiveFrom.slice(0, 7))}</small>
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
                <Td>
                  {finalized || s.queuedEvents === 0 ? <StatusChip status="Complete" /> : <StatusChip status="Queued" label={`${s.queuedEvents} queued`} />}
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
                <td className="border-t border-line" />
              </tr>
            </tfoot>
          )}
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
          Statements are billing records, not tax invoices. Finance issues invoices from approved statements.
        </p>
      </Card>

      {selected && <StatementDrawer statement={selected} institutionName={nameOf(selected.institutionId)} meta={billing.periodMeta[selected.period]} onClose={() => setSelected(null)} />}
      {finalizing && !finalized && <FinalizeDrawer period={period} totals={totals} session={session} onClose={() => setFinalizing(false)} />}
    </>
  )
}
