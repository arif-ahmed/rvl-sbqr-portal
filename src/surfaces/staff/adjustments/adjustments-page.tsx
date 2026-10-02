import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { Session } from '../../../shared/auth/session'
import { cn } from '../../../shared/cn'
import { bdtSigned, periodName } from '../../../shared/format'
import { removeAdjustment, useBilling } from '../../../shared/billing/store'
import type { Adjustment } from '../../../shared/billing/billing'
import { Button, Card, ConfirmDialog, EmptyRow, Select, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'
import { NewAdjustmentDrawer } from './new-adjustment-drawer'

/**
 * Credits and charges for institutions, with their reasons. Pending ones settle onto the
 * statement when their period is finalized; applied ones are already part of a locked month.
 * UI only: reads the in-memory store.
 */
export function AdjustmentsPage({ session }: { session: Session }) {
  const billing = useBilling()
  const [status, setStatus] = useState<'all' | 'Pending' | 'Applied'>('all')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Adjustment | null>(null)
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id

  const rows = billing.adjustments
    .filter((a) => status === 'all' || a.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const pending = billing.adjustments.filter((a) => a.status === 'Pending').length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <p className="max-w-2xl text-text-2">
          Credits and charges recorded against an institution and period. They enter the statement when the period is finalized.
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
              <Th right>Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <EmptyRow cols={7} title="No adjustments" hint="Nothing matches this filter." />}
            {rows.map((a) => (
              <Tr key={a.id}>
                <Td className="whitespace-nowrap">
                  <span className="font-medium">{a.createdAt.slice(0, 10)}</span>
                  <small className="block text-text-3">{a.createdBy.split('@')[0]}</small>
                </Td>
                <Td>{nameOf(a.institutionId)}</Td>
                <Td className="num">{periodName(a.period)}</Td>
                <Td className="max-w-[340px]">{a.reason}</Td>
                <Td right>
                  <b className={cn(a.amount < 0 ? 'text-bad' : 'text-ok')}>{bdtSigned(a.amount)}</b>
                </Td>
                <Td>
                  <StatusChip status={a.status} />
                </Td>
                <Td right>
                  {a.status === 'Pending' ? (
                    <Button size="sm" variant="danger" aria-label={`Remove adjustment for ${nameOf(a.institutionId)}, ${periodName(a.period)}`} onClick={() => setRemoving(a)}>
                      Remove
                    </Button>
                  ) : (
                    <span className="text-[12.5px] text-text-3">Locked</span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
          An applied adjustment is part of a finalized month. Correct it, if ever, with a new adjustment on a later period.
        </p>
      </Card>

      <NewAdjustmentDrawer open={adding} onClose={() => setAdding(false)} session={session} />
      {removing && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setRemoving(null)}
          title="Remove pending adjustment?"
          description={`${bdtSigned(removing.amount)} for ${nameOf(removing.institutionId)}, ${periodName(removing.period)}. It never reached a statement.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            removeAdjustment(removing.id)
            toast.success('Adjustment removed')
            setRemoving(null)
          }}
        />
      )}
    </>
  )
}
