import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Session } from '../../shared/auth/session'
import { resetBilling } from '../../shared/billing/store'
import { resetInstitutions } from './institutions/store'
import { OverviewPage } from './overview-page'

const finance: Session = { userId: 'finance@rvl.example', name: 'Nadia Brian', title: 'Finance', role: 'finance', surface: 'staff' }
const admin: Session = { userId: 'admin@rvl.example', name: 'Tanvir Hasan', title: 'Platform Admin', role: 'admin', surface: 'staff' }

const renderPage = (session: Session) =>
  render(
    <MemoryRouter>
      <OverviewPage session={session} />
    </MemoryRouter>,
  )

describe('staff overview page', () => {
  afterEach(() => {
    resetBilling()
    resetInstitutions()
  })

  it('tells Finance the month is ready to close and what stands in the way', () => {
    renderPage(finance)
    expect(screen.getByRole('heading', { name: 'September 2026 is ready to close' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open billing period/ })).toBeInTheDocument()
    expect(screen.getByText('2 usage events queued')).toBeInTheDocument()
    expect(screen.getByText('2 pending adjustments')).toBeInTheDocument()
    expect(screen.getByText('Certificate expires in 12 days')).toBeInTheDocument()
    expect(screen.getByText('Activation pending')).toBeInTheDocument()
    expect(screen.getByText('Draft · not yet finalized')).toBeInTheDocument()
  })

  it('summarises the month and each institution’s share of it', () => {
    renderPage(finance)
    // "3 / 7" is styled with a muted "/ 7", so match on the tile's combined text.
    expect(screen.getByText((_, el) => el?.textContent === '3 / 7' && el.classList.contains('num'))).toBeInTheDocument()
    expect(screen.getByText('2 pending · 1 suspended')).toBeInTheDocument()
    expect(screen.getByText('Need attention before month close')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Institutions · September 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Shapla Commercial Bank/ })).toBeInTheDocument()
  })

  it('greets Admin with the platform story instead', () => {
    renderPage(admin)
    expect(screen.getByRole('heading', { name: /^Good (morning|afternoon|evening), Tanvir$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add institution/ })).toBeInTheDocument()
  })
})
