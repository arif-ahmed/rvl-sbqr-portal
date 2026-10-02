import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { UsagePage } from './usage-page'

const open = (path = '/fi/usage') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <UsagePage />
    </MemoryRouter>,
  )

describe('FI usage page', () => {
  it('opens on the current draft month with its totals and a link to the bill', () => {
    open()
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(screen.getByText('3,015')).toBeInTheDocument()
    expect(screen.getByText('12,466')).toBeInTheDocument()
    expect(screen.getByText('15,341')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check the bill' })).toHaveAttribute('href', '/fi/statements/2026-09')
  })

  it('has no search by client reference or event ID, and no date range inside a month', () => {
    open()
    expect(screen.queryByLabelText('Search usage')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument()
  })

  it('switches the whole page to another billing period', async () => {
    const user = userEvent.setup()
    open()
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-08')
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument()
    expect(screen.getByText('2,902')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check the bill' })).toHaveAttribute('href', '/fi/statements/2026-08')
    expect(screen.getByText('No events match')).toBeInTheDocument()
  })

  it('takes the period from the link, e.g. from a statement', () => {
    open('/fi/usage?period=2026-06')
    expect(screen.getByRole('heading', { name: 'June 2026' })).toBeInTheDocument()
    expect(screen.getByText('2,655')).toBeInTheDocument()
  })

  it('pages through the month and resets the page when a filter changes', async () => {
    const user = userEvent.setup()
    open()
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Page 2 of/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Meter'), 'VALIDATION')
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
  })

  it('shows an empty state and Reset when nothing matches', async () => {
    const user = userEvent.setup()
    open('/fi/usage?period=2026-08')
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    await user.selectOptions(screen.getByLabelText('Meter'), 'VALIDATION')
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.getByText('No events match')).toBeInTheDocument()
  })
})
