import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../../shared/auth/session'
import { FakeBackend } from '../../test/fake-backend'
import { renderApp } from '../../test/providers'
import { seedOctober2026 } from '../../test/scenario'
import { OverviewPage } from './overview-page'

const admin: Session = { userId: 'id-platform-admin', username: 'platform-admin', name: 'RVL Staff', title: 'Platform Admin', role: 'MASTER_ADMIN', surface: 'staff', mustChangePassword: false }

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install()
  seedOctober2026(backend)
})
afterEach(() => backend.reset())

/** The institutions and the billing data arrive from the API after the first paint. */
async function renderPage() {
  renderApp(<OverviewPage session={admin} />)
  await screen.findByText('2 pending · 1 suspended')
}

describe('staff overview page', () => {
  it('tells staff the month is ready to close and what stands in the way', async () => {
    await renderPage()
    expect(screen.getByRole('heading', { name: 'September 2026 is ready to close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open billing period/ })).toBeInTheDocument()
    expect(screen.getByText('2 usage events queued')).toBeInTheDocument()
    expect(screen.getByText('1 dead-lettered · blocks finalizing')).toBeInTheDocument()
    expect(screen.getByText('1 pending adjustment')).toBeInTheDocument()
    expect(screen.getByText('Activation pending')).toBeInTheDocument()
    expect(screen.getByText('Draft · not yet finalized')).toBeInTheDocument()
  })

  it('flags a live institution that has no rate card', async () => {
    backend.addTenant('0099', 'Padma Savings Bank')
    await renderPage()
    expect(screen.getByText('No rate card, usage is not billed')).toBeInTheDocument()
    expect(screen.getAllByText('Padma Savings Bank').length).toBeGreaterThan(0)
  })

  it('summarises the month and each institution’s share of it', async () => {
    await renderPage()
    // "3 / 7" is styled with a muted "/ 7", so match on the tile's combined text.
    expect(screen.getByText((_, el) => el?.textContent === '3 / 7' && el.classList.contains('num'))).toBeInTheDocument()
    expect(screen.getByText('Need attention before month close')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Institutions · September 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Shapla Commercial Bank/ })).toBeInTheDocument()
    // The month's total is the API's, shown once as a tile.
    expect(screen.getByText('৳ 11,037.73')).toBeInTheDocument()
    expect(screen.getByText(/vs Aug$/)).toBeInTheDocument()
  })

  it('greets the platform admin once nothing is being closed', async () => {
    backend.billing.outbox = []
    backend.billing.periods.delete('2026-09')
    await renderPage()
    expect(screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), RVL$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add institution/ })).toBeInTheDocument()
    expect(screen.getByText('Live view · not yet drafted')).toBeInTheDocument()
  })

  it('says so when the billing data cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/outbox', 500)
    renderApp(<OverviewPage session={admin} />)
    expect(await screen.findByText('Could not load billing data')).toBeInTheDocument()
  })
})
