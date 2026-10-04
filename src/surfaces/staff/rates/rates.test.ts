import { describe, expect, it } from 'vitest'
import { accessSummary, canWithdraw, cardFor, priceGaps, cardState, currentMonth, nextMonth, rateCardSchema, type RateCard } from './rates'

const card = (id: string, from: string, institutionId = 'a'): RateCard => ({ id, institutionId, effectiveFrom: `${from}-01`, generationRate: 0.5, validationRate: 0.125 })
const now = new Date(2026, 9, 2) // 2 Oct 2026

describe('rate card rules', () => {
  it('knows the current and next month, across a year end', () => {
    expect(currentMonth(now)).toBe('2026-10')
    expect(nextMonth(now)).toBe('2026-11')
    expect(nextMonth(new Date(2026, 11, 31))).toBe('2027-01')
  })

  it('prices a month with the latest card that has started', () => {
    const cards = [card('1', '2026-01'), card('2', '2026-09'), card('3', '2026-12')]
    expect(cardFor(cards, 'a', '2026-10')?.id).toBe('2')
    expect(cardFor(cards, 'a', '2026-08')?.id).toBe('1')
    expect(cardFor(cards, 'a', '2025-12')).toBeNull()
    expect(cardFor(cards, 'b', '2026-10')).toBeNull()
  })

  it('marks cards Scheduled, In effect or Superseded, and only a scheduled one can be withdrawn', () => {
    const cards = [card('1', '2026-01'), card('2', '2026-09'), card('3', '2026-12')]
    expect(cardState(cards[0], cards, now)).toBe('Superseded')
    expect(cardState(cards[1], cards, now)).toBe('In effect')
    expect(cardState(cards[2], cards, now)).toBe('Scheduled')
    expect(cards.map((c) => canWithdraw(c, cards, now))).toEqual([false, false, true])
  })

  it('finds operations that are allowed but not charged', () => {
    const both = { generation: true, validation: true }
    const validateOnly = { generation: false, validation: true }
    const free = { ...card('1', '2026-01'), generationRate: 0 }
    expect(priceGaps(both, [], 'a', '2026-10')).toEqual([
      { operation: 'generation', reason: 'no-card' },
      { operation: 'validation', reason: 'no-card' },
    ])
    expect(priceGaps(both, [free], 'a', '2026-10')).toEqual([{ operation: 'generation', reason: 'zero-price' }])
    // A price on an operation the institution cannot use is not a gap, and neither is a zero one.
    expect(priceGaps(validateOnly, [free], 'a', '2026-10')).toEqual([])
    expect(priceGaps(validateOnly, [card('1', '2026-01')], 'a', '2026-10')).toEqual([])
    // Access not set up yet: nothing to charge for.
    expect(priceGaps(null, [], 'a', '2026-10')).toEqual([])
    // A card that has not started yet does not cover this month.
    expect(priceGaps(both, [card('1', '2026-12')], 'a', '2026-10')).toHaveLength(2)
  })

  it('describes access in words', () => {
    expect(accessSummary({ generation: true, validation: true })).toBe('Can generate and validate QR codes')
    expect(accessSummary({ generation: false, validation: true })).toBe('Can validate QR codes only')
    expect(accessSummary({ generation: true, validation: false })).toBe('Can generate QR codes only')
    expect(accessSummary(null)).toBeNull()
  })

  it('accepts up to 4 decimals and zero, and refuses the rest', () => {
    const ok = { institutionId: 'a', startMonth: nextMonth(), generationRate: '0.5', validationRate: '0' }
    expect(rateCardSchema.safeParse(ok).success).toBe(true)
    expect(rateCardSchema.safeParse({ ...ok, validationRate: '0.1234' }).success).toBe(true)
    for (const bad of ['0.12345', '-1', 'abc', '', '1,5']) {
      expect(rateCardSchema.safeParse({ ...ok, generationRate: bad }).success, bad).toBe(false)
    }
  })

  it('accepts a start in the current month but refuses a past one', () => {
    const base = { institutionId: 'a', generationRate: '0.5', validationRate: '0.1' }
    expect(rateCardSchema.safeParse({ ...base, startMonth: currentMonth() }).success).toBe(true)
    expect(rateCardSchema.safeParse({ ...base, startMonth: '2020-01' }).success).toBe(false)
    expect(rateCardSchema.safeParse({ ...base, startMonth: '' }).success).toBe(false)
  })
})
