import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { periodName } from '../../../shared/format'
import { FakeBackend, installFakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { currentMonth, nextMonth } from './rates'
import { RatesPage } from './rates-page'

describe('rate cards page', () => {
  let backend: FakeBackend
  beforeEach(async () => {
    backend = await installFakeBackend()
  })
  afterEach(() => {
    backend.reset()
  })

  /** The institutions arrive from the API: wait for one the page names before asserting. */
  async function renderRates() {
    renderApp(<RatesPage />)
    await screen.findAllByText(/Teesta Digital Wallet/)
  }

  /** Wait until the per-tenant rate-cards fetches have populated the table —
   *  the fan-out runs in parallel with the institution list, so we cannot rely
   *  on the institution names appearing first. Two cards in the seed land in
   *  "In effect", so the first one to resolve is enough to know we're done. */
  async function waitForCards() {
    await screen.findAllByText('In effect')
  }

  it('lists cards with their state and names the active institution that has no card', async () => {
    await renderRates()
    await waitForCards()
    expect(screen.getAllByText('In effect').length).toBeGreaterThan(0)
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText(/1 active institution has no rate card/)).toBeInTheDocument()
    expect(screen.getByText(/Teesta Digital Wallet/)).toBeInTheDocument()
  })

  it('warns when an allowed operation is priced at zero this month', async () => {
    backend.addRateCard('inst-2', `${currentMonth()}-01`, 0, 0.1)
    await renderRates()
    await waitForCards()
    expect(screen.getByText('Priced at ৳0 this month')).toBeInTheDocument()
    expect(screen.getByText(/Karnaphuli Trust Bank \(generation\)/)).toBeInTheDocument()
  })

  it('marks a price for an operation the institution cannot use as not used, without warning', async () => {
    backend.addRateCard('inst-3', `${nextMonth()}-01`, 0.5, 0.1)
    await renderRates()
    await screen.findByText('not used')
    expect(screen.queryByText('Priced at ৳0 this month')).not.toBeInTheDocument()
  })

  it('shows what the institution may do, and still asks for both prices', async () => {
    const user = userEvent.setup()
    await renderRates()
    await waitForCards()
    await user.click(screen.getByRole('button', { name: /New rate card/ }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    expect(within(drawer).getByText(/Can validate QR codes only/)).toBeInTheDocument()
    expect(within(drawer).getByText(/Not allowed for this institution today/)).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(within(drawer).getAllByText('Enter a price in BDT with up to 4 decimals.')).toHaveLength(2)
  })

  it('locks started cards and only offers Withdraw on a scheduled one', async () => {
    await renderRates()
    await waitForCards()
    expect(screen.getAllByText('Locked').length).toBe(2)
    expect(screen.getAllByRole('button', { name: /Withdraw rate card/ })).toHaveLength(1)
  })

  it('withdraws a scheduled card after confirming', async () => {
    const user = userEvent.setup()
    await renderRates()
    await waitForCards()
    expect(backend.find('inst-1')!.rateCards).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: /Withdraw rate card/ }))
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }))
    // The mutation DELETEs from the fake backend and invalidates the per-tenant cache; the
    // hook refetches and the row disappears from the table.
    expect(backend.callsTo('DELETE', '/v1/admin/billing/rate-cards/')).toHaveLength(1)
    expect(backend.find('inst-1')!.rateCards).toHaveLength(1)
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
  })

  it('schedules a new card for a future month and clears the no-rate-card notice', async () => {
    const user = userEvent.setup()
    await renderRates()
    await waitForCards()
    await user.click(screen.getByRole('button', { name: /New rate card/ }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    await user.type(within(drawer).getByLabelText('Starts on'), nextMonth())
    await user.type(within(drawer).getByLabelText(/Generation price/), '0.4')
    await user.type(within(drawer).getByLabelText(/Validation price/), '0.1')
    expect(within(drawer).getByText(`Applies from 1 ${periodName(nextMonth())}.`)).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    // POST is recorded by the fake backend and the per-tenant query refetches.
    const posts = backend.callsTo('POST', '/v1/admin/billing/rate-cards')
    expect(posts).toHaveLength(1)
    const body = posts[0].body as { tenantId: string; effectiveFrom: string; generationRate: number; validationRate: number }
    expect(body).toMatchObject({ tenantId: 'inst-3', effectiveFrom: `${nextMonth()}-01`, generationRate: 0.4, validationRate: 0.1 })
    expect(backend.find('inst-3')!.rateCards).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows errors for a bad price and a duplicate start month', async () => {
    const user = userEvent.setup()
    await renderRates()
    await user.click(screen.getByRole('button', { name: /New rate card/ }))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(await within(drawer).findByText('Choose an institution.')).toBeInTheDocument()
    expect(within(drawer).getAllByText('Enter a price in BDT with up to 4 decimals.')).toHaveLength(2)

    // Shapla Commercial Bank (inst-1) already has a card starting nextMonth — the server returns 409.
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Shapla Commercial Bank')
    await user.type(within(drawer).getByLabelText('Starts on'), nextMonth())
    await user.type(within(drawer).getByLabelText(/Generation price/), '0.4')
    await user.type(within(drawer).getByLabelText(/Validation price/), '0.1')
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(await within(drawer).findByText(/already has a rate card starting that month/)).toBeInTheDocument()
    // The duplicate POST was rejected; the tenant's card list is unchanged.
    const rejected = backend.callsTo('POST', '/v1/admin/billing/rate-cards').filter((c) => c.path === '/v1/admin/billing/rate-cards')
    expect(rejected).toHaveLength(1)
    expect(backend.find('inst-1')!.rateCards).toHaveLength(2)
  })
})