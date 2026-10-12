import type { ReactNode } from 'react'
import type { BillingData } from '../../../shared/billing/billing'
import { QueryGate } from '../../../shared/ui'
import { useBillingData } from './api/hooks'

/** Loads the staff billing read model, then renders the screen with it; shows loading and failure itself. */
export function BillingGate({ children }: { children: (billing: BillingData) => ReactNode }) {
  return (
    <QueryGate state={useBillingData()} what="billing data">
      {children}
    </QueryGate>
  )
}
