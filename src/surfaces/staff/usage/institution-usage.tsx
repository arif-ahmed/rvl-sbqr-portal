import { Link } from 'react-router-dom'
import { count } from '../../../shared/format'
import { Banner } from '../../../shared/ui'
import { sampleEvents } from '../../../shared/usage/sample'
import { summarize } from '../../../shared/usage/usage'
import { UsageTable } from '../../../shared/usage/usage-table'
import { useInstitutions } from '../institutions/api/hooks'

/** Usage tab of an institution: totals, then every event. Events are sample data until the usage API is wired. */
export function InstitutionUsageTab({ institutionId }: { institutionId: string }) {
  const inst = useInstitutions().find((i) => i.id === institutionId)
  // Whether a rate card exists comes from the API; the events below are still sample data.
  const noCard = !!inst?.access && !inst.hasRateCard
  const events = sampleEvents.filter((e) => e.institutionId === institutionId)
  const s = summarize(events)
  const totals = [
    ['Static generation', s.staticGen],
    ['Dynamic generation', s.dynamicGen],
    ['Validation', s.validations],
    ['Billable', s.billable],
  ] as const

  return (
    <>
      {noCard && (
        <Banner tone="info" title="No rate card">
          This institution has no rate card for the current period. Its usage is recorded, but no statement is produced. <Link to="/staff/rates">Set a rate card</Link>.
        </Banner>
      )}
      <dl className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {totals.map(([label, n]) => (
          <div key={label} className="rounded-xl border border-line bg-surface p-4">
            <dt className="text-xs text-text-3">{label}</dt>
            <dd className="num mt-1 text-2xl font-bold">{count(n)}</dd>
          </div>
        ))}
      </dl>
      <UsageTable events={events} />
    </>
  )
}
