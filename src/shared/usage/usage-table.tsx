import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Button, Card, EmptyRow, Input, Pager, Select, StatusChip, Table, Td, Th, Tr, toast } from '../ui'
import { eventsToCsv, filterEvents, formatEventTime, hasFilters, meterLabel, meters, noFilters, type UsageEvent, type UsageFilters } from './usage'

const PER_PAGE = 12

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Usage events with filters, paging and CSV export. Shared by the FI and staff surfaces.
 * Pass `institutionName` to add an Institution column (staff view).
 */
export function UsageTable({ events, institutionName }: { events: UsageEvent[]; institutionName?: (id: string) => string }) {
  const [filters, setFilters] = useState<UsageFilters>(noFilters)
  const [page, setPage] = useState(1)
  const rows = useMemo(() => filterEvents(events, filters), [events, filters])
  const lastPage = Math.max(1, Math.ceil(rows.length / PER_PAGE))
  const current = Math.min(page, lastPage)
  const shown = rows.slice((current - 1) * PER_PAGE, current * PER_PAGE)
  const cols = institutionName ? 7 : 6

  const change = (patch: Partial<UsageFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }
  const exportCsv = () => {
    download('usage.csv', eventsToCsv(rows))
    toast.success(`${rows.length} events exported`)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
        <Input aria-label="Search usage" placeholder="Client reference or event ID" className="w-full sm:w-64" value={filters.query} onChange={(e) => change({ query: e.target.value })} />
        <Select aria-label="Meter" className="w-auto" value={filters.meter} onChange={(e) => change({ meter: e.target.value as UsageFilters['meter'] })}>
          <option value="">All meters</option>
          {meters.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
        <Select aria-label="Billing" className="w-auto" value={filters.billing} onChange={(e) => change({ billing: e.target.value as UsageFilters['billing'] })}>
          <option value="">Billable and not</option>
          <option value="billable">Billable only</option>
          <option value="free">Not billable</option>
        </Select>
        <label className="flex items-center gap-2 text-[13px] text-text-2">
          From
          <Input type="date" aria-label="From date" className="w-auto" value={filters.from} max={filters.to || undefined} onChange={(e) => change({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-[13px] text-text-2">
          To
          <Input type="date" aria-label="To date" className="w-auto" value={filters.to} min={filters.from || undefined} onChange={(e) => change({ to: e.target.value })} />
        </label>
        {hasFilters(filters) && (
          <Button size="sm" variant="ghost" onClick={() => change(noFilters)}>
            Reset
          </Button>
        )}
        <span className="flex-1" />
        <Button onClick={exportCsv} disabled={rows.length === 0}>
          <Download className="size-4" aria-hidden /> Export CSV
        </Button>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>Time</Th>
            {institutionName && <Th>Institution</Th>}
            <Th>Meter</Th>
            <Th>Client reference</Th>
            <Th>Result</Th>
            <Th>Billable</Th>
            <Th>Event</Th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 && <EmptyRow cols={cols} title="No events match" hint="Adjust the filters or date range." />}
          {shown.map((e) => (
            <Tr key={e.id}>
              <Td className="num whitespace-nowrap">{formatEventTime(e.at)}</Td>
              {institutionName && <Td>{institutionName(e.institutionId)}</Td>}
              <Td>{meterLabel(e.meter)}</Td>
              <Td className="num">{e.ref}</Td>
              <Td>
                <StatusChip status={e.verdict} />
              </Td>
              <Td>{e.billable ? <b className="text-ok">Yes</b> : <span className="text-text-3">No</span>}</Td>
              <Td className="num text-text-3">{e.id}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager total={rows.length} page={current} perPage={PER_PAGE} onPage={setPage} />
      <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
        Latest {events.length} events shown. Indeterminate and error validations are not billed.
      </p>
    </Card>
  )
}
