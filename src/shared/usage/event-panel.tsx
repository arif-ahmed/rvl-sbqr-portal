import { Banner, Drawer, StatusChip } from '../ui'
import { billingReason, formatEventTime, meterLabel, verdictLabel, type UsageEvent } from './usage'

/**
 * One usage event and, above all, why it is or is not billed.
 * Pass `institutionName` on the staff side to also show who is charged.
 */
export function EventPanel({ event, institutionName, onClose }: { event: UsageEvent | null; institutionName?: (id: string) => string; onClose: () => void }) {
  if (!event) return null
  const reason = billingReason(event)
  const rows: [string, string][] = [
    ['Meter', meterLabel(event.meter)],
    ['Result code', event.verdict],
    ['Client reference', event.ref],
    ['Occurred', formatEventTime(event.at)],
    ...(institutionName ? ([['Paying institution', institutionName(event.institutionId)]] as [string, string][]) : []),
  ]

  return (
    <Drawer open onOpenChange={(o) => !o && onClose()} title={`Event ${event.id}`}>
      <div className="mb-4 flex items-center gap-2">
        <StatusChip status={event.verdict} label={verdictLabel(event.verdict)} />
      </div>

      <Banner tone={reason.billed ? 'ok' : 'info'} title={reason.billed ? 'Billed' : 'Not billed'}>
        {reason.why}
      </Banner>
      {reason.rejection && (
        <p className="mb-4 text-[13px] text-text-2">If the platform caused this rejection, for example an out-of-date trust store, ask Finance for an adjustment.</p>
      )}

      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-x-4 gap-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-text-3">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-5 text-[12.5px] text-text-3">Billing is decided when the event is written. Later changes to the rules do not alter it.</p>
    </Drawer>
  )
}
