import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetBilling } from '../../../shared/billing/store'
import { StatementPage } from './statement-page'

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/staff/periods" element={<p>periods list</p>} />
        <Route path="/staff/periods/:period/statements/:institutionId" element={<StatementPage />} />
      </Routes>
    </MemoryRouter>,
  )

describe('statement page', () => {
  afterEach(() => {
    resetBilling()
    vi.restoreAllMocks()
  })

  it('shows the bill with a way back, and opens the print dialog for the PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    open('/staff/periods/2026-08/statements/inst-1')
    expect(screen.getByRole('article', { name: 'Statement' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Billing periods/ })).toHaveAttribute('href', '/staff/periods')
    await user.click(screen.getByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('goes back to Billing periods when there is no such statement', () => {
    open('/staff/periods/2026-09/statements/inst-4')
    expect(screen.getByText('periods list')).toBeInTheDocument()
  })
})
