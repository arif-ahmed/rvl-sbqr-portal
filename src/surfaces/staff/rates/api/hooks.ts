import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, apiGet, apiSend } from '../../../../shared/api/client'
import { useInstitutions } from '../../institutions/api/hooks'
import { toRateCard, toCreateRateCard } from './mappers'
import type { RateCardDto } from './types'

// TanStack Query bindings for the rate-cards API
// (rvl-secure-bqr-manager, src/Modules/Billing/SBQR.Modules.Billing.Api/Controllers/RateCardsController.cs).
// The server lists cards per tenant, so the page-wide hook fans out across every institution and
// merges the results. Writes invalidate every per-tenant cache so any other view of the same
// tenant (the institution detail's billing tab, the future onboarding view) stays in sync.

const base = '/v1/admin/billing/rate-cards'
const listKey = (tenantId: string) => ['rate-cards', tenantId] as const

/** `GET /v1/admin/billing/rate-cards?tenantId=` — the server returns one tenant's cards, newest first. */
async function fetchRateCards(tenantId: string): Promise<RateCardDto[]> {
  return apiGet<RateCardDto[]>(`${base}?tenantId=${encodeURIComponent(tenantId)}`)
}

/** One tenant's rate cards from the API. Used by views that already know the id (e.g. the
 *  institution detail's billing tab) so they don't pay the page-wide cost of `useAllRateCards`.
 *  Shares the same `listKey` cache entry, so writes from the Rates page stay coherent. */
export function useRateCards(tenantId: string) {
  const q = useQuery({ queryKey: listKey(tenantId), queryFn: () => fetchRateCards(tenantId) })
  return {
    items: (q.data ?? []).map(toRateCard),
    isPending: q.isPending,
    error: q.error ?? null,
  }
}

/** Every rate card across every Active institution. Empty while loading or on error.
 *  Use `useAllRateCards().status` (or `useInstitutions`' own state) when those matter. */
export function useAllRateCards() {
  const institutions = useInstitutions()
  const active = useMemo(() => institutions.filter((i) => i.status === 'Active'), [institutions])
  // One per-tenant query, all fired in parallel; useQueries flattens the array.
  const queries = useQueries({
    queries: active.map((i) => ({
      queryKey: listKey(i.id),
      queryFn: () => fetchRateCards(i.id),
      // The page lists Active institutions; never query for Pending/Suspended/Terminated,
      // even if the institution list briefly includes one in transition.
      enabled: i.status === 'Active',
    })),
    // Combine per-tenant results into one render. All-pending → 'pending'; any error → 'error'.
    combine: (results) => {
      const firstError = results.find((r) => r.error)?.error ?? null
      const isPending = results.length > 0 && results.every((r) => r.isPending)
      const items = results.flatMap((r) => (r.data ?? []).map(toRateCard))
      return { items, isPending, error: firstError }
    },
  })
  return queries
}

/** `POST /v1/admin/billing/rate-cards` — adds a card effective from the 1st of the current or a future Dhaka month.
 *  Conflict (409) means the tenant already has a card starting that month; `useAddRateCard`'s caller
 *  surfaces it as a `startMonth` field error in the drawer. */
export function useAddRateCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { institutionId: string; effectiveFrom: string; generationRate: number; validationRate: number; actorLabel: string }) =>
      apiSend<RateCardDto>('POST', base, toCreateRateCard(input)),
    onSuccess: (_data, vars) => refresh(qc, vars.institutionId),
  })
}

/** `DELETE /v1/admin/billing/rate-cards/{id}` — only allowed while the month has not started (204 / 404 / 409). */
export function useWithdrawRateCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; tenantId: string }) => apiSend<void>('DELETE', `${base}/${id}`),
    onSuccess: (_data, vars) => refresh(qc, vars.tenantId),
  })
}

function refresh(qc: QueryClient, tenantId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: listKey(tenantId) }),
    // Institution list carries `hasRateCard`; refresh it too so the list badge stays accurate.
    qc.invalidateQueries({ queryKey: ['tenants'] }),
  ])
}

/** Helper for the drawer: true if an `ApiError` is the "rate card already exists for that month" 409. */
export const isDuplicateRateCard = (e: unknown) => e instanceof ApiError && e.status === 409