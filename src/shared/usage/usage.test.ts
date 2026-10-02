import { describe, expect, it } from 'vitest'
import { sampleEvents } from './sample'
import { billingReason, eventPeriod, eventsToCsv, filterEvents, formatEventTime, isBillable, noFilters, verdictCodes, verdictInfo } from './usage'

describe('usage rules', () => {
  it('bills generations and every completed validation; only a stale request is free', () => {
    expect(isBillable('GENERATION_STATIC', 'GENERATED')).toBe(true)
    expect(isBillable('GENERATION_DYNAMIC', 'GENERATED')).toBe(true)
    for (const v of verdictCodes.filter((c) => c !== 'GENERATED' && c !== 'REQUEST_STALE')) {
      expect(isBillable('VALIDATION', v), v).toBe(true)
    }
    expect(isBillable('VALIDATION', 'REQUEST_STALE')).toBe(false)
  })

  it('never bills a result it does not recognise', () => {
    expect(isBillable('VALIDATION', 'SOMETHING_NEW')).toBe(false)
    expect(verdictInfo('SOMETHING_NEW').why).toMatch(/not billed/)
  })

  it('gives every verdict a short reason and a full explanation', () => {
    for (const v of verdictCodes) {
      const info = verdictInfo(v)
      expect(info.short.length, v).toBeGreaterThan(0)
      expect(info.why.length, v).toBeGreaterThan(20)
    }
    expect(billingReason({ billable: false, verdict: 'REQUEST_STALE' })).toMatchObject({ billed: false, short: 'Protocol rejection' })
    expect(billingReason({ billable: true, verdict: 'INVALID_SIGNATURE' })).toMatchObject({ billed: true, rejection: true })
  })

  it('sample events follow the billable rule and include a stale request', () => {
    expect(sampleEvents).toHaveLength(260)
    expect(sampleEvents.every((e) => e.billable === isBillable(e.meter, e.verdict))).toBe(true)
    expect(sampleEvents.some((e) => e.verdict === 'REQUEST_STALE')).toBe(true)
  })

  it('filters by meter, billing and dates', () => {
    const validations = filterEvents(sampleEvents, { ...noFilters, meter: 'VALIDATION' })
    expect(validations.length).toBeGreaterThan(0)
    expect(validations.every((e) => e.meter === 'VALIDATION')).toBe(true)

    const free = filterEvents(sampleEvents, { ...noFilters, billing: 'free' })
    expect(free.length).toBeGreaterThan(0)
    expect(free.every((e) => !e.billable)).toBe(true)

    expect(filterEvents(sampleEvents, { ...noFilters, from: '2999-01-01' })).toHaveLength(0)
  })

  it('puts every sample event in the open September period', () => {
    expect(new Set(sampleEvents.map(eventPeriod))).toEqual(new Set(['2026-09']))
  })

  it('formats times and builds csv for the given rows only', () => {
    expect(formatEventTime('2026-10-02T10:41')).toBe('02 Oct 10:41')
    const csv = eventsToCsv(sampleEvents.slice(0, 2)).split('\n')
    expect(csv).toHaveLength(3)
    expect(csv[0]).toBe('event_id,occurred_at,meter,client_reference,result,billable,billing_reason')
  })
})
