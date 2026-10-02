import { Download, FileText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { bdt, bdtRate, bdtSigned, count, periodName } from '../format'
import { cn } from '../cn'
import { downloadText as download } from '../download'
import { Button, Drawer, Table, Td, Th, toast } from '../ui'
import { statementToCsv, type BillingPeriodMeta, type Statement } from './billing'

const Amount = ({ value, signed }: { value: number; signed?: boolean }) => (
  <span className={cn(value < 0 && 'text-bad', value > 0 && signed && 'text-ok')}>{signed ? bdtSigned(value) : bdt(value)}</span>
)

/**
 * The evidence behind one number on the periods page: quantity × rate per line, adjustments with
 * their reasons, and the period's Draft/Finalized state. Shared by the staff and FI surfaces.
 */
export function StatementDrawer({
  statement,
  institutionName,
  meta,
  printHref,
  onClose,
}: {
  statement: Statement
  institutionName: string
  meta: BillingPeriodMeta
  /** Where the printable bill lives on this surface; omit when there is none. */
  printHref?: string
  onClose: () => void
}) {
  const finalized = meta.status === 'Finalized'
  const exportCsv = () => {
    download(`statement-${statement.institutionId}-${statement.period}.csv`, statementToCsv(statement, () => institutionName))
    toast.success('Statement downloaded')
  }

  return (
    <Drawer
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${institutionName} · ${periodName(statement.period)}`}
      wide
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          {printHref && (
            <Link to={printHref} className="inline-flex h-10 items-center gap-2 rounded-full border border-line px-4 font-semibold hover:bg-surface-2">
              <FileText className="size-4" aria-hidden /> Open bill (PDF)
            </Link>
          )}
          <Button variant="primary" onClick={exportCsv}>
            <Download className="size-4" aria-hidden /> Download CSV
          </Button>
        </>
      }
    >
      <div
        role="status"
        className={cn(
          'mb-5 rounded-xl border px-4 py-3.5 text-[13px]',
          finalized ? 'border-ok/30 bg-ok-bg text-ok' : 'border-warn/30 bg-warn-bg text-warn',
        )}
      >
        <b className="block text-text">
          {finalized ? 'Finalized' : 'Draft'} · {periodName(statement.period)}
        </b>
        {finalized
          ? `Locked on ${meta.finalizedAt} by ${meta.finalizedBy}. Statements cannot change.`
          : 'Figures may still change until the month is finalized.'}
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Line</Th>
            <Th right>Quantity</Th>
            <Th right>Rate</Th>
            <Th right>Amount</Th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <Td>Static generation</Td>
            <Td right>{count(statement.counts.staticGenerations)}</Td>
            <Td right>{bdtRate(statement.rate.generationRate)}</Td>
            <Td right>{bdt(statement.staticGenerationAmount)}</Td>
          </tr>
          <tr>
            <Td>Dynamic generation</Td>
            <Td right>{count(statement.counts.dynamicGenerations)}</Td>
            <Td right>{bdtRate(statement.rate.generationRate)}</Td>
            <Td right>{bdt(statement.dynamicGenerationAmount)}</Td>
          </tr>
          <tr>
            <Td>Validation (conclusive)</Td>
            <Td right>{count(statement.counts.validations)}</Td>
            <Td right>{bdtRate(statement.rate.validationRate)}</Td>
            <Td right>{bdt(statement.validationAmount)}</Td>
          </tr>
          {statement.adjustments.map((a) => (
            <tr key={a.id}>
              <Td>
                Adjustment
                <small className="block text-text-3">{a.reason}</small>
              </Td>
              <Td right>1</Td>
              <Td right>—</Td>
              <Td right>
                <Amount value={a.amount} signed />
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="border-t border-line px-5 py-3 font-semibold">Total</td>
            <td colSpan={2} />
            <td className="num border-t border-line px-5 py-3 text-right font-bold">{bdt(statement.total)}</td>
          </tr>
        </tfoot>
      </Table>

      <p className="mt-4 text-[12.5px] text-text-3">
        Rate card effective {periodName(statement.rate.effectiveFrom.slice(0, 7))}. This statement is a billing record, not a tax invoice.
      </p>
    </Drawer>
  )
}
