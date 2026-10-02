import { describe, expect, it } from 'vitest'
import { bdt, bdtSigned, count, periodName } from './format'

describe('format', () => {
  it('formats whole and fractional money', () => {
    expect(bdt(42690)).toBe('৳ 42,690')
    expect(bdt(74429.78)).toBe('৳ 74,429.78')
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
