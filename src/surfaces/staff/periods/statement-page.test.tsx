import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { seedOctober2026 } from '../../../test/scenario'
import { StatementPage } from './statement-page'

const open = (path: string) =>
  renderApp(
    <Routes>
      <Route path="/staff/periods" element={<p>periods list</p>} />
      <Route path="/staff/periods/:period/statements/:institutionId" element={<StatementPage />} />
    </Routes>,
    [path],
  )

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install()
  seedOctober2026(backend)
})
afterEach(() => {
  backend.reset()
  vi.restoreAllMocks()
})

describe('statement page', () => {
  it('shows the bill with a way back, and opens the print dialog for the PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    open('/staff/periods/2026-08/statements/inst-1')
    expect(await screen.findByRole('article', { name: 'Statement' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Billing periods/ })).toHaveAttribute('href', '/staff/periods')
    await user.click(screen.getByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalledOnce()
  })

  it('goes back to Billing periods when there is no such statement', async () => {
    // Surma Payments (inst-4) has no rate card, so it has no statement in any month.
    open('/staff/periods/2026-09/statements/inst-4')
    expect(await screen.findByText('periods list')).toBeInTheDocument()
  })

  it('says so when the billing data cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/billing/periods', 500)
    open('/staff/periods/2026-08/statements/inst-1')
    expect(await screen.findByText('Could not load billing data')).toBeInTheDocument()
  })
})
