import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requeueAll, resetBilling } from '../../../shared/billing/store'
import { ReportsPage } from './reports-page'

const renderPage = (view?: 'summary' | 'institution' | 'trend') =>
  render(
    <MemoryRouter>
      <ReportsPage view={view} />
    </MemoryRouter>,
  )

describe('reports page', () => {
  afterEach(() => {
    resetBilling()
    vi.restoreAllMocks()
  })

  it('shows the month’s volume and revenue per institution, largest first', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    // Header, three institutions, total.
    expect(rows).toHaveLength(5)
    expect(rows[1]).toHaveTextContent('Shapla Commercial Bank')
    expect(rows[2]).toHaveTextContent('Karnaphuli Trust Bank')
    expect(rows[3]).toHaveTextContent('Teesta Digital Wallet')
    expect(screen.getByText('Institutions billed')).toBeInTheDocument()
  })

  it('compares with the month before', () => {
    renderPage()
    expect(screen.getAllByText(/vs Aug$/)).toHaveLength(2)
  })

  it('points to where late usage and waiting adjustments are handled', () => {
    renderPage()
    expect(screen.getByText('2 late usage events')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Billing periods' })).toHaveAttribute('href', '/staff/periods')
    expect(screen.getByText('2 adjustments waiting')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review adjustments' })).toHaveAttribute('href', '/staff/adjustments')
    expect(screen.queryByRole('button', { name: /Requeue/ })).not.toBeInTheDocument()
  })

  it('drops the late usage notice once it is delivered', () => {
    requeueAll()
    renderPage()
    expect(screen.queryByText(/late usage/)).not.toBeInTheDocument()
  })

  it('switches month and shows a finalized one as the billing record', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-04')
    expect(screen.getByRole('heading', { name: 'April 2026' })).toBeInTheDocument()
    expect(screen.getByText(/This month is finalized/)).toBeInTheDocument()
    expect(screen.queryByText(/vs /)).not.toBeInTheDocument()
    expect(screen.queryByText(/late usage/)).not.toBeInTheDocument()
  })

  it('offers three reports and marks the one you are on', () => {
    renderPage('trend')
    const nav = screen.getByRole('navigation', { name: 'Reports' })
    expect(within(nav).getByRole('link', { name: 'Monthly summary' })).toHaveAttribute('href', '/staff/reports')
    expect(within(nav).getByRole('link', { name: 'By institution' })).toHaveAttribute('href', '/staff/reports/institution')
    expect(within(nav).getByRole('link', { name: 'Revenue trend' })).toHaveAttribute('aria-current', 'page')
  })

  it('breaks down one institution: charges, place, history and a link to the bill', async () => {
    const user = userEvent.setup()
    renderPage('institution')
    expect(screen.getByRole('heading', { name: 'Shapla Commercial Bank' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.getByText('What was charged')).toBeInTheDocument()
    expect(screen.getByText('Last six months')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open bill/ })).toHaveAttribute('href', '/staff/periods/2026-09/statements/inst-1')
    await user.selectOptions(screen.getByLabelText('Institution'), 'Teesta Digital Wallet')
    expect(screen.getByRole('heading', { name: 'Teesta Digital Wallet' })).toBeInTheDocument()
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
  })

  it('says when an institution has no billed usage in the chosen month', async () => {
    const user = userEvent.setup()
    renderPage('institution')
    await user.selectOptions(screen.getByLabelText('Institution'), 'Chandra Settlement Services')
    expect(screen.getByText('Not billed this month')).toBeInTheDocument()
    expect(screen.queryByText('What was charged')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open bill/ })).not.toBeInTheDocument()
  })

  it('shows revenue month by month with each institution’s part', () => {
    renderPage('trend')
    expect(screen.getByRole('heading', { name: 'Revenue trend' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Doyel Co-operative Finance' })).toBeInTheDocument()
    // Header plus one row for each of the six months.
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(screen.getByRole('img', { name: /Monthly billable calls/ })).toBeInTheDocument()
  })

  it('opens the print dialog for the PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('downloads the CSV', async () => {
    const create = vi.fn(() => 'blob:report')
    URL.createObjectURL = create
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Download CSV/ }))
    expect(create).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
  })
})
