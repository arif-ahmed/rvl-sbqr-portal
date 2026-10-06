import { ChevronLeft, Download, Printer } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { buildStatement, earlierStatements, statementToCsv, type BillingData } from '../../../shared/billing/billing'
import { StatementDocument } from '../../../shared/billing/statement-document'
import { downloadText } from '../../../shared/download'
import { Button } from '../../../shared/ui'
import { BillingGate } from '../billing/billing-gate'

/**
 * A statement as the bill itself: a paper preview with Download PDF (the browser's print dialog,
 * "Save as PDF") and Download CSV, both made from the API's statement.
 */
export function StatementPage() {
  return <BillingGate>{(billing) => <StatementBody billing={billing} />}</BillingGate>
}

function StatementBody({ billing }: { billing: BillingData }) {
  const { period = '', institutionId = '' } = useParams()
  const institution = billing.institutions.find((i) => i.id === institutionId)
  const meta = billing.periodMeta[period]
  const statement = institution && meta ? buildStatement(billing, institutionId, period) : null
  if (!institution || !meta || !statement) return <Navigate to="/staff/periods" replace />

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/staff/periods" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
          <ChevronLeft className="size-4" aria-hidden /> Billing periods
        </Link>
        <span className="flex-1" />
        <Button className="h-10" onClick={() => downloadText(`statement-${institutionId}-${period}.csv`, statementToCsv(statement, () => institution.name))}>
          <Download className="size-4" aria-hidden /> Download CSV
        </Button>
        <Button variant="primary" className="h-10" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Download PDF
        </Button>
      </div>
      <StatementDocument
        statement={statement}
        institutionName={institution.name}
        institutionCode={institution.code}
        meta={meta}
        earlier={earlierStatements(billing, institutionId, period)}
      />
      <p className="mx-auto mt-3 max-w-[794px] text-[12.5px] text-text-3 print:hidden">
        Download PDF opens your browser’s print dialog: choose “Save as PDF”.
      </p>
    </>
  )
}
