import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../../../shared/cn'
import { bdtSigned, periodName } from '../../../shared/format'
import { meterLabel } from '../../../shared/usage/usage'
import { pendingAdjustments, queuedEvents } from '../../../shared/billing/billing'
import { requeueAll, requeueEvent, useBilling } from '../../../shared/billing/store'
import { Button, Card, CardHeader, EmptyRow, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'

/** The checks Finance runs before closing a month: stuck usage and unsettled adjustments. UI only. */
export function ReportsPage() {
  const billing = useBilling()
  const [tab, setTab] = useState<'late' | 'pending'>('late')
  const late = queuedEvents(billing)
  const pending = pendingAdjustments(billing)
  const nameOf = (id: string) => billing.institutions.find((i) => i.id === id)?.name ?? id

  const tabs = [
    { key: 'late' as const, label: `Late usage${late.length ? ` (${late.length})` : ''}` },
    { key: 'pending' as const, label: `Pending adjustments${pending.length ? ` (${pending.length})` : ''}` },
  ]

  return (
    <>
      <p className="mb-4 max-w-2xl text-text-2">Checks Finance runs before closing a month.</p>

      <div role="tablist" aria-label="Report checks" className="mb-5 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 font-medium', tab === t.key ? 'border-accent text-text' : 'border-transparent text-text-2 hover:text-text')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'late' ? (
        <Card>
          <CardHeader
            title="Usage events not yet delivered"
            sub="Outbox messages that missed the period close"
            actions={
              late.length > 0 && (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    requeueAll()
                    toast.success('All queued events delivered')
                  }}
                >
                  Requeue all
                </Button>
              )
            }
          />
          <Table>
            <thead>
              <tr>
                <Th>Message</Th>
                <Th>Institution</Th>
                <Th>Meter</Th>
                <Th>Occurred</Th>
                <Th>Status</Th>
                <Th right>Action</Th>
              </tr>
            </thead>
            <tbody>
              {late.length === 0 && <EmptyRow cols={6} title="Nothing outstanding" hint="Every usage event for open periods has been delivered." />}
              {late.map((e) => (
                <Tr key={e.id}>
                  <Td className="num">{e.id}</Td>
                  <Td>{nameOf(e.institutionId)}</Td>
                  <Td>{meterLabel(e.meter)}</Td>
                  <Td className="num whitespace-nowrap">{e.occurredAt}</Td>
                  <Td>
                    <StatusChip status={e.status} />
                  </Td>
                  <Td right>
                    <Button
                      size="sm"
                      onClick={() => {
                        requeueEvent(e.id)
                        toast.success(`${e.id} delivered`)
                      }}
                    >
                      Requeue
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
            A requeued message is delivered and its usage recorded into the month. The period cannot be finalized while any event is queued.
          </p>
        </Card>
      ) : (
        <Card>
          <CardHeader title="Adjustments waiting for a period close" />
          <Table>
            <thead>
              <tr>
                <Th>Institution</Th>
                <Th>Period</Th>
                <Th>Reason</Th>
                <Th right>Amount</Th>
                <Th>Recorded by</Th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && <EmptyRow cols={5} title="No pending adjustments" />}
              {pending.map((a) => (
                <Tr key={a.id}>
                  <Td>{nameOf(a.institutionId)}</Td>
                  <Td className="num">{periodName(a.period)}</Td>
                  <Td className="max-w-[360px]">{a.reason}</Td>
                  <Td right>
                    <b className={cn(a.amount < 0 ? 'text-bad' : 'text-ok')}>{bdtSigned(a.amount)}</b>
                  </Td>
                  <Td>{a.createdBy}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <p className="border-t border-line px-5 py-3 text-[12.5px] text-text-3">
            They settle when their period is finalized. <Link to="/staff/adjustments" className="font-semibold text-accent hover:underline">Go to Adjustments</Link>
          </p>
        </Card>
      )}
    </>
  )
}
