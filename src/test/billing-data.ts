import { assembleBillingData, assembleFiData, offeredPeriods } from '../shared/billing/api/mappers'
import type { AdjustmentDto, BillingPeriodDto, OutboxBacklogDto, PeriodSummaryDto, TenantStatementDto } from '../shared/billing/api/types'
import type { BillingData } from '../shared/billing/billing'
import { summaryRange } from '../shared/usage/api/mappers'
import type { UsageSummaryDto } from '../shared/usage/api/types'
import type { FakeBackend } from './fake-backend'
import { TEST_NOW } from './fake-backend'

/**
 * The staff billing read model for whatever a test seeded into a backend: the fake API's own responses
 * run through the real mappers, exactly as `useBillingData` does. Needs the clock pinned
 * (`vi.useFakeTimers({ toFake: ['Date'] })` + `vi.setSystemTime(TEST_NOW)`) or an installed backend.
 */
export async function staffBillingData(backend: FakeBackend): Promise<BillingData> {
  const get = async <T>(path: string): Promise<T> => {
    const url = new URL(path, 'http://fake')
    const res = backend.billing.handle('GET', url.pathname, url.searchParams, {})
    if (!res) throw new Error(`fake billing has no ${path}`)
    return (await res.json()) as T
  }
  const stored = await get<PeriodSummaryDto[]>('/v1/admin/billing/periods')
  const offered = offeredPeriods(stored, TEST_NOW)
  const periods = await Promise.all(offered.map((p) => get<BillingPeriodDto>(`/v1/admin/billing/periods/${p}`)))
  const range = summaryRange(offered, TEST_NOW)
  const usage = await get<UsageSummaryDto>(`/v1/admin/billing/usage/summary?from=${range.from}&to=${range.to}`)
  const cards = new Map(backend.records.flatMap((r) => r.rateCards.map((c) => [c.rateCardId, c.effectiveFrom] as const)))
  return assembleBillingData({
    institutions: backend.records.map((r) => ({ id: r.tenant.tenantId, name: r.tenant.institutionName, code: r.tenant.institutionCode })),
    periods,
    adjustments: await get<AdjustmentDto[]>('/v1/admin/billing/adjustments'),
    outbox: await get<OutboxBacklogDto>('/v1/admin/outbox'),
    usageDays: usage.days,
    rateCardStart: (id) => cards.get(id),
  })
}

/** What the FI portal reads for one institution, from the same fake API. */
export async function fiBillingData(backend: FakeBackend, tenantId: string, name = 'Institution') {
  backend.billing.fiTenantId = tenantId
  const get = async <T>(path: string): Promise<T> => {
    const url = new URL(path, 'http://fake')
    return (await backend.billing.handle('GET', url.pathname, url.searchParams, {})!.json()) as T
  }
  const statements = await get<TenantStatementDto[]>('/v1/billing/statements')
  const range = summaryRange(statements.map((s) => s.period).sort(), TEST_NOW)
  const usage = await get<UsageSummaryDto>(`/v1/billing/usage/summary?from=${range.from}&to=${range.to}`)
  return assembleFiData({ tenantId, name, statements, usageDays: usage.days, now: TEST_NOW })
}
