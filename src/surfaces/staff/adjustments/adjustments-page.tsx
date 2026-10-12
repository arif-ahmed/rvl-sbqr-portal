import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Session } from '../../../shared/auth/session'
import { cn } from '../../../shared/cn'
import { bdtSigned, periodName } from '../../../shared/format'
import type { BillingData } from '../../../shared/billing/billing'
import { Button, Card, EmptyRow, Select, StatusChip, Table, Td, Th, Tr } from '../../../shared/ui'
import { BillingGate } from '../billing/billing-gate'
import { NewAdjustmentDrawer } from './new-adjustment-drawer'

/**
 * Credits and charges for institutions, with their reasons. Pending ones settle onto the
 * statement when the open month is finalized; applied ones are already part of a locked month.
 * Adjustments are append-only: a mistake is corrected with a new, offsetting adjustment.
 */
export function AdjustmentsPage({ session }: { session: Session }) {
  return <BillingGate>{(billing) => <AdjustmentsBody billing={billing} session={session} />}</BillingGate>
}

function AdjustmentsBody({ billing, session }: { billing: BillingData; session: Session }) {
  const [status, setStatus] = useState<'all' | 'Pending' | 'Applied'>('all')
  const [adding, setAdding] = useState(false)
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id

  const rows = billing.adjustments
    .filter((a) => status === 'all' || a.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pending = billing.adjustments.filter((a) => a.status === 'Pending').length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-text-2">
          Credits and charges recorded against an institution. They enter its statement when the open month is finalized.
        </p>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden /> Record adjustment
        </Button>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2.5 border-b border-line p-4">
          <Select aria-label="Status filter" className="w-auto" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="all">All</option>
            <option value="Pending">Pending</option>
            <option value="Applied">Applied</option>
          </Select>
          <span className="flex-1" />
          <span className="text-[12.5px] text-text-3">
            {rows.length} adjustment{rows.length === 1 ? '' : 's'} · {pending} pending
          </span>
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Recorded</Th>
              <Th>Institution</Th>
              <Th>Period</Th>
              <Th>Reason</Th>
              <Th right>Amount</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={6} title="No adjustments" hint="Nothing matches this filter." />}
            {rows.map((a) => (
              <Tr key={a.id}>
                <Td className="whitespace-nowrap">
                  <span className="font-medium">{a.createdAt.slice(0, 10)}</span>
                  <small className="block text-text-3">{a.createdBy.split('@')[0]}</small>
                </Td>
                <Td>{nameOf(a.institutionId)}</Td>
                <Td className="num">
                  {periodName(a.period)}
                  {a.status === 'Pending' && <small className="block text-text-3">when finalized</small>}
                </Td>
                <Td className="max-w-[340px]">{a.reason}</Td>
                <Td right>
                  <b className={cn(a.amount < 0 ? 'text-bad' : 'text-ok')}>{bdtSigned(a.amount)}</b>
                </Td>
                <Td>
                  <StatusChip status={a.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
          Adjustments cannot be edited or removed. Correct a mistake with a new adjustment that offsets it.
        </p>
      </Card>

      <NewAdjustmentDrawer open={adding} onClose={() => setAdding(false)} session={session} billing={billing} />
    </>
  )
}
