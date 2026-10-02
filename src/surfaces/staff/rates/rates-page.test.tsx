import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { periodName } from '../../../shared/format'
import { currentMonth, nextMonth } from './rates'
import { RatesPage } from './rates-page'
import { addRateCard, getRateCards, resetRateCards } from './store'

describe('rate cards page', () => {
  afterEach(resetRateCards)

  it('lists cards with their state and names the active institution that has no card', () => {
    render(<RatesPage />)
    expect(screen.getAllByText('In effect').length).toBeGreaterThan(0)
    expect(screen.getByText('Scheduled')).toBeInTheDocument()
    expect(screen.getByText(/1 active institution has no rate card/)).toBeInTheDocument()
    expect(screen.getByText(/Teesta Digital Wallet/)).toBeInTheDocument()
  })

  it('warns when an allowed operation is priced at zero this month', () => {
    addRateCard({ institutionId: 'inst-2', effectiveFrom: `${currentMonth()}-01`, generationRate: 0, validationRate: 0.1 })
    render(<RatesPage />)
    expect(screen.getByText('Priced at ৳0 this month')).toBeInTheDocument()
    expect(screen.getByText(/Karnaphuli Trust Bank \(generation\)/)).toBeInTheDocument()
  })

  it('marks a price for an operation the institution cannot use as not used, without warning', () => {
    addRateCard({ institutionId: 'inst-3', effectiveFrom: `${nextMonth()}-01`, generationRate: 0.5, validationRate: 0.1 })
    render(<RatesPage />)
    expect(screen.getByText('not used')).toBeInTheDocument()
    expect(screen.queryByText('Priced at ৳0 this month')).not.toBeInTheDocument()
  })

  it('shows what the institution may do, and still asks for both prices', async () => {
    const user = userEvent.setup()
    render(<RatesPage />)
    await user.click(screen.getByRole('button', { name: /New rate card/ }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    expect(within(drawer).getByText(/Can validate QR codes only/)).toBeInTheDocument()
    expect(within(drawer).getByText(/Not allowed for this institution today/)).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(within(drawer).getAllByText('Enter a price in BDT with up to 4 decimals.')).toHaveLength(2)
  })

  it('locks started cards and only offers Withdraw on a scheduled one', () => {
    render(<RatesPage />)
    expect(screen.getAllByText('Locked').length).toBe(2)
    expect(screen.getAllByRole('button', { name: /Withdraw rate card/ })).toHaveLength(1)
  })

  it('withdraws a scheduled card after confirming', async () => {
    const user = userEvent.setup()
    render(<RatesPage />)
    const before = getRateCards().length
    await user.click(screen.getByRole('button', { name: /Withdraw rate card/ }))
    await user.click(await screen.findByRole('button', { name: 'Withdraw' }))
    expect(getRateCards()).toHaveLength(before - 1)
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
  })

  it('schedules a new card for a future month and clears the no-rate-card notice', async () => {
    const user = userEvent.setup()
    render(<RatesPage />)
    await user.click(screen.getByRole('button', { name: /New rate card/ }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    await user.type(within(drawer).getByLabelText('Starts on'), nextMonth())
    await user.type(within(drawer).getByLabelText(/Generation price/), '0.4')
    await user.type(within(drawer).getByLabelText(/Validation price/), '0.1')
    expect(within(drawer).getByText(`Applies from 1 ${periodName(nextMonth())}.`)).toBeInTheDocument()
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(getRateCards().some((c) => c.institutionId === 'inst-3' && c.generationRate === 0.4)).toBe(true)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows errors for a bad price and a duplicate start month', async () => {
    const user = userEvent.setup()
    render(<RatesPage />)
    await user.click(screen.getByRole('button', { name: /New rate card/ }))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(await within(drawer).findByText('Choose an institution.')).toBeInTheDocument()
    expect(within(drawer).getAllByText('Enter a price in BDT with up to 4 decimals.')).toHaveLength(2)

    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Shapla Commercial Bank')
    await user.type(within(drawer).getByLabelText('Starts on'), nextMonth())
    await user.type(within(drawer).getByLabelText(/Generation price/), '0.4')
    await user.type(within(drawer).getByLabelText(/Validation price/), '0.1')
    await user.click(within(drawer).getByRole('button', { name: 'Schedule rate card' }))
    expect(await within(drawer).findByText(/already has a rate card starting that month/)).toBeInTheDocument()
  })
})
