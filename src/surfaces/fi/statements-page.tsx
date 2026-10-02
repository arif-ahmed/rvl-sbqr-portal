import { Link, useNavigate } from 'react-router-dom'
import { institutionStatements } from '../../shared/billing/billing'
import { useBilling } from '../../shared/billing/store'
import { bdt, bdtSigned, count, periodName } from '../../shared/format'
import { Card, EmptyRow, StatusChip, Table, Td, Th, Tr } from '../../shared/ui'
import { sampleFiInstitutionId } from '../../shared/usage/sample'

/** Every monthly statement, newest first. Open one to check it against your usage. UI only. */
export function StatementsPage() {
  const billing = useBilling()
  const navigate = useNavigate()
  const statements = institutionStatements(billing, sampleFiInstitutionId)

  return (
    <>
      <p className="mb-4 max-w-2xl text-text-2">One statement per month. Open one to check the quantities, prices and total, or to save it as a PDF.</p>
      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th>Status</Th>
              <Th right>Billed calls</Th>
              <Th right>Subtotal</Th>
              <Th right>Adjustments</Th>
              <Th right>Total</Th>
            </tr>
          </thead>
          <tbody>
            {statements.length === 0 && <EmptyRow cols={6} title="No statements yet" hint="A statement appears once a month has billed usage." />}
            {statements.map((s) => (
              <Tr key={s.period} onClick={() => navigate(`/fi/statements/${s.period}`)}>
                <Td>
                  {/* The month is the real link for keyboard and screen readers; the row click is the mouse shortcut. */}
                  <Link to={`/fi/statements/${s.period}`} className="font-semibold text-accent hover:underline" onClick={(e) => e.stopPropagation()}>
                    {periodName(s.period)}
                  </Link>
                </Td>
                <Td>
                  <StatusChip status={billing.periodMeta[s.period].status} />
                </Td>
                <Td right>{count(s.counts.staticGenerations + s.counts.dynamicGenerations + s.counts.validations)}</Td>
                <Td right>{bdt(s.subtotal)}</Td>
                <Td right>{s.adjustmentsTotal ? bdtSigned(s.adjustmentsTotal) : '—'}</Td>
                <Td right>
                  <b>{bdt(s.total)}</b>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
