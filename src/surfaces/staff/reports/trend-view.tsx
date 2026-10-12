import { Download, Printer } from 'lucide-react'
import { bdt, count, monthShort, percentSigned, periodName } from '../../../shared/format'
import type { BillingData } from '../../../shared/billing/billing'
import { BillingGate } from '../billing/billing-gate'
import { downloadText } from '../../../shared/download'
import { BarChart, Button, Card, CardHeader, StatusChip, Table, Td, Th, Tr } from '../../../shared/ui'
import { trendReport, trendToCsv } from './report'

/** Revenue and volume month by month, with each institution's part. UI only. */
export function TrendView() {
  return <BillingGate>{(billing) => <TrendViewBody billing={billing} />}</BillingGate>
}

function TrendViewBody({ billing }: { billing: BillingData }) {
  const trend = trendReport(billing)
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id
  const rows = [...trend.rows].reverse()

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="font-head text-2xl font-bold tracking-tight">Revenue trend</h2>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <Button className="h-10" onClick={() => downloadText('revenue-trend.csv', trendToCsv(trend, nameOf))}>
            <Download className="size-4" aria-hidden /> Download CSV
          </Button>
          <Button variant="primary" className="h-10" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Download PDF
          </Button>
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-text-2">Every month in the ledger. The current draft month is faded and may still change.</p>

      <Card className="mb-4">
        <CardHeader title="Billable calls by month" />
        <div className="p-5">
          <BarChart
            label="Monthly billable calls, generations and validations"
            data={trend.rows.map((r) => ({
              label: monthShort(r.period),
              a: r.counts.staticGenerations + r.counts.dynamicGenerations,
              b: r.counts.validations,
              draft: r.status === 'Draft',
            }))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="Revenue by month" sub="Newest first" />
        <Table>
          <thead>
            <tr>
              <Th>Month</Th>
              <Th right>Billable calls</Th>
              {trend.institutions.map((id) => (
                <Th key={id} right>
                  {nameOf(id)}
                </Th>
              ))}
              <Th right>Revenue</Th>
              <Th right>Change</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.period}>
                <Td>
                  {periodName(r.period)}
                  <span className="ml-2 align-middle">
                    <StatusChip status={r.status} />
                  </span>
                </Td>
                <Td right>{count(r.volume)}</Td>
                {trend.institutions.map((id) => (
                  <Td key={id} right>
                    {id in r.byInstitution ? bdt(r.byInstitution[id]) : '—'}
                  </Td>
                ))}
                <Td right>
                  <b>{bdt(r.revenue)}</b>
                </Td>
                <Td right>{r.change === null ? '—' : percentSigned(r.change)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </>
  )
}
