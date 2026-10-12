import { Download, FileText, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { bdt, bdtRate, bdtSigned, count, monthShort, percent, percentSigned, periodName } from '../../../shared/format'
import { draftPeriod, type Period, type BillingData } from '../../../shared/billing/billing'
import { PeriodPicker } from '../../../shared/billing/period-picker'
import { BillingGate } from '../billing/billing-gate'
import { downloadText } from '../../../shared/download'
import { Banner, Button, Card, CardHeader, Kpi, Select, StatusChip, Table, Td, Th, Tr } from '../../../shared/ui'
import { institutionReport, institutionReportToCsv } from './report'

/**
 * One institution's month in full: what it was charged for, how it ranks, and the months before.
 * Results by outcome and daily usage arrive with the usage ledger. UI only.
 */
export function InstitutionView() {
  return <BillingGate>{(billing) => <InstitutionViewBody billing={billing} />}</BillingGate>
}

function InstitutionViewBody({ billing }: { billing: BillingData }) {
  const [period, setPeriod] = useState<Period>(() => draftPeriod(billing) ?? billing.periods[billing.periods.length - 1])
  const [institutionId, setInstitutionId] = useState(billing.institutions[0]?.id ?? '')
  const report = institutionReport(billing, institutionId, period)
  const name = billing.institutions.find((i) => i.id === institutionId)?.name ?? institutionId
  const s = report.statement
  const hasUsage = report.history.some((h) => h.volume > 0)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-head text-2xl font-bold tracking-tight">{name}</h2>
          <StatusChip status={report.status} />
        </div>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <Select aria-label="Institution" className="w-auto" value={institutionId} onChange={(e) => setInstitutionId(e.target.value)}>
            {billing.institutions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <PeriodPicker billing={billing} value={period} onChange={setPeriod} />
          <Button className="h-10" disabled={!hasUsage} onClick={() => downloadText(`report-${institutionId}-${period}.csv`, institutionReportToCsv(report, name))}>
            <Download className="size-4" aria-hidden /> Download CSV
          </Button>
          <Button variant="primary" className="h-10" disabled={!hasUsage} onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Download PDF
          </Button>
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-text-2">
        {periodName(period)}
        {s?.rate.effectiveFrom ? `, rate card from ${periodName(s.rate.effectiveFrom.slice(0, 7))}.` : '.'}
      </p>

      {report.unbilledVolume > 0 && (
        <Banner tone="info" title="No rate card for this month">
          {count(report.unbilledVolume)} calls were recorded but not billed, and no statement is produced. <Link to="/staff/rates">Set a rate card</Link>
        </Banner>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Kpi label="Billable calls" value={s ? count(s.counts.staticGenerations + s.counts.dynamicGenerations + s.counts.validations) : '—'} />
        <Kpi label="Charged" value={s ? bdt(s.total) : '—'} sub={s?.adjustmentsTotal ? `incl. ${bdtSigned(s.adjustmentsTotal)} adjustments` : undefined} />
        <Kpi
          label="Place this month"
          value={report.rank ? `${report.rank} of ${report.of}` : '—'}
          sub={report.rank ? `${percent(report.share)} of revenue` : 'Not billed this month'}
        />
      </div>

      {s && (
        <Card className="mb-4">
          <CardHeader
            title="What was charged"
            actions={
              <Link
                to={`/staff/periods/${period}/statements/${institutionId}`}
                className="inline-flex h-9 items-center gap-2 rounded-full border border-line px-3.5 font-semibold hover:bg-surface-2 print:hidden"
              >
                <FileText className="size-4" aria-hidden /> Open bill (PDF)
              </Link>
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Operation</Th>
                <Th right>Quantity</Th>
                <Th right>Price</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              <Tr>
                <Td>Static generation</Td>
                <Td right>{count(s.counts.staticGenerations)}</Td>
                <Td right>{bdtRate(s.rate.generationRate)}</Td>
                <Td right>{bdt(s.staticGenerationAmount)}</Td>
              </Tr>
              <Tr>
                <Td>Dynamic generation</Td>
                <Td right>{count(s.counts.dynamicGenerations)}</Td>
                <Td right>{bdtRate(s.rate.generationRate)}</Td>
                <Td right>{bdt(s.dynamicGenerationAmount)}</Td>
              </Tr>
              <Tr>
                <Td>Validation (conclusive)</Td>
                <Td right>{count(s.counts.validations)}</Td>
                <Td right>{bdtRate(s.rate.validationRate)}</Td>
                <Td right>{bdt(s.validationAmount)}</Td>
              </Tr>
              {s.adjustments.map((a) => (
                <Tr key={a.id}>
                  <Td>
                    Adjustment
                    <small className="block text-text-3">{a.reason}</small>
                  </Td>
                  <Td right>1</Td>
                  <Td right>—</Td>
                  <Td right>{bdtSigned(a.amount)}</Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="border-t border-line px-5 py-3 font-semibold">Total</td>
                <td colSpan={2} className="border-t border-line" />
                <td className="num border-t border-line px-5 py-3 text-right font-bold">{bdt(s.total)}</td>
              </tr>
            </tfoot>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader title="Last six months" sub="Ending with the month above" />
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th right>Static gen.</Th>
              <Th right>Dynamic gen.</Th>
              <Th right>Validations</Th>
              <Th right>Revenue</Th>
              <Th right>Change</Th>
            </tr>
          </thead>
          <tbody>
            {report.history.map((h) => (
              <Tr key={h.period}>
                <Td>
                  {periodName(h.period)}
                  {h.status === 'Draft' && <small className="block text-text-3">Draft</small>}
                </Td>
                <Td right>{count(h.counts.staticGenerations)}</Td>
                <Td right>{count(h.counts.dynamicGenerations)}</Td>
                <Td right>{count(h.counts.validations)}</Td>
                <Td right>
                  <b>{h.revenue ? bdt(h.revenue) : '—'}</b>
                </Td>
                <Td right>{h.change === null ? '—' : `${percentSigned(h.change)}`}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {report.history.length > 1 && (
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
            Change is revenue against the month before, from {monthShort(report.history[0].period)}.
          </p>
        )}
      </Card>
    </>
  )
}
