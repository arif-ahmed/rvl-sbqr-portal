// 2026-10-15 (cert-expiry workstream). The institution detail page used to
// show only "Key <id> v<n> (active). Held by the platform." — operators had
// no way to see the expiry chip or trigger rotation without first entering
// the onboarding wizard at step SIGNING_KEY. This card brings both onto the
// detail surface so the rotate action is discoverable from the institution
// itself. The mutations and query keys are the same ones the wizard uses
// (useRotateCryptoKey / useActiveCryptoKey from ../institutions/api/hooks),
// so any rotation invalidates the chip and the onboarding view together.

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { errorMessage } from '../../../shared/api/client'
import { Banner, Button, ExpiryChip, Field, Input } from '../../../shared/ui'
import { useActiveCryptoKey, useRotateCryptoKey } from './api/hooks'
import { ExpiredSigningKeyCard } from './expired-signing-key-card'
import { KeyHistoryButton } from './key-history'

const graceSchema = z.object({
  gracePeriodMinutes: z.number({ message: 'Enter a number of minutes.' }).int().min(0, 'Use 0 or more minutes.').max(24 * 60, 'Use 24 hours (1440) or fewer.'),
})

/**
 * Detail-page card for the tenant's ACTIVE signing key. Shows the
 * <ExpiryChip>, surfaces a "Rotate key…" form (grace period) and an
 * rotation uses the same PUT /v1/crypto-keys/{tenantId} the wizard uses. The
 * new version becomes the signing key; earlier versions are retired and kept
 * in history. There is deliberately no way to expire a key without replacing it.
 */
export function SigningKeyCard({ tenantId }: { tenantId: string }) {
  const active = useActiveCryptoKey(tenantId)
  const rotate = useRotateCryptoKey()
  const [showRotate, setShowRotate] = useState(false)
  const [expireError, setExpireError] = useState<string | null>(null)
  const rotateForm = useForm<{ gracePeriodMinutes: number }>({
    resolver: zodResolver(graceSchema),
    defaultValues: { gracePeriodMinutes: 60 },
  })

  // The query hasn't resolved yet, or the API rejected the read.
  if (active.isPending) {
    return <p className="p-5 text-text-3">Loading…</p>
  }
  if (active.isError) {
    return (
      <div className="p-5">
        <Banner tone="bad" title="Could not load the signing key">{errorMessage(active.error)}</Banner>
      </div>
    )
  }
  // /active answers 404 for an expired key, even though the onboarding view
  // still reports one. Offer the way back instead of a dead end.
  if (active.data == null) {
    return <ExpiredSigningKeyCard tenantId={tenantId} />
  }

  const key = active.data
  const busy = rotate.isPending

  function submitRotate(v: { gracePeriodMinutes: number }) {
    rotate.mutate(
      { id: tenantId, gracePeriodMinutes: v.gracePeriodMinutes },
      {
        onSuccess: () => {
          setShowRotate(false)
          setExpireError(null)
        },
        onError: (e) => setExpireError(errorMessage(e)),
      },
    )
  }

  return (
    <div className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <span className="font-medium" data-testid="signing-key-summary">
          Key <span className="num">{key.keyId}</span>, version <span className="num">{key.keyVersion}</span>
        </span>
        <ExpiryChip validUntil={key.validUntil ?? null} />
      </div>
      <p className="mb-4 text-[13px] text-text-2">
        Held by the platform. The new version is server-generated; the old key stays resolvable for in-flight
        verifications for the grace period you choose, then drops out of rotation.
      </p>

      {showRotate ? (
        <form
          onSubmit={rotateForm.handleSubmit(submitRotate)}
          className="mb-4 rounded-xl border border-line px-4 py-3.5"
        >
          <Field
            label="Grace period (minutes)"
            htmlFor="rotate-grace"
            error={rotateForm.formState.errors.gracePeriodMinutes?.message}
            hint="0 = immediate cut-over (in-flight verifications fail with SIGNING_KEY_EXPIRED). Default = 60."
          >
            <Input
              id="rotate-grace"
              type="number"
              min={0}
              max={1440}
              step={1}
              aria-invalid={!!rotateForm.formState.errors.gracePeriodMinutes}
              {...rotateForm.register('gracePeriodMinutes', { valueAsNumber: true })}
            />
          </Field>
          <div className="mt-3 flex justify-end gap-2.5">
            <Button type="button" onClick={() => setShowRotate(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? 'Rotating…' : 'Rotate key'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mb-1 flex flex-wrap gap-2.5">
          <Button type="button" onClick={() => setShowRotate(true)} disabled={busy}>
            Rotate key…
          </Button>
          <KeyHistoryButton tenantId={tenantId} />
        </div>
      )}

      {expireError && <Banner tone="bad" title="That didn't work">{expireError}</Banner>}
      {rotate.isSuccess && !showRotate && (
        <Banner tone="ok" title="Key rotated">
          The new version is active. The old key stays valid until the grace period ends.
        </Banner>
      )}
    </div>
  )
}
