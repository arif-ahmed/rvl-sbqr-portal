import { useState } from 'react'
import { ApiError, errorMessage } from '../../../shared/api/client'
import { Banner, Button } from '../../../shared/ui'
import { KeyHistoryButton } from './key-history'
import { useCreateSigningKey, useRotateCryptoKey } from './api/hooks'

/**
 * Detail-page card for an institution (any status but Terminated) with no valid
 * signing key, usually because it expired. The tenant's life-cycle is unaffected;
 * only the key needs replacing, and the server picks the default lifetime.
 */
export function ExpiredSigningKeyCard({ tenantId }: { tenantId: string }) {
  const rotate = useRotateCryptoKey()
  const create = useCreateSigningKey()
  const [error, setError] = useState<string | null>(null)
  const busy = rotate.isPending || create.isPending

  async function generate() {
    setError(null)
    try {
      // An expired key keeps status ACTIVE until it is replaced, so rotating retires it
      // and mints the next version. Mint is only for a tenant with no key row at all.
      await rotate.mutateAsync({ id: tenantId })
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) return setError(errorMessage(e))
      try {
        await create.mutateAsync({ id: tenantId, mode: 'Generate' })
      } catch (e2) {
        setError(errorMessage(e2))
      }
    }
  }

  return (
    <div className="p-5">
      <Banner tone="warn" title="No valid signing key">
        The previous key has expired, or none has been issued yet, so this institution cannot sign QR codes. Generate a new key to continue.
      </Banner>
      <div className="mt-3 flex flex-wrap gap-2.5">
        <Button type="button" variant="primary" onClick={generate} disabled={busy}>
          {busy ?'Generating…' : 'Generate new key'}
        </Button>
        <KeyHistoryButton tenantId={tenantId} />
      </div>
      {error && <Banner tone="bad" title="That didn't work">{error}</Banner>}
    </div>
  )
}
