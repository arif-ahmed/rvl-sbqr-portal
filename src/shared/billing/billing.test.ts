import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBackend, TEST_NOW } from '../../test/fake-backend'
import { staffBillingData } from '../../test/billing-data'
import { blockingEvents, buildStatement, currentPeriod, draftPeriod, monthAfter, openIssues, periodOf, periodTotals, round2, stampDhaka, statementToCsv, type BillingData } from './billing'

const SHAPLA = 'inst-1'
const TEESTA = 'inst-3'
const NO_CARD = 'inst-6'

// September 2026 is a Draft with real usage; August is finalized. Shapla has had a card since January,
// Teesta since July, and Chandra (inst-6) has usage but no card at all.
let backend: FakeBackend
let data: BillingData

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TEST_NOW)
  backend = new FakeBackend()
  backend.addRateCard(TEESTA, '2026-07-01', 0.5, 0.2)
  const b = backend.billing
  b.addUsageCounts(SHAPLA, '2026-08', { staticGenerations: 2902, dynamicGenerations: 11987, validations: 14917 })
  b.setPeriod('2026-08', 'FINALIZED', 'platform:admin')
  b.addUsageCounts(SHAPLA, '2026-09', { staticGenerations: 3015, dynamicGenerations: 12466, validations: 15341 })
  b.addUsageCounts(TEESTA, '2026-09', { validations: 3148 })
  b.addUsageCounts(NO_CARD, '2026-09', { staticGenerations: 10, dynamicGenerations: 5, validations: 8 })
  b.addAdjustment(SHAPLA, -500, 'Credit: duplicate burst, 14 Sep (INC-2291)')
  b.setPeriod('2026-09', 'DRAFT')
  data = await staffBillingData(backend)
})

afterEach(() => vi.useRealTimers())

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

describe('the periods the screens offer', () => {
  it('lists the stored months, then the open month as Provisional', () => {
    expect(data.periods).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(data.periodMeta['2026-08']).toMatchObject({ status: 'Finalized', finalizedBy: 'platform:admin' })
    expect(data.periodMeta['2026-09'].status).toBe('Draft')
    expect(data.periodMeta['2026-09'].calculatedAt).toBe(stampDhaka(TEST_NOW.toISOString()))
    expect(data.periodMeta['2026-10']).toEqual({ period: '2026-10', status: 'Provisional' })
  })

  it('prepares the Draft first, before the provisional month', () => {
    expect(draftPeriod(data)).toBe('2026-09')
  })
})

describe('buildStatement', () => {
  it("reads the API's statement: usage lines priced once, plus the adjustment with its reason", () => {
    const s = buildStatement(data, SHAPLA, '2026-09')!
    expect(s.counts).toEqual({ staticGenerations: 3015, dynamicGenerations: 12466, validations: 15341 })
    expect(s.staticGenerationAmount).toBe(1507.5)
    expect(s.dynamicGenerationAmount).toBe(6233)
    expect(s.validationAmount).toBe(1917.63)
    expect(s.subtotal).toBe(9658.13)
    expect(s.adjustments).toHaveLength(1)
    expect(s.adjustments[0]).toMatchObject({ amount: -500, reason: 'Credit: duplicate burst, 14 Sep (INC-2291)', status: 'Pending', createdBy: 'platform:admin' })
    expect(s.adjustmentsTotal).toBe(-500)
    expect(s.total).toBe(9158.13)
    expect(s.rate).toEqual({ generationRate: 0.5, validationRate: 0.125, effectiveFrom: expect.stringMatching(/^2026-01-01$/) })
  })

  it('has no statement for an institution without a rate card in effect: recorded, not billed', () => {
    expect(buildStatement(data, NO_CARD, '2026-09')).toBeNull()
    expect(data.unbilled['2026-09']).toEqual({ [NO_CARD]: 23 })
  })

  it('shows a month before the institution had a card as no statement', () => {
    expect(buildStatement(data, TEESTA, '2026-06')).toBeNull()
  })

  it('lets credits outweigh usage: the total is negative and carried as a credit', async () => {
    backend.billing.addAdjustment(TEESTA, -2000, 'Service credit')
    backend.billing.setPeriod('2026-09', 'DRAFT')
    const credited = await staffBillingData(backend)
    expect(buildStatement(credited, TEESTA, '2026-09')!.total).toBe(-1370.4)
  })

  it('marks adjustments Applied once their month is finalized', async () => {
    backend.billing.setPeriod('2026-09', 'FINALIZED')
    const done = await staffBillingData(backend)
    expect(buildStatement(done, SHAPLA, '2026-09')!.adjustments[0].status).toBe('Applied')
    expect(done.adjustments.find((a) => a.amount === -500)).toMatchObject({ status: 'Applied', period: '2026-09' })
  })
})

describe('periodTotals', () => {
  it("sums the month's statements, by institution name; a card with no usage is a zero statement", () => {
    const t = periodTotals(data, '2026-09')
    expect(t.statements.map((s) => s.institutionId)).toEqual(['inst-2', SHAPLA, TEESTA])
    expect(t.counts).toEqual({ staticGenerations: 3015, dynamicGenerations: 12466, validations: 18489 })
    expect(t.total).toBe(9787.73)
  })
})

describe('what blocks a close', () => {
  it('counts outstanding usage messages for their month and every month after it', async () => {
    // 18:00Z is midnight in Dhaka: the first event is on 30 September, the second on 1 October.
    backend.billing.addOutbox('DEAD', '2026-09-30T17:59:00+00:00')
    backend.billing.addOutbox('PENDING', '2026-09-30T18:01:00+00:00')
    const blocked = await staffBillingData(backend)
    expect(blocked.outbox.map((e) => [e.status, e.period])).toEqual([
      ['Dead', '2026-09'],
      ['Pending', '2026-10'],
    ])
    expect(blockingEvents(blocked, '2026-08')).toHaveLength(0)
    expect(blockingEvents(blocked, '2026-09')).toHaveLength(1)
    expect(blockingEvents(blocked, '2026-10')).toHaveLength(2)
    expect(openIssues(blocked)).toBe(2 + 1)
  })
})

describe('statement.csv', () => {
  const nameOf = (id: string) => data.institutions.find((i) => i.id === id)!.name

  it('quotes reasons containing commas', () => {
    const text = statementToCsv(buildStatement(data, SHAPLA, '2026-09')!, nameOf)
    expect(text).toContain('"Adjustment: Credit: duplicate burst, 14 Sep (INC-2291)"')
    expect(text.split('\n')[0]).toBe('period,institution,line,quantity,rate,amount,currency')
    expect(text.split('\n')).toHaveLength(6)
  })
})

describe('Dhaka time', () => {
  it('reads an instant as a Dhaka month and wall clock', () => {
    expect(stampDhaka('2026-09-30T17:59:00+00:00')).toBe('2026-09-30 23:59')
    expect(stampDhaka('2026-09-30T18:00:00+00:00')).toBe('2026-10-01 00:00')
    expect(periodOf('2026-09-30T18:00:00+00:00')).toBe('2026-10')
    expect(currentPeriod(TEST_NOW)).toBe('2026-10')
  })
})

describe('monthAfter', () => {
  it('crosses the year boundary', () => {
    expect(monthAfter('2026-09')).toBe('2026-10')
    expect(monthAfter('2026-12')).toBe('2027-01')
  })
})
