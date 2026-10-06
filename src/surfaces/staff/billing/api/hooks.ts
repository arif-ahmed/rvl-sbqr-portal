import { useMemo } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, apiGet, apiGetText, apiSend } from '../../../../shared/api/client'
import type { BillingData, FinalizeOutcome, OutboxEvent, Period } from '../../../../shared/billing/billing'
import { assembleBillingData, offeredPeriods } from '../../../../shared/billing/api/mappers'
import type { AdjustmentDto, BillingPeriodDto, FinalizedPeriodDto, OutboxBacklogDto, PeriodSummaryDto } from '../../../../shared/billing/api/types'
import { summaryRange } from '../../../../shared/usage/api/mappers'
import { useUsageSummary } from '../../../../shared/usage/api/hooks'
import { useInstitutionList } from '../../institutions/api/hooks'
import { useAllRateCards } from '../../rates/api/hooks'

// TanStack Query bindings for the staff billing API (rvl-secure-bqr-manager, src/Modules/Billing and
// src/Modules/Metering, all under /v1/admin). One read model, `useBillingData`, feeds every staff
// billing screen; every write invalidates the whole ['billing'] tree so they never disagree.

const base = '/v1/admin/billing'
const root = ['billing'] as const

const keys = {
  periods: [...root, 'periods'] as const,
  period: (p: Period) => [...root, 'period', p] as const,
  adjustments: [...root, 'adjustments'] as const,
  outbox: [...root, 'outbox'] as const,
}

const MAX_OUTBOX = 500

export type BillingDataState = { data: BillingData | null; isPending: boolean; error: unknown }

/** Stored periods, then every offered month, adjustments and the usage backlog, assembled into one `BillingData`. */
export function useBillingData(): BillingDataState {
  const institutions = useInstitutionList()
  const stored = useQuery({ queryKey: keys.periods, queryFn: () => apiGet<PeriodSummaryDto[]>(`${base}/periods`) })
  const offered = useMemo(() => (stored.data ? offeredPeriods(stored.data) : []), [stored.data])
  // `combine` hands back a structurally shared result, so `periods.data` only changes when a response did.
  const periods = useQueries({
    queries: offered.map((p) => ({ queryKey: keys.period(p), queryFn: () => apiGet<BillingPeriodDto>(`${base}/periods/${p}`) })),
    combine: (results) => ({ data: results.map((r) => r.data), error: results.find((r) => r.error)?.error ?? null }),
  })
  const adjustments = useQuery({ queryKey: keys.adjustments, queryFn: () => apiGet<AdjustmentDto[]>(`${base}/adjustments`) })
  const outbox = useQuery({ queryKey: keys.outbox, queryFn: () => apiGet<OutboxBacklogDto>(`/v1/admin/outbox?limit=${MAX_OUTBOX}`) })
  const rateCards = useAllRateCards()
  const usage = useUsageSummary({ kind: 'staff' }, summaryRange(offered), offered.length > 0)

  const error = [institutions, stored, adjustments, outbox, usage].find((q) => q.error)?.error ?? periods.error ?? rateCards.error ?? null
  const periodsReady = !!stored.data && periods.data.every(Boolean)
  const ready = !!institutions.data && !!adjustments.data && !!outbox.data && !!usage.data && periodsReady

  const data = useMemo(() => {
    if (!ready) return null
    const starts = new Map(rateCards.items.map((c) => [c.id, c.effectiveFrom]))
    return assembleBillingData({
      institutions: institutions.data!.map((i) => ({ id: i.id, name: i.name, code: i.code })),
      periods: periods.data as BillingPeriodDto[],
      adjustments: adjustments.data!,
      outbox: outbox.data!,
      usageDays: usage.data!.days,
      rateCardStart: (id) => starts.get(id),
    })
  }, [ready, institutions.data, adjustments.data, outbox.data, usage.data, rateCards.items, periods.data])

  return { data, isPending: !data && !error, error }
}

const refreshAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: root })

/** `POST /periods/{period}/draft` — 201 first time, 200 when it already exists; 409 carries the reason. */
export function useDraftPeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (period: Period) => apiSend<unknown>('POST', `${base}/periods/${period}/draft`),
    onSuccess: () => refreshAll(qc),
  })
}

/** `POST /periods/{period}/recalculate` — rebuilds a Draft from the current usage and pending adjustments. */
export function useRecalculatePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (period: Period) => apiSend<unknown>('POST', `${base}/periods/${period}/recalculate`),
    onSuccess: () => refreshAll(qc),
  })
}

/**
 * `POST /periods/{period}/finalize`. The API's refusals are outcomes the drawer explains, so a 409 with a
 * known code resolves to a `FinalizeOutcome`; anything else rejects. `DraftChanged` means the server already
 * rebuilt the draft: the refresh below brings the new total in.
 */
export function useFinalizePeriod() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { period: Period; expectedTotal: number; finalizedBy: string }): Promise<FinalizeOutcome> => {
      try {
        const done = await apiSend<FinalizedPeriodDto>('POST', `${base}/periods/${input.period}/finalize`, {
          finalizedBy: input.finalizedBy,
          expectedTotal: input.expectedTotal,
        })
        return done.alreadyFinalized ? 'AlreadyFinalized' : 'Finalized'
      } catch (e) {
        if (e instanceof ApiError && e.status === 409 && e.code === 'USAGE_NOT_COMPLETE') return 'UsageNotComplete'
        if (e instanceof ApiError && e.status === 409 && e.code === 'DRAFT_CHANGED') return 'DraftChanged'
        if (e instanceof ApiError && e.status === 404) return 'PeriodNotReady'
        throw e
      }
    },
    onSettled: () => refreshAll(qc),
  })
}

/** `POST /adjustments` — Pending until the month it lands on is finalized. Negative is a credit. */
export function useAddAdjustment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { institutionId: string; amount: number; reason: string; createdBy: string }) =>
      apiSend<AdjustmentDto>('POST', `${base}/adjustments`, {
        tenantId: input.institutionId,
        amount: input.amount,
        reason: input.reason,
        createdBy: input.createdBy,
      }),
    onSuccess: () => refreshAll(qc),
  })
}

/** `POST /v1/admin/outbox/{id}/requeue` for every dead-lettered message given; Pending ones are still being delivered. */
export function useRequeueDeadEvents() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (events: OutboxEvent[]) => {
      const dead = events.filter((e) => e.status === 'Dead')
      await Promise.all(dead.map((e) => apiSend<unknown>('POST', `/v1/admin/outbox/${e.id}/requeue`)))
      return dead.length
    },
    onSettled: () => refreshAll(qc),
  })
}

/** Fetch a month's export (`statements.csv`, or `usage.csv` for one institution). */
export const fetchStatementsCsv = (period: Period) => apiGetText(`${base}/periods/${period}/statements.csv`)
export const fetchUsageCsv = (period: Period, tenantId: string, all = false) =>
  apiGetText(`${base}/periods/${period}/usage.csv?tenantId=${encodeURIComponent(tenantId)}${all ? '&all=true' : ''}`)
