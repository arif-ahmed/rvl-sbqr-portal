import { ChevronLeft, Download, Printer } from 'lucide-react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { buildStatement, earlierStatements, statementToCsv } from '../../shared/billing/billing'
import { StatementDocument } from '../../shared/billing/statement-document'
import { useBilling } from '../../shared/billing/store'
import { downloadText } from '../../shared/download'
import { periodName } from '../../shared/format'
import { Banner, Button } from '../../shared/ui'
import { sampleFiInstitutionId } from '../../shared/usage/sample'

/**
 * One statement as the bill itself, with what an institution needs to verify it: a pointer to its
 * usage for the month, plus PDF (the browser's print dialog) and CSV. UI only.
 */
export function StatementDetailPage() {
  const { period = '' } = useParams()
  const billing = useBilling()
  const institution = billing.institutions.find((i) => i.id === sampleFiInstitutionId)
  const meta = billing.periodMeta[period]
  const statement = institution && meta ? buildStatement(billing, sampleFiInstitutionId, period) : null
  if (!institution || !meta || !statement) return <Navigate to="/fi/statements" replace />

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3 print:hidden">
        <Link to="/fi/statements" className="inline-flex items-center gap-1 font-semibold text-accent hover:underline">
          <ChevronLeft className="size-4" aria-hidden /> Statements
        </Link>
        <span className="flex-1" />
        <Button className="h-10" onClick={() => downloadText(`statement-${period}.csv`, statementToCsv(statement, () => institution.name))}>
          <Download className="size-4" aria-hidden /> Download CSV
        </Button>
        <Button variant="primary" className="h-10" onClick={() => window.print()}>
          <Printer className="size-4" aria-hidden /> Download PDF
        </Button>
      </div>

      <div className="mx-auto mb-4 max-w-[794px] print:hidden">
        <Banner tone="info" title="Check this bill">
          Compare each quantity with your usage for the month, then multiply by the price per call. <Link to={`/fi/usage?period=${period}`}>Open usage for {periodName(period)}</Link>
        </Banner>
      </div>

      <StatementDocument
        statement={statement}
        institutionName={institution.name}
        institutionCode={institution.code}
        meta={meta}
        earlier={earlierStatements(billing, sampleFiInstitutionId, period)}
      />
      <p className="mx-auto mt-3 max-w-[794px] text-[12.5px] text-text-3 print:hidden">
        Download PDF opens your browser’s print dialog: choose “Save as PDF”.
      </p>
    </>
  )
}
