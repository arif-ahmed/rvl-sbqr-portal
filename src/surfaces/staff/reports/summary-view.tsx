import { Building2, CreditCard, Download, Printer, QrCode } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { bdt, count, monthShort, percent, percentSigned, periodName } from '../../../shared/format'
import { draftPeriod, type Period } from '../../../shared/billing/billing'
import { PeriodPicker } from '../../../shared/billing/period-picker'
import { useBilling } from '../../../shared/billing/store'
import { downloadText } from '../../../shared/download'
import { Banner, Button, Card, CardHeader, EmptyRow, Kpi, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'
import { monthlyReport, reportToCsv } from './report'

/**
 * Monthly summary: volume and revenue per institution, against the month before.
 * UI only: reads the in-memory billing store. Print and CSV stand in for the API's exports.
 */
export function SummaryView() {
  const billing = useBilling()
  const [period, setPeriod] = useState<Period>(() => draftPeriod(billing) ?? billing.periods[billing.periods.length - 1])
  const report = monthlyReport(billing, period)
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id
  const codeOf = (id: string) => billing.institutions.find((i) => i.id === id)?.code
  const vs = report.previous ? ` vs ${monthShort(report.previous)}` : ''
  const compare = (n: number | null) => (n === null ? undefined : `${percentSigned(n)}${vs}`)
  const empty = report.rows.length === 0 && report.unbilled.length === 0

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-head text-2xl font-bold tracking-tight">{periodName(period)}</h2>
          <StatusChip status={report.status} />
        </div>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <PeriodPicker billing={billing} value={period} onChange={setPeriod} />
          <Button
            className="h-10"
            disabled={empty}
            onClick={() => {
              downloadText(`report-${period}.csv`, reportToCsv(report, nameOf))
              toast.success('report.csv downloaded')
            }}
          >
            <Download className="size-4" aria-hidden /> Download CSV
          </Button>
          <Button variant="primary" className="h-10" disabled={empty} onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Download PDF
          </Button>
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-text-2">
        {report.status === 'Draft'
          ? 'Volume and revenue are provisional until the month is finalized.'
          : 'This month is finalized. Figures are the billing record.'}
      </p>

      {report.lateUsage > 0 && (
        <Banner tone="warn" title={`${report.lateUsage} late usage ${report.lateUsage === 1 ? 'event' : 'events'}`}>
          Not yet recorded, so the figures below are incomplete. <Link to="/staff/periods">Open Billing periods</Link>
        </Banner>
      )}
      {report.pendingAdjustments > 0 && (
        <Banner tone="info" title={`${report.pendingAdjustments} adjustment${report.pendingAdjustments > 1 ? 's' : ''} waiting`}>
          Included in revenue now and settled when the month is finalized. <Link to="/staff/adjustments">Review adjustments</Link>
        </Banner>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Kpi icon={<QrCode aria-hidden />} label="Billable calls" value={count(report.volume)} sub={compare(report.change.volume)} />
        <Kpi icon={<CreditCard aria-hidden />} label="Revenue" value={bdt(report.revenue)} sub={compare(report.change.revenue)} />
        <Kpi
          icon={<Building2 aria-hidden />}
          label="Institutions billed"
          value={count(report.rows.length)}
          sub={report.unbilled.length ? `${report.unbilled.length} with usage, not billed` : 'Every active institution'}
        />
      </div>

      <Card className="mb-4">
        <CardHeader title="Revenue by institution" sub="Largest first" />
        <Table>
          <thead>
            <tr>
              <Th>Institution</Th>
              <Th right>Billable calls</Th>
              <Th right>Revenue</Th>
              <Th right>Share</Th>
            </tr>
          </thead>
          <tbody>
            {report.rows.length === 0 && <EmptyRow cols={4} title="No billed usage in this month" />}
            {report.rows.map((r) => (
              <Tr key={r.institutionId}>
                <Td>
                  <b>{nameOf(r.institutionId)}</b>
                  <small className="block text-text-3">{codeOf(r.institutionId)}</small>
                </Td>
                <Td right>{count(r.volume)}</Td>
                <Td right>
                  <b>{bdt(r.revenue)}</b>
                </Td>
                <Td right>{percent(r.share)}</Td>
              </Tr>
            ))}
          </tbody>
          {report.rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="border-t border-line px-5 py-3 font-semibold">Total</td>
                <td className="num border-t border-line px-5 py-3 text-right font-semibold">{count(report.rows.reduce((t, r) => t + r.volume, 0))}</td>
                <td className="num border-t border-line px-5 py-3 text-right font-bold">{bdt(report.revenue)}</td>
                <td className="border-t border-line" />
              </tr>
            </tfoot>
          )}
        </Table>
      </Card>

      {report.unbilled.length > 0 && (
        <Card className="mb-4">
          <CardHeader title="Usage without a rate card" sub="Recorded, not billed" />
          <Table>
            <thead>
              <tr>
                <Th>Institution</Th>
                <Th right>Calls</Th>
              </tr>
            </thead>
            <tbody>
              {report.unbilled.map((u) => (
                <Tr key={u.institutionId}>
                  <Td>{nameOf(u.institutionId)}</Td>
                  <Td right>{count(u.volume)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
            No statement is produced for these institutions. <Link to="/staff/rates" className="font-semibold text-accent hover:underline">Set a rate card</Link>
          </p>
        </Card>
      )}

      <p className="text-[12.5px] text-text-3 print:hidden">
        Download PDF opens your browser’s print dialog: choose “Save as PDF”. Daily totals arrive with the usage ledger.
      </p>
    </>
  )
}
