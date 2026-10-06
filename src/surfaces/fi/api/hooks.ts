import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '../../../shared/api/client'
import type { Session } from '../../../shared/auth/session'
import { assembleFiData } from '../../../shared/billing/api/mappers'
import type { TenantStatementDto } from '../../../shared/billing/api/types'
import { useUsageSummary } from '../../../shared/usage/api/hooks'
import { summaryRange } from '../../../shared/usage/api/mappers'

// The institution's own billing, read from /v1/billing (rvl-secure-bqr-manager, TenantBillingController).
// The tenant comes from the access token, so nothing here names it: an institution cannot ask for another's data.

/** Finalized statements plus daily usage, assembled into the shape the shared billing screens read. */
export function useFiBilling(session: Session) {
  const statements = useQuery({ queryKey: ['fi', 'statements'], queryFn: () => apiGet<TenantStatementDto[]>('/v1/billing/statements') })
  const range = useMemo(() => summaryRange((statements.data ?? []).map((s) => s.period).sort()), [statements.data])
  const usage = useUsageSummary({ kind: 'fi' }, range, !!statements.data)

  const tenantId = session.tenantId ?? ''
  const data = useMemo(
    () => (statements.data && usage.data ? assembleFiData({ tenantId, name: session.name, statements: statements.data, usageDays: usage.data.days }) : null),
    [statements.data, usage.data, tenantId, session.name],
  )
  return { data, isPending: !data && !statements.error && !usage.error, error: statements.error ?? usage.error ?? null }
}
