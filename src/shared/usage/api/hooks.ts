import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { apiGet } from '../../api/client'
import type { Meter } from '../usage'
import { toUsageEvent } from './mappers'
import type { UsagePageDto, UsageSummaryDto } from './types'

// Usage reads. Staff read any institution (or all of them) under /v1/admin/billing; an FI reads only
// its own under /v1/billing, where the tenant comes from the token and cannot be chosen.

export type UsageScope = { kind: 'staff'; institutionId?: string } | { kind: 'fi' }

const base = (scope: UsageScope) => (scope.kind === 'fi' ? '/v1/billing/usage' : '/v1/admin/billing/usage')
const tenantParam = (scope: UsageScope) => (scope.kind === 'staff' && scope.institutionId ? `&tenantId=${encodeURIComponent(scope.institutionId)}` : '')
const scopeKey = (scope: UsageScope) => (scope.kind === 'fi' ? 'fi' : (scope.institutionId ?? 'all'))

export type UsageQuery = {
  /** 'YYYY-MM-DD' (Dhaka), inclusive. */
  from: string
  to: string
  meter?: Meter | ''
  /** Undefined = billed and not billed. */
  billable?: boolean
}

const PAGE_SIZE = 50

/** Newest-first usage events, one cursor page at a time; the caller asks for more. */
export function useUsageEvents(scope: UsageScope, q: UsageQuery, enabled = true) {
  const query = useInfiniteQuery({
    queryKey: ['usage', 'events', scopeKey(scope), q.from, q.to, q.meter ?? '', q.billable ?? null],
    enabled,
    initialPageParam: '',
    queryFn: ({ pageParam }) =>
      apiGet<UsagePageDto>(
        `${base(scope)}?from=${q.from}&to=${q.to}&pageSize=${PAGE_SIZE}${tenantParam(scope)}` +
          (q.meter ? `&meter=${q.meter}` : '') +
          (q.billable === undefined ? '' : `&billable=${q.billable}`) +
          (pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''),
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  })
  const events = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items.map(toUsageEvent)), [query.data])
  return {
    events,
    isPending: query.isPending,
    error: query.error ?? null,
    hasMore: !!query.hasNextPage,
    loadMore: () => query.fetchNextPage(),
    isLoadingMore: query.isFetchingNextPage,
  }
}

/** Daily counts per institution, meter and billable flag over a Dhaka date range (at most 400 days). */
export function useUsageSummary(scope: UsageScope, range: { from: string; to: string }, enabled = true) {
  return useQuery({
    queryKey: ['usage', 'summary', scopeKey(scope), range.from, range.to],
    enabled,
    queryFn: () => apiGet<UsageSummaryDto>(`${base(scope)}/summary?from=${range.from}&to=${range.to}${tenantParam(scope)}`),
  })
}
