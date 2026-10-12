import type { ReactNode } from 'react'
import type { Session } from '../../shared/auth/session'
import type { BillingData } from '../../shared/billing/billing'
import type { PeriodUsage } from '../../shared/usage/api/mappers'
import { QueryGate } from '../../shared/ui'
import { useFiBilling } from './api/hooks'

export type FiBilling = { billing: BillingData; usage: PeriodUsage }

/** Loads the institution's billing, then renders the screen with it; shows loading and failure itself. */
export function FiGate({ session, children }: { session: Session; children: (data: FiBilling, institutionId: string) => ReactNode }) {
  return (
    <QueryGate state={useFiBilling(session)} what="your billing data">
      {(data) => children(data, session.tenantId ?? '')}
    </QueryGate>
  )
}
