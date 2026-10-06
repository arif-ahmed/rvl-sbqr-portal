import { describe, expect, it } from 'vitest'
import { countsByPeriod, lastDayOf, MAX_RANGE_DAYS, summaryRange, toUsageEvent } from './api/mappers'
import { billingReason, eventsToCsv, formatEventTime, hasFilters, isBillable, noFilters, verdictCodes, verdictInfo } from './usage'

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

  it('formats times and builds csv for the given rows only', () => {
    expect(formatEventTime('2026-10-02T10:41')).toBe('02 Oct 10:41')
    const events = [
      toUsageEvent({ usageEventId: 'ue-1', tenantId: 't', meterCode: 'VALIDATION', billable: true, verdict: 'VALID', clientReference: 'INV-1', occurredAt: '2026-10-02T04:41:00+00:00' }),
      toUsageEvent({ usageEventId: 'ue-2', tenantId: 't', meterCode: 'GENERATION_STATIC', billable: true, verdict: null, clientReference: 'INV-2', occurredAt: '2026-10-02T05:00:00+00:00' }),
    ]
    const csv = eventsToCsv(events).split('\n')
    expect(csv).toHaveLength(3)
    expect(csv[0]).toBe('event_id,occurred_at,meter,client_reference,result,billable,billing_reason')
    expect(csv[1]).toBe('ue-1,2026-10-02T10:41,VALIDATION,INV-1,VALID,true,Billed')
  })

  it('knows when a filter is set', () => {
    expect(hasFilters(noFilters)).toBe(false)
    expect(hasFilters({ ...noFilters, meter: 'VALIDATION' })).toBe(true)
  })
})

describe('usage from the API', () => {
  it('shows an event in Dhaka time, and a generation as GENERATED', () => {
    const e = toUsageEvent({ usageEventId: 'ue-9', tenantId: 'tenant-1', meterCode: 'GENERATION_DYNAMIC', billable: true, verdict: null, clientReference: 'ORD-9', occurredAt: '2026-09-30T18:30:00+00:00' })
    expect(e).toEqual({ id: 'ue-9', at: '2026-10-01T00:30', meter: 'GENERATION_DYNAMIC', verdict: 'GENERATED', billable: true, ref: 'ORD-9', institutionId: 'tenant-1' })
  })

  it('counts only billable events, per month and institution, by their Dhaka day', () => {
    const counts = countsByPeriod([
      { day: '2026-09-30', tenantId: 'a', meterCode: 'VALIDATION', billable: true, count: 5 },
      { day: '2026-09-30', tenantId: 'a', meterCode: 'VALIDATION', billable: false, count: 2 },
      { day: '2026-10-01', tenantId: 'a', meterCode: 'GENERATION_STATIC', billable: true, count: 3 },
      { day: '2026-10-02', tenantId: 'b', meterCode: 'GENERATION_DYNAMIC', billable: true, count: 4 },
    ])
    expect(counts['2026-09'].a).toEqual({ staticGenerations: 0, dynamicGenerations: 0, validations: 5 })
    expect(counts['2026-10'].a.staticGenerations).toBe(3)
    expect(counts['2026-10'].b.dynamicGenerations).toBe(4)
  })

  it('ends a month on its last calendar day, leap years included', () => {
    expect(lastDayOf('2026-09')).toBe('2026-09-30')
    expect(lastDayOf('2026-12')).toBe('2026-12-31')
    expect(lastDayOf('2028-02')).toBe('2028-02-29')
  })

  it('asks for the listed months up to the end of this one, within what the API serves', () => {
    const now = new Date('2026-10-06T04:00:00Z')
    expect(summaryRange(['2026-08', '2026-09'], now)).toEqual({ from: '2026-08-01', to: '2026-10-31' })
    const long = summaryRange(['2020-01'], now)
    expect(long.to).toBe('2026-10-31')
    const days = (Date.parse(long.to) - Date.parse(long.from)) / 86_400_000 + 1
    expect(days).toBe(MAX_RANGE_DAYS)
  })
})
