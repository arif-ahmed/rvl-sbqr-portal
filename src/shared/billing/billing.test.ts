import { describe, expect, it } from 'vitest'
import {
  buildStatement,
  monthAfter,
  periodTotals,
  rateCardFor,
  round2,
  statementToCsv,
  statementsToCsv,
  usageComplete,
  usageToCsv,
  type BillingData,
} from './billing'

const data: BillingData = {
  periods: ['2026-08', '2026-09'],
  periodMeta: {
    '2026-08': { period: '2026-08', status: 'Finalized', finalizedBy: 'finance@rvl.example', finalizedAt: '2026-09-03 12:15' },
    '2026-09': { period: '2026-09', status: 'Draft', calculatedAt: '2026-10-02 09:14' },
  },
  institutions: [
    { id: 'inst-1', name: 'Shapla Commercial Bank', code: '000901' },
    { id: 'inst-2', name: 'Teesta Digital Wallet', code: '022901' },
    { id: 'inst-3', name: 'No Card Bank', code: '000911' },
  ],
  rateCards: [
    { institutionId: 'inst-1', effectiveFrom: '2026-01-01', generationRate: 0.5, validationRate: 0.125 },
    { institutionId: 'inst-1', effectiveFrom: '2026-11-01', generationRate: 0.45, validationRate: 0.12 },
    { institutionId: 'inst-2', effectiveFrom: '2026-07-01', generationRate: 0.5, validationRate: 0.2 },
  ],
  counts: {
    'inst-1': {
      '2026-08': { staticGenerations: 2902, dynamicGenerations: 11987, validations: 14917 },
      '2026-09': { staticGenerations: 3015, dynamicGenerations: 12466, validations: 15341 },
    },
    'inst-2': { '2026-09': { staticGenerations: 0, dynamicGenerations: 0, validations: 3148 } },
    // inst-3 has usage but no card: recorded, not billable.
    'inst-3': { '2026-09': { staticGenerations: 10, dynamicGenerations: 5, validations: 8 } },
  },
  adjustments: [
    {
      id: 'adj-1', institutionId: 'inst-1', period: '2026-09', amount: -500,
      reason: 'Credit: duplicate burst, 14 Sep (INC-2291)', status: 'Pending',
      createdBy: 'finance@rvl.example', createdAt: '2026-09-29 15:10',
    },
    {
      id: 'adj-2', institutionId: 'inst-2', period: '2026-08', amount: 250,
      reason: 'Support hours', status: 'Applied', createdBy: 'finance@rvl.example', createdAt: '2026-08-27 10:31',
    },
  ],
  outbox: [
    { id: 'ob-1', institutionId: 'inst-2', period: '2026-09', meter: 'VALIDATION', occurredAt: '2026-09-30 23:58', status: 'Queued' },
    { id: 'ob-2', institutionId: 'inst-2', period: '2026-09', meter: 'VALIDATION', occurredAt: '2026-09-30 23:59', status: 'Delivered' },
  ],
}

describe('round2', () => {
  it('rounds half away from zero, once, like the API', () => {
    expect(round2(1917.625)).toBe(1917.63)
    expect(round2(-2.675)).toBe(-2.68)
    expect(round2(1.005)).toBe(1.01)
    expect(round2(-0.005)).toBe(-0.01)
    expect(round2(365.4)).toBe(365.4)
    expect(round2(0)).toBe(0)
  })
})

describe('rateCardFor', () => {
  it('picks the latest card that has started, ignoring future and other institutions', () => {
    expect(rateCardFor(data.rateCards, 'inst-1', '2026-09')?.effectiveFrom).toBe('2026-01-01')
    expect(rateCardFor(data.rateCards, 'inst-1', '2026-11')?.effectiveFrom).toBe('2026-11-01')
    expect(rateCardFor(data.rateCards, 'inst-1', '2025-12')).toBeNull()
    expect(rateCardFor(data.rateCards, 'inst-3', '2026-09')).toBeNull()
  })
})

describe('buildStatement', () => {
  it('prices each line once and settles the period adjustments', () => {
    const s = buildStatement(data, 'inst-1', '2026-09')
    expect(s).not.toBeNull()
    expect(s!.staticGenerationAmount).toBe(1507.5)
    expect(s!.dynamicGenerationAmount).toBe(6233)
    expect(s!.validationAmount).toBe(1917.63)
    expect(s!.subtotal).toBe(9658.13)
    expect(s!.adjustments.map((a) => a.id)).toEqual(['adj-1'])
    expect(s!.adjustmentsTotal).toBe(-500)
    expect(s!.total).toBe(9158.13)
  })

  it('returns null without usage or without a card: recorded, not billed', () => {
    expect(buildStatement(data, 'inst-1', '2026-03')).toBeNull()
    expect(buildStatement(data, 'inst-3', '2026-09')).toBeNull()
  })

  it('counts only this period and institution queued events', () => {
    expect(buildStatement(data, 'inst-2', '2026-09')!.queuedEvents).toBe(1)
    expect(buildStatement(data, 'inst-1', '2026-09')!.queuedEvents).toBe(0)
  })

  it('lets credits outweigh usage: the total is negative and carried as a credit', () => {
    const credited = { ...data, adjustments: [...data.adjustments, { ...data.adjustments[1], id: 'adj-9', institutionId: 'inst-2', period: '2026-09', amount: -2000 }] }
    expect(buildStatement(credited, 'inst-2', '2026-09')!.total).toBe(-1370.4)
  })
})

describe('periodTotals', () => {
  it('sums only billable statements', () => {
    const t = periodTotals(data, '2026-09')
    expect(t.statements.map((s) => s.institutionId)).toEqual(['inst-1', 'inst-2'])
    expect(t.counts).toEqual({ staticGenerations: 3015, dynamicGenerations: 12466, validations: 18489 })
    expect(t.total).toBe(9787.73)
  })
})

describe('usageComplete', () => {
  it('is false while any event for the period is queued', () => {
    expect(usageComplete(data.outbox, '2026-09')).toBe(false)
    expect(usageComplete(data.outbox, '2026-08')).toBe(true)
  })
})

describe('csv exports', () => {
  const nameOf = (id: string) => data.institutions.find((i) => i.id === id)!.name

  it('statements.csv has one row per billable institution', () => {
    const rows = statementsToCsv(data, '2026-09', nameOf).split('\n')
    expect(rows[0]).toBe('period,institution,static_generations,dynamic_generations,validations,subtotal,adjustments,total,currency')
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('Shapla Commercial Bank')
    expect(rows[1]).toContain('9658.13,-500,9158.13,BDT')
  })

  it('usage.csv has three meter rows per statement', () => {
    const rows = usageToCsv(data, '2026-09', nameOf).split('\n')
    expect(rows[0]).toBe('period,institution,meter,billable_count')
    expect(rows).toHaveLength(7)
  })

  it('statement.csv quotes reasons containing commas', () => {
    const s = buildStatement(data, 'inst-1', '2026-09')!
    const text = statementToCsv(s, nameOf)
    expect(text).toContain('"Adjustment: Credit: duplicate burst, 14 Sep (INC-2291)"')
    expect(text.split('\n')[0]).toBe('period,institution,line,quantity,rate,amount,currency')
    expect(text.split('\n')).toHaveLength(6)
  })
})

describe('monthAfter', () => {
  it('crosses the year boundary', () => {
    expect(monthAfter('2026-09')).toBe('2026-10')
    expect(monthAfter('2026-12')).toBe('2027-01')
  })
})
