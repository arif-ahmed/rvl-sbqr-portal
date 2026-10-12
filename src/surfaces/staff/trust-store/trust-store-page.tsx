import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { errorMessage } from '../../../shared/api/client'
import { Button, Card, CardHeader } from '../../../shared/ui'
import { Banner, Chip, Drawer, EmptyRow, Table, Td, Th, Tr } from '../../../shared/ui'
import { toast } from '../../../shared/ui/toast-store'
import { downloadText } from '../../../shared/download'
import { typeLabel } from '../onboarding/institution-types'
import { useTrustStore } from './use-trust-store'
import type { TrustStoreInstitution } from './api/types'
import { relativeTime } from './relative-time'

// Trust Store page: the BB-sourced institution directory with public keys.
// Read-only — BB owns the source of truth. The portal only mirrors what
// the manager has already synced. The page is intentionally minimal: a
// banner for sync health, a table of institutions, and a drawer for
// each institution's public key with copy/download.

export function TrustStorePage() {
  const { data, isPending, isError, error } = useTrustStore()
  const [selected, setSelected] = useState<TrustStoreInstitution | null>(null)

  // The banner never lies. live === true means the API just answered; false
  // means the request failed and we have nothing to show. We don't fall back
  // to the Annex A name registry here — Annex A is names, not keys, and
  // surfacing names without their keys would be a misleading "trust store".
  const banner = (() => {
    if (isPending) return { tone: 'info' as const, title: 'Loading trust store…' }
    if (isError) {
      return {
        tone: 'bad' as const,
        title: 'Could not load the trust store',
        detail: errorMessage(error, 'The BB trust store is unreachable.'),
      }
    }
    const count = data?.institutions.length ?? 0
    if (count === 0) {
      return { tone: 'warn' as const, title: 'Trust store is empty' }
    }
    return {
      tone: 'ok' as const,
      title: `Last synced ${relativeTime(data?.syncedAt ?? null)}`,
      detail: `${count} institution${count === 1 ? '' : 's'} synced from the BB trust store`,
    }
  })()

  const institutions = data?.institutions ?? []

  return (
    <>
      <Banner tone={banner.tone} title={banner.title}>
        {'detail' in banner ? banner.detail : null}
      </Banner>

      <Card>
        <CardHeader
          title="Synced institutions"
          sub="Public keys for every institution the BB trust store has published. Read-only — Bangladesh Bank owns the source of truth."
        />
        <Table>
          <thead>
            <tr>
              <Th>Institution</Th>
              <Th>Type</Th>
              <Th>Code</Th>
              <Th>Status</Th>
              <Th>Source</Th>
              <Th>Synced</Th>
            </tr>
          </thead>
          <tbody>
            {institutions.length === 0 ? (
              <EmptyRow
                cols={6}
                title={isError ? 'Trust store unavailable' : 'No institutions synced yet'}
                hint={isError ? errorMessage(error) : 'The BB trust store has not published any institutions yet.'}
              />
            ) : (
              institutions.map((inst) => (
                <Tr key={inst.institutionCode} onClick={() => setSelected(inst)}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-accent-soft text-accent-strong">
                        <Building2 className="size-[14px]" aria-hidden />
                      </span>
                      <span className="min-w-0 truncate font-medium">{inst.institutionName}</span>
                    </div>
                  </Td>
                  <Td className="text-text-2">{typeLabel(inst.instituteType)}</Td>
                  <Td>
                    <span className="num">{inst.institutionCode}</span>
                  </Td>
                  <Td>
                    <StatusChip status={inst.status} />
                  </Td>
                  <Td className="text-text-3">{inst.source}</Td>
                  <Td className="text-text-3">{relativeTime(inst.syncedAt)}</Td>
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      </Card>

      <TrustStoreDrawer institution={selected} onClose={() => setSelected(null)} />
    </>
  )
}

function TrustStoreDrawer({
  institution,
  onClose,
}: {
  institution: TrustStoreInstitution | null
  onClose: () => void
}) {
  // The drawer is always mounted so the open/close animation is consistent;
  // when no institution is selected the body is empty and the title is generic.

  async function copyPem(pem: string) {
    try {
      await navigator.clipboard.writeText(pem)
      toast.success('Public key copied')
    } catch {
      // Old browsers / insecure contexts. Fall back to a hint — the <pre>
      // is selectable so the operator can still copy with Ctrl+C.
      toast.error('Press Ctrl+C to copy the selected public key')
    }
  }

  return (
    <Drawer
      open={institution !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
      title={institution?.institutionName ?? 'Institution'}
      wide
      footer={
        institution ? (
          <>
            <Button
              onClick={() => {
                downloadText(
                  `${institution.institutionCode}.pem`,
                  institution.publicKeyPem,
                  'application/x-pem-file',
                )
              }}
            >
              Download
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                void copyPem(institution.publicKeyPem)
              }}
            >
              Copy
            </Button>
          </>
        ) : null
      }
    >
      {institution && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-[13px] text-text-2">
            <span>{typeLabel(institution.instituteType)}</span>
            <span aria-hidden>·</span>
            <span>
              code <span className="num">{institution.institutionCode}</span>
            </span>
            <StatusChip status={institution.status} />
          </div>

          <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[13px]">
            <dt className="text-text-3">Source</dt>
            <dd>{institution.source}</dd>
            <dt className="text-text-3">Key version</dt>
            <dd>
              <span className="num">{institution.keyVersion}</span>
            </dd>
            <dt className="text-text-3">Fingerprint</dt>
            <dd className="break-all font-mono text-[12.5px]">{institution.publicKeySha256}</dd>
            <dt className="text-text-3">Synced</dt>
            <dd>{new Date(institution.syncedAt).toLocaleString()}</dd>
          </dl>

          <div>
            <div className="mb-1.5 text-[13px] font-semibold">Public key</div>
            <pre className="max-h-[420px] overflow-auto rounded-lg border border-line bg-surface-2 p-3 font-mono text-[12px] leading-[18px]">
              {institution.publicKeyPem}
            </pre>
            <p className="mt-2 text-[12px] text-text-3">
              SPKI public key in PEM format. Use Copy or Download to share with partner systems.
            </p>
          </div>
        </div>
      )}
    </Drawer>
  )
}

// Status chip: keep parity with the table — ACTIVE green, SUSPENDED/RETIRED
// amber, REVOKED red, anything else neutral. Status names match the wire
// shape (UPPERCASE).
function StatusChip({ status }: { status: string }) {
  if (status === 'ACTIVE') return <Chip tone="ok">Active</Chip>
  if (status === 'SUSPENDED') return <Chip tone="warn">Suspended</Chip>
  if (status === 'RETIRED') return <Chip tone="info">Retired</Chip>
  if (status === 'REVOKED') return <Chip tone="bad">Revoked</Chip>
  return <Chip tone="info">{status}</Chip>
}
