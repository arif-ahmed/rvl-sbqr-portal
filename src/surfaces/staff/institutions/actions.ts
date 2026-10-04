import { isStepDone, stepLabels } from './api/mappers'
import type { OnboardingDto } from './api/types'
import type { Institution } from './types'

export type ActionId = 'continue' | 'activate' | 'suspend' | 'reactivate' | 'certificate' | 'terminate'

/** The onboarding steps and whether each is done (a skipped optional step counts as done), for the progress card. */
export function setupItems(onboarding: OnboardingDto | undefined) {
  return (onboarding?.steps ?? []).map((s) => ({ label: stepLabels[s.code], done: isStepDone(s.status) }))
}

/**
 * What an admin can do to an institution, following the backend lifecycle:
 * Pending -> Active (activate), Active <-> Suspended (suspend / reactivate), any -> Terminated (one-way).
 * `primary` is the one next step worth a button; `menu` is the rest. A Pending institution whose
 * only remaining step is Review is ready to activate; the API still names anything missing.
 */
export function actionsFor(i: Institution): { primary: ActionId | null; menu: ActionId[] } {
  switch (i.status) {
    case 'Pending': {
      const ready = i.setup?.currentStep === 'REVIEW'
      return { primary: ready ? 'activate' : 'continue', menu: [...(ready ? (['continue'] as const) : []), 'suspend', 'terminate'] }
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

/** What to flag under an institution's name: unfinished setup, or a live institution that cannot be billed. */
export function institutionNote(inst: Institution): { text: string; warn: boolean } | null {
  if (inst.status === 'Pending' && inst.setup && inst.setup.completed < inst.setup.total) {
    return { text: `${inst.setup.completed} of ${inst.setup.total} setup steps done`, warn: false }
  }
  if (inst.status === 'Active' && !inst.hasRateCard) return { text: 'No rate card, usage is not billed', warn: true }
  return null
}
