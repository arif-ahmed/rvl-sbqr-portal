import { CreditCard, QrCode, ScanLine } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { buildStatement, draftPeriod, type Period } from '../../shared/billing/billing'
import { PeriodPicker } from '../../shared/billing/period-picker'
import { useBilling } from '../../shared/billing/store'
import { bdt, count, monthShort, periodName } from '../../shared/format'
import { BarChart, Card, CardHeader, Kpi, StatusChip } from '../../shared/ui'
import { sampleEvents, sampleFiInstitutionId } from '../../shared/usage/sample'
import { eventPeriod } from '../../shared/usage/usage'
import { UsageTable } from '../../shared/usage/usage-table'

// UI only: until the API exists the FI user is a fixed sample institution.
const institutionId = sampleFiInstitutionId
const allEvents = sampleEvents.filter((e) => e.institutionId === institutionId)

/**
 * What this institution used, one billing period at a time: totals per operation, the months
 * side by side, and every event of the month. The totals are what the statement bills.
 */
export function UsagePage() {
  const billing = useBilling()
  const [params, setParams] = useSearchParams()
  const asked = params.get('period')
  const period: Period = asked && billing.periodMeta[asked] ? asked : (draftPeriod(billing) ?? billing.periods[billing.periods.length - 1])
  const status = billing.periodMeta[period].status
  const counts = billing.counts[institutionId]?.[period]
  const statement = buildStatement(billing, institutionId, period)
  const events = allEvents.filter((e) => eventPeriod(e) === period)

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-head text-2xl font-bold tracking-tight">{periodName(period)}</h2>
          <StatusChip status={status} />
        </div>
        <span className="flex-1" />
        <div className="flex flex-wrap items-center gap-2.5">
          <PeriodPicker billing={billing} value={period} onChange={(p) => setParams({ period: p }, { replace: true })} />
        </div>
      </div>
      <p className="mb-5 max-w-3xl text-text-2">
        {status === 'Draft'
          ? 'This month is still open. Totals can change until RVL finalizes the statement.'
          : 'This month is final. These totals are what the statement bills.'}{' '}
        Every completed check is billed, including rejections.
      </p>

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi icon={<QrCode aria-hidden />} label="Static QR generated" value={count(counts?.staticGenerations ?? 0)} />
        <Kpi icon={<QrCode aria-hidden />} label="Dynamic QR generated" value={count(counts?.dynamicGenerations ?? 0)} />
        <Kpi icon={<ScanLine aria-hidden />} label="Validations billed" value={count(counts?.validations ?? 0)} />
        <Kpi
          icon={<CreditCard aria-hidden />}
          label="Statement total"
          value={statement ? bdt(statement.total) : '—'}
          sub={
            statement ? (
              <Link to={`/fi/statements/${period}`} className="font-semibold text-accent hover:underline">
                Check the bill
              </Link>
            ) : (
              'No usage or no rate card'
            )
          }
        />
      </div>

      <Card className="mb-4">
        <CardHeader title="Billed calls by month" sub="The open month is faded" />
        <div className="p-5">
          <BarChart
            label="Billed calls by month, generations and validations"
            data={billing.periods.map((p) => {
              const c = billing.counts[institutionId]?.[p]
              return {
                label: monthShort(p),
                a: (c?.staticGenerations ?? 0) + (c?.dynamicGenerations ?? 0),
                b: c?.validations ?? 0,
                draft: billing.periodMeta[p].status === 'Draft',
              }
            })}
          />
        </div>
      </Card>

      <UsageTable events={events} dates={false} csvName={`usage-${period}.csv`} />
    </>
  )
}
