import { describe, expect, it } from 'vitest'
import { bdt, bdtRate, bdtSigned, count, periodName } from './format'

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

  it('formats counts and billing periods', () => {
    expect(count(101520)).toBe('101,520')
    expect(periodName('2026-09')).toBe('September 2026')
  })
})
