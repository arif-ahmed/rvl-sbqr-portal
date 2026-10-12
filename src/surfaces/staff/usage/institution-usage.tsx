import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { errorMessage } from '../../../shared/api/client'
import { currentPeriod, type Period } from '../../../shared/billing/billing'
import { count, periodName } from '../../../shared/format'
import { Banner, Select } from '../../../shared/ui'
import { useUsageSummary } from '../../../shared/usage/api/hooks'
import { lastDayOf } from '../../../shared/usage/api/mappers'
import { UsageTable } from '../../../shared/usage/usage-table'
import { useInstitutions } from '../institutions/api/hooks'

const MONTHS_BACK = 12

/** The last 12 months, newest first. */
function recentMonths(): Period[] {
  const [y, m] = currentPeriod().split('-').map(Number)
  return Array.from({ length: MONTHS_BACK }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** Usage tab of an institution: one month's totals, then its events newest first. */
export function InstitutionUsageTab({ institutionId }: { institutionId: string }) {
  const inst = useInstitutions().find((i) => i.id === institutionId)
  const noCard = !!inst?.access && !inst.hasRateCard
  const months = useMemo(() => recentMonths(), [])
  const [period, setPeriod] = useState<Period>(months[0])
  const range = { from: `${period}-01`, to: lastDayOf(period) }
  const summary = useUsageSummary({ kind: 'staff', institutionId }, range)

  const days = summary.data?.days ?? []
  const sum = (pick: (d: (typeof days)[number]) => boolean) => days.filter(pick).reduce((t, d) => t + d.count, 0)
  const totals = [
    ['Static generation', sum((d) => d.meterCode === 'GENERATION_STATIC')],
    ['Dynamic generation', sum((d) => d.meterCode === 'GENERATION_DYNAMIC')],
    ['Validation', sum((d) => d.meterCode === 'VALIDATION')],
    ['Billable', sum((d) => d.billable)],
  ] as const

  return (
    <>
      {noCard && (
        <Banner tone="info" title="No rate card">
          This institution has no rate card for the current period. Its usage is recorded, but no statement is produced. <Link to="/staff/rates">Set a rate card</Link>.
        </Banner>
      )}
      {summary.error && (
        <Banner tone="bad" title="Could not load usage totals">
          {errorMessage(summary.error)}
        </Banner>
      )}
      <div className="mb-4 flex items-center gap-3">
        <Select aria-label="Month" className="w-auto" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {months.map((p) => (
            <option key={p} value={p}>
              {periodName(p)}
            </option>
          ))}
        </Select>
      </div>
      <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map(([label, n]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-text-3">{label}</dt>
            <dd className="num mt-1 text-2xl font-bold">{summary.data ? count(n) : '—'}</dd>
          </div>
        ))}
      </dl>
      <UsageTable key={period} scope={{ kind: 'staff', institutionId }} range={range} csvName={`usage-${period}.csv`} />
    </>
  )
}
