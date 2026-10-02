import { useState } from 'react'
import { Link } from 'react-router-dom'
import { bdt, bdtRate, count, periodName } from '../../../shared/format'
import { buildStatement, monthAfter, rateCardFor, type Statement } from '../../../shared/billing/billing'
import { useBilling } from '../../../shared/billing/store'
import { StatementDrawer } from '../../../shared/billing/statement-drawer'
import { Card, CardHeader, EmptyRow, StatusChip, Table, Td, Th, Tr } from '../../../shared/ui'

/** One institution's billing: the statements it has received and the price its usage is charged at. UI only. */
export function InstitutionBillingTab({ institutionId, institutionName }: { institutionId: string; institutionName: string }) {
  const billing = useBilling()
  const [selected, setSelected] = useState<Statement | null>(null)
  const statements = [...billing.periods]
    .reverse()
    .map((p) => buildStatement(billing, institutionId, p))
    .filter((s): s is Statement => s !== null)
  // The card shown is the one charging usage right now, after the last closed month.
  const effectMonth = monthAfter(billing.periods[billing.periods.length - 1])
  const card = rateCardFor(billing.rateCards, institutionId, effectMonth)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader title="Statements" sub="Select a row for line items" />
        <Table>
          <thead>
            <tr>
              <Th>Period</Th>
              <Th right>Calls</Th>
              <Th right>Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {statements.length === 0 && <EmptyRow cols={4} title="No billing yet" hint="Statements appear after the first month of usage." />}
            {statements.map((s) => (
              <Tr key={s.period} onClick={() => setSelected(s)}>
                <Td>
                  <button type="button" className="text-left font-bold hover:underline" onClick={(e) => { e.stopPropagation(); setSelected(s) }}>
                    {periodName(s.period)}
                  </button>
                </Td>
                <Td right>{count(s.counts.staticGenerations + s.counts.dynamicGenerations + s.counts.validations)}</Td>
                <Td right>
                  <b>{bdt(s.total)}</b>
                </Td>
                <Td>
                  <StatusChip status={billing.periodMeta[s.period].status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">Statements are billing records, not tax invoices.</p>
      </Card>

      <Card>
        <CardHeader title="Rate card in effect" />
        {card ? (
          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 p-5">
            <dt className="text-text-3">Effective</dt>
            <dd>{periodName(card.effectiveFrom.slice(0, 7))}</dd>
            <dt className="text-text-3">Generation</dt>
            <dd className="num">{bdtRate(card.generationRate)} / call</dd>
            <dt className="text-text-3">Validation</dt>
            <dd className="num">{bdtRate(card.validationRate)} / call</dd>
            <dt className="text-text-3">Currency</dt>
            <dd>BDT</dd>
          </dl>
        ) : (
          <p className="p-5 text-text-3">
            <b className="block text-[15px] text-text">No rate card</b>
            Usage cannot be billed until one exists.
          </p>
        )}
        <p className="border-t border-line px-5 py-3">
          <Link to="/staff/rates" className="text-[13px] font-semibold text-accent hover:underline">
            Manage rate cards
          </Link>
        </p>
      </Card>

      {selected && (
        <StatementDrawer statement={selected} institutionName={institutionName} meta={billing.periodMeta[selected.period]} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
