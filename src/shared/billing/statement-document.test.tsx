import { render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { staffBillingData } from '../../test/billing-data'
import { FakeBackend, TEST_NOW } from '../../test/fake-backend'
import { buildStatement, disputeWindowEnd, earlierStatements, institutionStatements, type BillingData } from './billing'
import { StatementDocument } from './statement-document'

// Shapla (inst-1) has billed since April; Teesta (inst-3) has a card from July. April to August are
// finalized, September is a Draft. A credit of ৳ 1,200 settled onto Shapla's August statement.
let data: BillingData

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TEST_NOW)
  const backend = new FakeBackend()
  backend.addRateCard('inst-3', '2026-07-01', 0.5, 0.2)
  const b = backend.billing
  for (const p of ['2026-04', '2026-05', '2026-06', '2026-07']) {
    b.addUsageCounts('inst-1', p, { staticGenerations: 100, dynamicGenerations: 200, validations: 300 })
    b.setPeriod(p, 'FINALIZED')
  }
  b.addUsageCounts('inst-1', '2026-08', { staticGenerations: 100, dynamicGenerations: 200, validations: 300 })
  b.addUsageCounts('inst-3', '2026-08', { validations: 50 })
  b.addAdjustment('inst-1', -1200, 'Credit: rate card correction effective July')
  b.setPeriod('2026-08', 'FINALIZED')
  b.addUsageCounts('inst-1', '2026-09', { staticGenerations: 100, dynamicGenerations: 200, validations: 300 })
  b.setPeriod('2026-09', 'DRAFT')
  data = await staffBillingData(backend)
})

afterEach(() => vi.useRealTimers())

const doc = (period: string, institutionId = 'inst-1') => {
  const institution = data.institutions.find((i) => i.id === institutionId)!
  render(
    <StatementDocument
      statement={buildStatement(data, institutionId, period)!}
      institutionName={institution.name}
      institutionCode={institution.code}
      meta={data.periodMeta[period]}
      earlier={earlierStatements(data, institutionId, period)}
    />,
  )
  return within(screen.getByRole('article', { name: 'Statement' }))
}

describe('statement document', () => {
  it('ends the dispute window 30 days after approval, across a month end', () => {
    expect(disputeWindowEnd('2026-09-03 12:15')).toBe('2026-10-03')
    expect(disputeWindowEnd('2026-12-15 09:00')).toBe('2027-01-14')
  })

  it('lists only approved months before the one shown', () => {
    expect(earlierStatements(data, 'inst-1', '2026-09').map((e) => e.period)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
    expect(earlierStatements(data, 'inst-1', '2026-06').map((e) => e.period)).toEqual(['2026-04', '2026-05'])
    expect(earlierStatements(data, 'inst-3', '2026-07')).toEqual([])
  })

  it('lists an institution’s statements newest first, skipping months with none', () => {
    expect(institutionStatements(data, 'inst-1').map((s) => s.period)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04'])
    expect(institutionStatements(data, 'inst-3').map((s) => s.period)).toEqual(['2026-10', '2026-09', '2026-08', '2026-07'])
    expect(institutionStatements(data, 'inst-4')).toEqual([])
  })

  it('shows an approved bill with its approver, rates, adjustments, earlier months and dispute end', () => {
    const d = doc('2026-08')
    expect(d.getByText('Finalized')).toBeInTheDocument()
    expect(d.getByText(/Approved on 2026-09-03 12:00 by platform:admin/)).toBeInTheDocument()
    expect(d.getByText('Shapla Commercial Bank')).toBeInTheDocument()
    expect(d.getByText('Institution code 000901')).toBeInTheDocument()
    expect(d.getByText('1 – 31 August 2026')).toBeInTheDocument()
    expect(d.getByText('Dynamic QR generation')).toBeInTheDocument()
    expect(d.getByText(/Credit: rate card correction effective July/)).toBeInTheDocument()
    expect(d.getAllByText('−৳ 1,200').length).toBeGreaterThan(0)
    expect(d.getByText('Earlier approved statements')).toBeInTheDocument()
    expect(d.getByText(/accepted until 2026-10-03 \(30 days after approval\)/)).toBeInTheDocument()
    expect(d.getByText(/not a tax invoice/)).toBeInTheDocument()
  })

  it('marks a draft as such and says the dispute window has not started', () => {
    const d = doc('2026-09')
    expect(d.getByText('Draft')).toBeInTheDocument()
    expect(d.getByText(/Figures may change until the month is finalized/)).toBeInTheDocument()
    expect(d.getByText(/window starts when this month is finalized/)).toBeInTheDocument()
    expect(screen.getByText(/Draft · Shapla Commercial Bank · September 2026/)).toBeInTheDocument()
  })

  it('omits the adjustments and earlier sections when there are none', () => {
    const d = doc('2026-07', 'inst-3')
    expect(d.queryByText(/^Adjustment$/)).not.toBeInTheDocument()
    expect(d.queryByText('Earlier approved statements')).not.toBeInTheDocument()
  })
})
