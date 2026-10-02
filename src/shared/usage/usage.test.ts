import { describe, expect, it } from 'vitest'
import { sampleEvents } from './sample'
import { eventsToCsv, filterEvents, formatEventTime, isBillable, noFilters } from './usage'

describe('usage rules', () => {
  it('bills generations always and validations only when conclusive', () => {
    expect(isBillable('GENERATION_STATIC', 'Generated')).toBe(true)
    expect(isBillable('GENERATION_DYNAMIC', 'Generated')).toBe(true)
    expect(isBillable('VALIDATION', 'Valid')).toBe(true)
    expect(isBillable('VALIDATION', 'Invalid')).toBe(true)
    expect(isBillable('VALIDATION', 'Indeterminate')).toBe(false)
    expect(isBillable('VALIDATION', 'Error')).toBe(false)
  })

  it('sample events follow the billable rule', () => {
    expect(sampleEvents).toHaveLength(260)
    expect(sampleEvents.every((e) => e.billable === isBillable(e.meter, e.verdict))).toBe(true)
  })

  it('filters by meter, billing, dates and text', () => {
    const validations = filterEvents(sampleEvents, { ...noFilters, meter: 'VALIDATION' })
    expect(validations.length).toBeGreaterThan(0)
    expect(validations.every((e) => e.meter === 'VALIDATION')).toBe(true)

    const free = filterEvents(sampleEvents, { ...noFilters, billing: 'free' })
    expect(free.every((e) => !e.billable)).toBe(true)

    const first = sampleEvents[0]
    expect(filterEvents(sampleEvents, { ...noFilters, query: first.ref.toLowerCase() }).map((e) => e.id)).toContain(first.id)
    expect(filterEvents(sampleEvents, { ...noFilters, from: '2999-01-01' })).toHaveLength(0)
  })

  it('formats times and builds csv for the given rows only', () => {
    expect(formatEventTime('2026-10-02T10:41')).toBe('02 Oct 10:41')
    const csv = eventsToCsv(sampleEvents.slice(0, 2)).split('\n')
    expect(csv).toHaveLength(3)
    expect(csv[0]).toBe('event_id,occurred_at,meter,client_reference,result,billable')
  })
})
