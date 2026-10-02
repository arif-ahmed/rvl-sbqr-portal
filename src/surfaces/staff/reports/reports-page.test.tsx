import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { resetBilling, getBilling } from '../../../shared/billing/store'
import { ReportsPage } from './reports-page'

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReportsPage />
    </MemoryRouter>,
  )

describe('reports page', () => {
  afterEach(resetBilling)

  it('lists the queued usage events that block the month close', () => {
    renderPage()
    expect(screen.getByRole('tab', { name: 'Late usage (2)' })).toBeInTheDocument()
    expect(screen.getByText('ob-7731')).toBeInTheDocument()
    expect(screen.getByText('ob-7732')).toBeInTheDocument()
    expect(screen.getAllByText('Teesta Digital Wallet')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: 'Requeue' })).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Requeue all' })).toBeInTheDocument()
  })

  it('delivers one requeued event and updates the tab count', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getAllByRole('button', { name: 'Requeue' })[0])
    expect(await screen.findByRole('tab', { name: 'Late usage (1)' })).toBeInTheDocument()
    expect(getBilling().outbox.find((e) => e.id === 'ob-7731')?.status).toBe('Delivered')
    expect(getBilling().outbox.find((e) => e.id === 'ob-7732')?.status).toBe('Queued')
  })

  it('requeues everything, leaving nothing outstanding', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Requeue all' }))
    expect(await screen.findByText('Nothing outstanding')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Late usage' })).toBeInTheDocument()
  })

  it('shows the pending adjustments and where to settle them', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: 'Pending adjustments (2)' }))
    expect(screen.getByText('Karnaphuli Trust Bank')).toBeInTheDocument()
    expect(screen.getByText('−৳ 500')).toBeInTheDocument()
    expect(screen.getByText('+৳ 250')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Go to Adjustments' })).toBeInTheDocument()
  })
})
