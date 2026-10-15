import { describe, expect, it } from 'vitest'
import { bdt, bdtRate, bdtSigned, count, daysUntil, daysUntilHuman, expiryDate, percent, percentSigned, periodName } from './format'

describe('format', () => {
  it('formats whole and fractional money', () => {
    expect(bdt(42690)).toBe('৳ 42,690')
    expect(bdt(74429.78)).toBe('৳ 74,429.78')
  })

  it('formats per-call prices with up to 4 decimals', () => {
    expect(bdtRate(0.125)).toBe('৳ 0.125')
    expect(bdtRate(0.5)).toBe('৳ 0.50')
    expect(bdtRate(0.0125)).toBe('৳ 0.0125')
    expect(bdtRate(2)).toBe('৳ 2')
  })

  it('uses a true minus and explicit plus for adjustments', () => {
    expect(bdt(-250)).toBe('−৳ 250')
    expect(bdtSigned(250)).toBe('+৳ 250')
    expect(bdtSigned(-500)).toBe('−৳ 500')
  })

  it('formats shares and changes with one decimal and a true minus', () => {
    expect(percent(12.34)).toBe('12.3%')
    expect(percentSigned(4.25)).toBe('+4.3%')
    expect(percentSigned(-1)).toBe('−1.0%')
    expect(percentSigned(0)).toBe('0.0%')
    expect(percentSigned(-0.01)).toBe('0.0%')
  })

  it('formats counts and billing periods', () => {
    expect(count(101520)).toBe('101,520')
    expect(periodName('2026-09')).toBe('September 2026')
  })

  // 2026-10-15 (cert-expiry workstream): ExpiryChip uses expiryDate + daysUntil + daysUntilHuman.
  // Branch coverage for the auto-tone logic (bad / warn / ok), the null-input path,
  // and the borderline "today" cutoff (UTC midnight → 0 days, not -1).
  it('formats expiry dates in UTC and tolerates nulls', () => {
    expect(expiryDate('2027-10-15T08:30:00+06:00')).toBe('15 October 2027')
    expect(expiryDate(null)).toBe('—')
    expect(expiryDate('not-a-date')).toBe('—')
  })

  it('computes days until expiry at UTC midnight boundary', () => {
    const now = new Date('2026-10-15T23:59:59Z')
    expect(daysUntil('2026-10-15T00:00:00Z', now)).toBe(0) // today, not -1
    expect(daysUntil('2026-10-16T00:00:00Z', now)).toBe(1)
    expect(daysUntil('2026-10-14T00:00:00Z', now)).toBe(-1) // yesterday → overdue
    expect(daysUntil(null, now)).toBeNull()
  })

  it('rounds human-readable day counts', () => {
    expect(daysUntilHuman(-3)).toBe('3d overdue')
    expect(daysUntilHuman(0)).toBe('today')
    expect(daysUntilHuman(12)).toBe('12d')
    expect(daysUntilHuman(45)).toBe('45d') // < 60 stays in days
    expect(daysUntilHuman(90)).toBe('3mo') // 90/30 = 3
    expect(daysUntilHuman(800)).toBe('2yr') // 800/365 = 2.19 → 2
  })
})
