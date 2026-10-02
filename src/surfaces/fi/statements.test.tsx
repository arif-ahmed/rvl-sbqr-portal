import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetBilling } from '../../shared/billing/store'
import { StatementDetailPage } from './statement-detail-page'
import { StatementsPage } from './statements-page'

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/fi/statements" element={<StatementsPage />} />
        <Route path="/fi/statements/:period" element={<StatementDetailPage />} />
        <Route path="/fi/usage" element={<p>usage page</p>} />
      </Routes>
    </MemoryRouter>,
  )

describe('FI statements', () => {
  afterEach(() => {
    resetBilling()
    vi.restoreAllMocks()
  })

  it('lists the institution’s own statements, newest first, with draft and final marked', () => {
    open('/fi/statements')
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    expect(within(rows[0]).getByText('September 2026')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Draft')).toBeInTheDocument()
    expect(within(rows[1]).getByText('August 2026')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Finalized')).toBeInTheDocument()
    expect(within(rows[1]).getByText('−৳ 1,200')).toBeInTheDocument()
    expect(screen.queryByText('Karnaphuli Trust Bank')).not.toBeInTheDocument()
  })

  it('opens a statement from its row', async () => {
    const user = userEvent.setup()
    open('/fi/statements')
    await user.click(screen.getAllByRole('row')[2])
    expect(screen.getByRole('article', { name: 'Statement' })).toBeInTheDocument()
    expect(screen.getByText('1 – 31 August 2026')).toBeInTheDocument()
  })

  it('shows the bill with a way to check it against usage, and prints it as a PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    open('/fi/statements/2026-08')
    expect(screen.getByRole('link', { name: /Statements/ })).toHaveAttribute('href', '/fi/statements')
    expect(screen.getByRole('link', { name: 'Open usage for August 2026' })).toHaveAttribute('href', '/fi/usage?period=2026-08')
    await user.click(screen.getByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeInTheDocument()
  })

  it('goes back to the list when there is no such statement', () => {
    open('/fi/statements/2026-03')
    expect(screen.getByRole('table')).toBeInTheDocument()
  })
})
