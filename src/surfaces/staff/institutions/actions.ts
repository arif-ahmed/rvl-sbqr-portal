import type { Institution } from './types'

export type ActionId = 'continue' | 'activate' | 'suspend' | 'reactivate' | 'certificate' | 'terminate'

/**
 * Setup items an institution needs before it is fully ready. The signing key only applies if it
 * may generate QR codes. `hasRateCard` is whether a card is in effect this month — without one
 * the institution cannot be activated, because its usage would never be billed.
 */
export function setupItems(i: Institution, hasRateCard: boolean) {
  return [
    { label: 'Institution', done: true },
    { label: 'Credentials', done: !!i.access },
    { label: 'Rate card', done: hasRateCard },
    { label: 'Certificate', done: !!i.certificate },
    ...(i.access?.generation !== false ? [{ label: 'Signing key', done: !!i.keyMode }] : []),
  ]
}

export const isSetupComplete = (i: Institution, hasRateCard: boolean) => setupItems(i, hasRateCard).every((s) => s.done)

/**
 * What an admin can do to an institution, following the backend lifecycle:
 * Pending -> Active (activate), Active <-> Suspended (suspend / reactivate), any -> Terminated (one-way).
 * `primary` is the one next step worth a button; `menu` is the rest.
 */
export function actionsFor(i: Institution, hasRateCard: boolean): { primary: ActionId | null; menu: ActionId[] } {
  switch (i.status) {
    case 'Pending': {
      const complete = isSetupComplete(i, hasRateCard)
      // Only the optional items (certificate, signing key) may still be missing at activation.
      const canActivate = !!i.access && hasRateCard
      return { primary: complete ? 'activate' : 'continue', menu: [...(canActivate && !complete ? (['activate'] as const) : []), 'suspend', 'terminate'] }
    }
    case 'Active':
      return { primary: null, menu: ['certificate', 'suspend', 'terminate'] }
    case 'Suspended':
      return { primary: 'reactivate', menu: ['terminate'] }
    case 'Terminated':
      return { primary: null, menu: [] }
  }
}

export const actionLabel: Record<ActionId, string> = {
  continue: 'Continue setup',
  activate: 'Activate',
  suspend: 'Suspend',
  reactivate: 'Reactivate',
  certificate: 'Replace certificate',
  terminate: 'Terminate',
}

/** Whole days until an ISO date (negative if past). */
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)

/** What to flag under an institution's name: unfinished setup, or a certificate about to expire. */
export function institutionNote(inst: Institution, hasRateCard: boolean): { text: string; warn: boolean } | null {
  const items = setupItems(inst, hasRateCard)
  const done = items.filter((s) => s.done).length
  if (inst.status === 'Pending' && done < items.length) return { text: `${done} of ${items.length} setup items done`, warn: false }
  const expiry = inst.certificate && inst.status === 'Active' ? daysUntil(inst.certificate.expiresAt) : null
  if (expiry !== null && expiry <= 30) return { text: expiry < 0 ? 'Certificate has expired' : `Certificate expires in ${expiry} days`, warn: true }
  return null
}
