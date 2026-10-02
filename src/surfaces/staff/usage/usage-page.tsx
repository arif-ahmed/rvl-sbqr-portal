import { useState } from 'react'
import { Button, Card, CardHeader, EmptyRow, StatusChip, Table, Td, Th, Tr, toast } from '../../../shared/ui'
import { cn } from '../../../shared/cn'
import { sampleEvents } from '../../../shared/usage/sample'
import { UsageTable } from '../../../shared/usage/usage-table'
import { formatEventTime, meterLabel } from '../../../shared/usage/usage'
import { useInstitutions } from '../institutions/store'
import { requeue, requeueAll, useStuck } from './stuck-store'

type Tab = 'all' | 'stuck'

/** Usage across all institutions, plus usage messages that missed delivery. UI only. */
export function StaffUsagePage() {
  const [tab, setTab] = useState<Tab>('all')
  const institutions = useInstitutions()
  const stuck = useStuck()
  const name = (id: string) => institutions.find((i) => i.id === id)?.name ?? id

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: 'All usage' },
    { id: 'stuck', label: stuck.length ? `Stuck events (${stuck.length})` : 'Stuck events' },
  ]

  return (
    <>
      <div role="tablist" aria-label="Usage views" className="mb-4 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn('-mb-px border-b-2 px-4 py-2.5 font-medium', tab === t.id ? 'border-accent text-text' : 'border-transparent text-text-2 hover:text-text')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'all' ? (
        <UsageTable events={sampleEvents} institutionName={name} />
      ) : (
        <Card>
          <CardHeader
            title="Usage not yet delivered"
            sub="Messages that missed delivery. Billing periods cannot be finalized while any are outstanding."
            actions={
              stuck.length > 0 ? (
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => {
                    requeueAll()
                    toast.success('All events requeued')
                  }}
                >
                  Requeue all
                </Button>
              ) : undefined
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
              {stuck.length === 0 && <EmptyRow cols={6} title="Nothing outstanding" hint="Every usage event has been delivered." />}
              {stuck.map((e) => (
                <Tr key={e.id}>
                  <Td className="num">{e.id}</Td>
                  <Td>{name(e.institutionId)}</Td>
                  <Td>{meterLabel(e.meter)}</Td>
                  <Td className="num whitespace-nowrap">{formatEventTime(e.at)}</Td>
                  <Td>
                    <StatusChip status="Queued" />
                  </Td>
                  <Td right>
                    <Button
                      size="sm"
                      aria-label={`Requeue ${e.id}`}
                      onClick={() => {
                        requeue(e.id)
                        toast.success(`${e.id} requeued`)
                      }}
                    >
                      Requeue
                    </Button>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </>
  )
}
