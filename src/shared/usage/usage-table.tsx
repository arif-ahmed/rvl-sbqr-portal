import { Download } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../api/client'
import { downloadText } from '../download'
import { Banner, Button, Card, EmptyRow, Input, Select, StatusChip, Table, Td, Th, Tr, toast } from '../ui'
import { useUsageEvents, type UsageScope } from './api/hooks'
import { EventPanel } from './event-panel'
import { billingReason, eventsToCsv, formatEventTime, hasFilters, meterLabel, meters, noFilters, verdictLabel, type UsageEvent, type UsageFilters } from './usage'

/**
 * Usage events, newest first, read from the API a page at a time. The filters are the API's: meter,
 * billed or not, and a date range inside `range` (Dhaka days, inclusive). Shared by the FI and staff
 * surfaces. Pass `institutionName` to add an Institution column (staff, all institutions). Pass
 * `dates={false}` when the caller already limits the events to one billing period, so a date range
 * would be noise. `csvName` names the exported file, which holds the events loaded so far.
 */
export function UsageTable({
  scope,
  range,
  institutionName,
  dates = true,
  csvName = 'usage.csv',
}: {
  scope: UsageScope
  range: { from: string; to: string }
  institutionName?: (id: string) => string
  dates?: boolean
  csvName?: string
}) {
  const [filters, setFilters] = useState<UsageFilters>(noFilters)
  const [selected, setSelected] = useState<UsageEvent | null>(null)
  const query = useUsageEvents(scope, {
    from: filters.from || range.from,
    to: filters.to || range.to,
    meter: filters.meter,
    billable: filters.billing === '' ? undefined : filters.billing === 'billable',
  })
  const { events } = query
  const cols = institutionName ? 7 : 6

  const change = (patch: Partial<UsageFilters>) => setFilters((f) => ({ ...f, ...patch }))
  const exportCsv = () => {
    downloadText(csvName, eventsToCsv(events))
    toast.success(`${events.length} events exported`)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
        <Select aria-label="Meter" className="w-auto" value={filters.meter} onChange={(e) => change({ meter: e.target.value as UsageFilters['meter'] })}>
          <option value="">All meters</option>
          {meters.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Billing" className="w-auto" value={filters.billing} onChange={(e) => change({ billing: e.target.value as UsageFilters['billing'] })}>
          <option value="">Billed and not billed</option>
          <option value="billable">Billed only</option>
          <option value="free">Not billed</option>
        </Select>
        {dates && (
          <>
            <label className="flex items-center gap-2 text-[13px] text-text-2">
              From
              <Input type="date" aria-label="From date" className="w-auto" value={filters.from} min={range.from} max={filters.to || range.to} onChange={(e) => change({ from: e.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-text-2">
              To
              <Input type="date" aria-label="To date" className="w-auto" value={filters.to} min={filters.from || range.from} max={range.to} onChange={(e) => change({ to: e.target.value })} />
            </label>
          </>
        )}
        {hasFilters(filters) && (
          <Button size="sm" variant="ghost" onClick={() => change(noFilters)}>
            Reset
          </Button>
        )}
        <span className="flex-1" />
        <Button onClick={exportCsv} disabled={events.length === 0}>
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
      </div>

      {query.error && (
        <div className="p-4 pb-0">
          <Banner tone="bad" title="Could not load usage events">
            {errorMessage(query.error)}
          </Banner>
        </div>
      )}

      <Table>
        <thead>
          <tr>
            <Th>Time</Th>
            {institutionName && <Th>Institution</Th>}
            <Th>Meter</Th>
            <Th>Client reference</Th>
            <Th>Result</Th>
            <Th>Billing</Th>
            <Th>Event</Th>
          </tr>
        </thead>
        <tbody>
          {query.isPending && !query.error && <EmptyRow cols={cols} title="Loading events…" />}
          {!query.isPending && events.length === 0 && (
            <EmptyRow cols={cols} title="No events match" hint={dates ? 'Adjust the filters or date range.' : 'Adjust the filters or pick another month.'} />
          )}
          {events.map((e) => {
            const reason = billingReason(e)
            return (
              // The event ID is the real button for keyboard and screen readers; the row click is the mouse shortcut.
              <Tr key={e.id} onClick={() => setSelected(e)}>
                <Td className="num whitespace-nowrap">{formatEventTime(e.at)}</Td>
                {institutionName && <Td>{institutionName(e.institutionId)}</Td>}
                <Td>{meterLabel(e.meter)}</Td>
                <Td className="num">{e.ref}</Td>
                <Td>
                  <StatusChip status={e.verdict} label={verdictLabel(e.verdict)} />
                </Td>
                <Td>
                  {reason.billed ? (
                    <b className="text-ok">Billed</b>
                  ) : (
                    <>
                      <b className="text-text-2">Not billed</b>
                      <small className="block text-text-3">{reason.short}</small>
                    </>
                  )}
                </Td>
                <Td>
                  <button type="button" className="num text-accent hover:underline" onClick={(ev) => { ev.stopPropagation(); setSelected(e) }}>
                    {e.id}
                  </button>
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </Table>
      {query.hasMore && (
        <div className="border-t border-line p-3 text-center">
          <Button disabled={query.isLoadingMore} onClick={() => query.loadMore()}>
            {query.isLoadingMore ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      )}
      <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
        {events.length} {events.length === 1 ? 'event' : 'events'} shown, newest first. Every completed check is billed, including rejections. Stale requests are listed but not billed; replayed and failed requests are not recorded. Select an event to see why.
      </p>
      <EventPanel event={selected} institutionName={institutionName} onClose={() => setSelected(null)} />
    </Card>
  )
}
