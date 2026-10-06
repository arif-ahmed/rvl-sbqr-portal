import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { periodTotals, type BillingData } from '../../../shared/billing/billing'
import { staffBillingData } from '../../../test/billing-data'
import { FakeBackend, TEST_NOW } from '../../../test/fake-backend'
import { CHANDRA, KARNAPHULI, SHAPLA, TEESTA, seedOctober2026 } from '../../../test/scenario'
import { institutionReport, institutionReportToCsv, monthlyReport, reportToCsv, trendReport, trendToCsv } from './report'

let backend: FakeBackend
let data: BillingData
const nameOf = (id: string) => data.institutions.find((i) => i.id === id)?.name ?? id

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TEST_NOW)
  backend = new FakeBackend()
  seedOctober2026(backend)
  data = await staffBillingData(backend)
})
afterEach(() => vi.useRealTimers())

describe('monthly report', () => {
  it('ranks institutions by revenue and the shares add up to the whole month', () => {
    const r = monthlyReport(data, '2026-09')
    expect(r.rows.map((x) => x.institutionId)).toEqual([SHAPLA, KARNAPHULI, TEESTA])
    expect(r.rows.reduce((t, x) => t + x.share, 0)).toBeCloseTo(100, 6)
    expect(r.revenue).toBe(periodTotals(data, '2026-09').total)
    expect(r.volume).toBe(r.rows.reduce((t, x) => t + x.volume, 0))
    expect(r.status).toBe('Draft')
  })

  it('compares with the month before, and has no comparison for the first month', () => {
    const r = monthlyReport(data, '2026-09')
    expect(r.previous).toBe('2026-08')
    const before = monthlyReport(data, '2026-08')
    expect(r.change.volume).toBeCloseTo(((r.volume - before.volume) / before.volume) * 100, 6)
    expect(r.change.revenue).toBeCloseTo(((r.revenue - before.revenue) / before.revenue) * 100, 6)
    const first = monthlyReport(data, '2026-04')
    expect(first.previous).toBeNull()
    expect(first.change).toEqual({ volume: null, revenue: null })
  })

  it('has no revenue change when the month before billed nothing', async () => {
    const quiet = new FakeBackend()
    quiet.billing.setPeriod('2026-08', 'FINALIZED')
    quiet.billing.addUsageCounts(SHAPLA, '2026-09', { staticGenerations: 1, dynamicGenerations: 1, validations: 1 })
    quiet.billing.setPeriod('2026-09', 'DRAFT')
    expect(monthlyReport(await staffBillingData(quiet), '2026-09').change).toEqual({ volume: null, revenue: null })
  })

  it('lists usage that has no rate card separately, and counts what is outstanding or waiting', () => {
    const r = monthlyReport(data, '2026-09')
    expect(r.unbilled).toEqual([{ institutionId: CHANDRA, volume: 23 }])
    expect(r.rows.some((x) => x.institutionId === CHANDRA)).toBe(false)
    expect(r.lateUsage).toBe(2)
    expect(r.pendingAdjustments).toBe(1)
  })

  it('writes one CSV row per institution with the same figures', () => {
    const r = monthlyReport(data, '2026-09')
    const lines = reportToCsv(r, nameOf).split('\n')
    expect(lines[0]).toBe('period,institution,volume,revenue,share_percent,billed,currency')
    expect(lines).toHaveLength(1 + r.rows.length + 1)
    expect(lines[1]).toBe(`2026-09,Shapla Commercial Bank,${r.rows[0].volume},${r.rows[0].revenue},${Math.round(r.rows[0].share * 100) / 100},true,BDT`)
    expect(lines.at(-1)).toBe('2026-09,Chandra Settlement Services,23,0,0,false,BDT')
  })

  it('breaks one institution’s month into charges, place and six months of history', () => {
    const r = institutionReport(data, SHAPLA, '2026-09')
    expect(r.statement?.total).toBe(9658.13)
    expect(r.rank).toBe(1)
    expect(r.of).toBe(3)
    expect(r.history.map((h) => h.period)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])
    expect(r.history[0].change).toBeNull()
    expect(r.history[5].change).toBeCloseTo(((9658.13 - r.history[4].revenue) / r.history[4].revenue) * 100, 6)
    expect(r.unbilledVolume).toBe(0)
  })

  it('has no comparison where the month before billed nothing, and flags usage without a card', () => {
    const teesta = institutionReport(data, TEESTA, '2026-09')
    expect(teesta.history.find((h) => h.period === '2026-07')?.change).toBeNull()
    expect(teesta.history.find((h) => h.period === '2026-08')?.change).not.toBeNull()
    const chandra = institutionReport(data, CHANDRA, '2026-09')
    expect(chandra.statement).toBeNull()
    expect(chandra.unbilledVolume).toBe(23)
    expect(chandra.rank).toBeNull()
  })

  it('writes the institution history as CSV', () => {
    const lines = institutionReportToCsv(institutionReport(data, SHAPLA, '2026-09'), 'Shapla Commercial Bank').split('\n')
    expect(lines[0]).toBe('institution,period,status,static_generations,dynamic_generations,validations,volume,revenue,currency')
    expect(lines).toHaveLength(7)
    expect(lines[6]).toContain('Shapla Commercial Bank,2026-09,Draft,3015,12466,15341,30822,9658.13,BDT')
  })

  it('lays out every month with each institution’s part, and the parts add up', () => {
    const t = trendReport(data)
    expect(t.rows).toHaveLength(7)
    expect(t.institutions).toEqual([SHAPLA, KARNAPHULI, TEESTA])
    for (const r of t.rows) {
      expect(Object.values(r.byInstitution).reduce((a, b) => a + b, 0)).toBeCloseTo(r.revenue, 2)
    }
    expect(t.rows[0].change).toBeNull()
    const csv = trendToCsv(t, nameOf).split('\n')
    expect(csv[0]).toBe('period,status,institution,revenue,currency')
    expect(csv.length).toBeGreaterThan(10)
  })
})
