import { History } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../../shared/api/client'
import { expiryDate } from '../../../shared/format'
import { Banner, Button, Chip, Drawer, EmptyRow, Table, Td, Th } from '../../../shared/ui'
import { useCryptoKeyHistory } from './api/hooks'
import type { CryptoKeyDto } from './api/types'

/** ACTIVE past its deadline is shown as Expired: the API still calls that row ACTIVE until it is replaced. */
function statusOf(k: CryptoKeyDto): { tone: 'ok' | 'bad' | 'info' | 'warn'; label: string } {
  const status = k.status.toUpperCase()
  if (status === 'ACTIVE') {
    const expired = k.validUntil != null && new Date(k.validUntil).getTime() <= Date.now()
    return expired ? { tone: 'bad', label: 'Expired' } : { tone: 'ok', label: 'Active' }
  }
  if (status === 'RETIRED') return { tone: 'info', label: 'Retired' }
  if (status === 'SUSPENDED') return { tone: 'warn', label: 'Suspended' }
  return { tone: 'bad', label: status.charAt(0) + status.slice(1).toLowerCase() }
}

function HistoryTable({ tenantId }: { tenantId: string }) {
  const history = useCryptoKeyHistory(tenantId)
  if (history.isPending) return <p className="text-text-3">Loading…</p>
  if (history.isError) return <Banner tone="bad" title="Could not load key history">{errorMessage(history.error)}</Banner>
  const keys = [...history.data.items].sort((a, b) => b.keyVersion - a.keyVersion)
  return (
    <>
      <p className="mb-4 text-[13px] text-text-2">
        Every version of this institution's signing key. Only the newest active version signs; retired versions stay here as a record.
      </p>
      <Table>
        <thead>
          <tr>
            <Th>Version</Th>
            <Th>Status</Th>
            <Th>Created</Th>
            <Th>Valid until</Th>
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 && <EmptyRow cols={4} title="No keys yet" />}
          {keys.map((k) => {
            const s = statusOf(k)
            return (
              <tr key={k.cryptoKeyId}>
                <Td className="num">v{k.keyVersion}</Td>
                <Td>
                  <Chip tone={s.tone}>{s.label}</Chip>
                </Td>
                <Td>{expiryDate(k.createdAt)}</Td>
                <Td>{expiryDate(k.validUntil)}</Td>
              </tr>
            )
          })}
        </tbody>
      </Table>
      {history.data.hasMore && <p className="mt-3 text-[12.5px] text-text-3">Showing the {history.data.items.length} most recent of {history.data.totalCount} versions.</p>}
    </>
  )
}

/** "Key history" button that opens every version of the tenant's signing key in a drawer. Loads only when opened. */
export function KeyHistoryButton({ tenantId }: { tenantId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <History className="size-4" aria-hidden /> Key history
      </Button>
      <Drawer open={open} onOpenChange={setOpen} title="Signing key history">
        {open && <HistoryTable tenantId={tenantId} />}
      </Drawer>
    </>
  )
}
