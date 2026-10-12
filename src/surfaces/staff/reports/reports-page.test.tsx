import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { seedOctober2026 } from '../../../test/scenario'
import { ReportsPage } from './reports-page'

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install()
  seedOctober2026(backend)
})
afterEach(() => {
  backend.reset()
  vi.restoreAllMocks()
})

const renderPage = (view?: 'summary' | 'institution' | 'trend') => renderApp(<ReportsPage view={view} />)

describe('reports page', () => {
  it('shows the month’s volume and revenue per institution, largest first', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    // The first table is the billed institutions; usage without a rate card is listed in a second one.
    const rows = within(screen.getAllByRole('table')[0]).getAllByRole('row')
    // Header, three institutions, total.
    expect(rows).toHaveLength(5)
    expect(rows[1]).toHaveTextContent('Shapla Commercial Bank')
    expect(rows[2]).toHaveTextContent('Karnaphuli Trust Bank')
    expect(rows[3]).toHaveTextContent('Teesta Digital Wallet')
    expect(screen.getByText('Institutions billed')).toBeInTheDocument()
    expect(screen.getByText('1 with usage, not billed')).toBeInTheDocument()
  })

  it('compares with the month before', async () => {
    renderPage()
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(screen.getAllByText(/vs Aug$/)).toHaveLength(2)
  })

  it('points to where outstanding usage and waiting adjustments are handled', async () => {
    renderPage()
    expect(await screen.findByText('2 late usage events')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Billing periods' })).toHaveAttribute('href', '/staff/periods')
    expect(screen.getByText('1 adjustment waiting')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Review adjustments' })).toHaveAttribute('href', '/staff/adjustments')
    expect(screen.queryByRole('button', { name: /Requeue/ })).not.toBeInTheDocument()
  })

  it('drops the late usage notice once it is recorded', async () => {
    backend.billing.outbox = []
    renderPage()
    await screen.findByRole('heading', { name: 'September 2026' })
    expect(screen.queryByText(/late usage/)).not.toBeInTheDocument()
  })

  it('switches month and shows a finalized one as the billing record', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: 'September 2026' })
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-04')
    expect(screen.getByRole('heading', { name: 'April 2026' })).toBeInTheDocument()
    expect(screen.getByText(/This month is finalized/)).toBeInTheDocument()
    expect(screen.queryByText(/vs /)).not.toBeInTheDocument()
    expect(screen.queryByText(/late usage/)).not.toBeInTheDocument()
  })

  it('offers three reports and marks the one you are on', async () => {
    renderPage('trend')
    const nav = await screen.findByRole('navigation', { name: 'Reports' })
    expect(within(nav).getByRole('link', { name: 'Monthly summary' })).toHaveAttribute('href', '/staff/reports')
    expect(within(nav).getByRole('link', { name: 'By institution' })).toHaveAttribute('href', '/staff/reports/institution')
    expect(within(nav).getByRole('link', { name: 'Revenue trend' })).toHaveAttribute('aria-current', 'page')
  })

  it('breaks down one institution: charges, place, history and a link to the bill', async () => {
    const user = userEvent.setup()
    renderPage('institution')
    expect(await screen.findByRole('heading', { name: 'Shapla Commercial Bank' })).toBeInTheDocument()
    expect(screen.getByText('1 of 3')).toBeInTheDocument()
    expect(screen.getByText('What was charged')).toBeInTheDocument()
    expect(screen.getByText('Last six months')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open bill/ })).toHaveAttribute('href', '/staff/periods/2026-09/statements/inst-1')
    await user.selectOptions(screen.getByLabelText('Institution'), 'Teesta Digital Wallet')
    expect(screen.getByRole('heading', { name: 'Teesta Digital Wallet' })).toBeInTheDocument()
    expect(screen.getByText('3 of 3')).toBeInTheDocument()
  })

  it('says when an institution has usage but no rate card in the chosen month', async () => {
    const user = userEvent.setup()
    renderPage('institution')
    await screen.findByRole('heading', { name: 'Shapla Commercial Bank' })
    await user.selectOptions(screen.getByLabelText('Institution'), 'Chandra Settlement Services')
    expect(screen.getByText('Not billed this month')).toBeInTheDocument()
    expect(screen.getByText('No rate card for this month')).toBeInTheDocument()
    expect(screen.queryByText('What was charged')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open bill/ })).not.toBeInTheDocument()
  })

  it('shows revenue month by month with each institution’s part', async () => {
    renderPage('trend')
    expect(await screen.findByRole('heading', { name: 'Revenue trend' })).toBeInTheDocument()
    const table = screen.getByRole('table')
    expect(within(table).getByRole('columnheader', { name: 'Teesta Digital Wallet' })).toBeInTheDocument()
    // Header plus one row for each of the seven months, April to the open October.
    expect(within(table).getAllByRole('row')).toHaveLength(8)
    expect(screen.getByRole('img', { name: /Monthly billable calls/ })).toBeInTheDocument()
  })

  it('opens the print dialog for the PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('downloads the CSV', async () => {
    const create = vi.fn(() => 'blob:report')
    URL.createObjectURL = create
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /Download CSV/ }))
    expect(create).toHaveBeenCalledOnce()
    expect(click).toHaveBeenCalledOnce()
  })

  it('says so when the billing data cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/billing/periods', 500)
    renderPage()
    await waitFor(() => expect(screen.getByText('Could not load billing data')).toBeInTheDocument())
  })
})
