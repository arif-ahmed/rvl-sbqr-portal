import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../../shared/auth/session'
import { resetBilling } from '../../shared/billing/store'
import { FakeBackend, installFakeBackend } from '../../test/fake-backend'
import { renderApp } from '../../test/providers'
import { OverviewPage } from './overview-page'

const finance: Session = { userId: 'finance@rvl.example', name: 'Nadia Brian', title: 'Finance', role: 'finance', surface: 'staff' }
const admin: Session = { userId: 'admin@rvl.example', name: 'Tanvir Hasan', title: 'Platform Admin', role: 'admin', surface: 'staff' }

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
})
afterEach(() => {
  resetBilling()
  backend.reset()
})

/** The institutions arrive from the API after the first paint: wait for the live-institutions tile. */
async function renderPage(session: Session) {
  renderApp(<OverviewPage session={session} />)
  await screen.findByText('2 pending · 1 suspended')
}

describe('staff overview page', () => {
  it('tells Finance the month is ready to close and what stands in the way', async () => {
    await renderPage(finance)
    expect(screen.getByRole('heading', { name: 'September 2026 is ready to close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open billing period/ })).toBeInTheDocument()
    expect(screen.getByText('2 usage events queued')).toBeInTheDocument()
    expect(screen.getByText('2 pending adjustments')).toBeInTheDocument()
    expect(screen.getByText('Activation pending')).toBeInTheDocument()
    expect(screen.getByText('Draft · not yet finalized')).toBeInTheDocument()
  })

  it('flags a live institution that has no rate card', async () => {
    await renderPage(finance)
    expect(screen.getByText('No rate card, usage is not billed')).toBeInTheDocument()
    expect(screen.getAllByText('Teesta Digital Wallet').length).toBeGreaterThan(0)
  })

  it('summarises the month and each institution’s share of it', async () => {
    await renderPage(finance)
    // "3 / 7" is styled with a muted "/ 7", so match on the tile's combined text.
    expect(screen.getByText((_, el) => el?.textContent === '3 / 7' && el.classList.contains('num'))).toBeInTheDocument()
    expect(screen.getByText('Need attention before month close')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Institutions · September 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Shapla Commercial Bank/ })).toBeInTheDocument()
  })

  it('greets Admin with the platform story instead', async () => {
    await renderPage(admin)
    expect(screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), Tanvir$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add institution/ })).toBeInTheDocument()
  })
})
