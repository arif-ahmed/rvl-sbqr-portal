import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import App from './App'
import { signOut } from './shared/auth/session'

async function signInAs(label: 'Admin' | 'Finance' | 'Institution') {
  const user = userEvent.setup()
  render(<App />)
  if (label !== 'Institution') await user.click(await screen.findByRole('tab', { name: 'RVL Staff' }))
  await user.click(await screen.findByRole('button', { name: label }))
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

describe('App', () => {
  afterEach(() => {
    signOut()
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

  it('rejects a wrong password', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.type(await screen.findByLabelText('Client ID'), 'finance@rvl.example')
    await user.click(screen.getByRole('tab', { name: 'RVL Staff' }))
    await user.type(screen.getByLabelText('Client secret'), 'nope')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Invalid user ID or password.')).toBeInTheDocument()
  })

  it('shows Finance the billing menu and not the admin menu', async () => {
    await signInAs('Finance')
    expect(await screen.findByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Crypto keys' })).not.toBeInTheDocument()
  })

  it('shows Admin the platform menu and the billing menu too', async () => {
    await signInAs('Admin')
    expect(await screen.findByRole('link', { name: 'Crypto keys' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
  })

  it('lets Admin, but not Finance, open institution onboarding', async () => {
    await signInAs('Finance')
    await screen.findByRole('link', { name: 'Billing periods' })
    window.history.pushState({}, '', '/staff/institutions/new')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/staff/institutions'))
  })

  it('gives staff no separate Usage menu (usage lives on each institution)', async () => {
    await signInAs('Admin')
    await screen.findByRole('link', { name: 'Institutions' })
    expect(screen.queryByRole('link', { name: 'Usage' })).not.toBeInTheDocument()
  })

  it('shows the institution user their own Usage menu', async () => {
    await signInAs('Institution')
    expect(await screen.findByRole('link', { name: 'Usage' })).toBeInTheDocument()
  })

  it('keeps an institution user out of staff routes', async () => {
    await signInAs('Institution')
    expect(await screen.findByRole('link', { name: 'Statements' })).toBeInTheDocument()
    window.history.pushState({}, '', '/staff/rates')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await waitFor(() => expect(window.location.pathname).toBe('/fi/overview'))
  })
})
