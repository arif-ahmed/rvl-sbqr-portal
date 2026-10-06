import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { signOut } from './shared/auth/session'
import { FakeBackend } from './test/fake-backend'

// Sign-in is a real client-credentials exchange against the (fake) API: the platform bootstrap client
// for staff, a provisioned client for an institution.
const BOOTSTRAP = { id: 'platform_bootstrap', secret: 'bootstrap-secret' }
const SHAPLA_CLIENT = { id: 'shapla-ops', secret: 'shapla-secret', tenantId: 'inst-1' }

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install({ signedIn: false })
  backend.addClient(BOOTSTRAP.id, BOOTSTRAP.secret, { sub: 'platform-admin', scope: ['admin'] })
  backend.addClient(SHAPLA_CLIENT.id, SHAPLA_CLIENT.secret, { sub: SHAPLA_CLIENT.id, tenant_id: SHAPLA_CLIENT.tenantId, scope: ['billing:read', 'qr:generate', 'qr:validate'] })
  backend.billing.fiTenantId = SHAPLA_CLIENT.tenantId
})

async function signInAs(who: 'staff' | 'fi', clientId: string, secret: string) {
  const user = userEvent.setup()
  render(<App />)
  if (who === 'staff') await user.click(await screen.findByRole('tab', { name: 'RVL Staff' }))
  await user.type(await screen.findByLabelText('Client ID'), clientId)
  await user.type(screen.getByLabelText('Client secret'), secret)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('App', () => {
  afterEach(() => {
    signOut()
    backend.reset()
    window.history.pushState({}, '', '/')
  })

  it('sends signed-out users to the login screen', async () => {
    render(<App />)
    // First lazy chunk compiles slowly in jsdom, so allow extra time here only.
    expect(await screen.findByRole('heading', { name: 'Sign in' }, { timeout: 8000 })).toBeInTheDocument()
  })

  it('validates empty credentials', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Enter your client ID.')).toBeInTheDocument()
    expect(screen.getByText('Enter your client secret.')).toBeInTheDocument()
  })

  it('offers no demo accounts: only the client ID and secret', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Finance|Admin/ })).not.toBeInTheDocument()
  })

  it('rejects a wrong secret with the API’s own refusal', async () => {
    await signInAs('staff', BOOTSTRAP.id, 'nope')
    expect(await screen.findByText('Invalid client ID or client secret.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Billing periods' })).not.toBeInTheDocument()
  })

  it('signs the platform bootstrap client in to the staff console with the platform and billing menus', async () => {
    await signInAs('staff', BOOTSTRAP.id, BOOTSTRAP.secret)
    expect(await screen.findByRole('link', { name: 'Crypto keys' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rate cards' })).toBeInTheDocument()
  })

  it('gives staff no separate Usage menu (usage lives on each institution)', async () => {
    await signInAs('staff', BOOTSTRAP.id, BOOTSTRAP.secret)
    await screen.findByRole('link', { name: 'Institutions' })
    expect(screen.queryByRole('link', { name: 'Usage' })).not.toBeInTheDocument()
  })

  it('opens institution onboarding for staff', async () => {
    await signInAs('staff', BOOTSTRAP.id, BOOTSTRAP.secret)
    await screen.findByRole('link', { name: 'Billing periods' })
    window.history.pushState({}, '', '/staff/institutions/new')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/staff/institutions/new'))
  })

  it('tells an institution’s client to use the Institution tab, not the staff one', async () => {
    await signInAs('staff', SHAPLA_CLIENT.id, SHAPLA_CLIENT.secret)
    expect(await screen.findByText(/belongs to an institution/)).toBeInTheDocument()
  })

  it('shows the institution user their own Usage menu', async () => {
    await signInAs('fi', SHAPLA_CLIENT.id, SHAPLA_CLIENT.secret)
    expect(await screen.findByRole('link', { name: 'Usage' })).toBeInTheDocument()
  })

  it('keeps an institution user out of staff routes', async () => {
    await signInAs('fi', SHAPLA_CLIENT.id, SHAPLA_CLIENT.secret)
    expect(await screen.findByRole('link', { name: 'Statements' })).toBeInTheDocument()
    window.history.pushState({}, '', '/staff/rates')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/fi/overview'))
  })
})
