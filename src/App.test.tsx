import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import { queryClient } from './shared/api/query'
import { resetSessionForTests, restoreSession } from './shared/auth/session'
import { FakeBackend } from './test/fake-backend'

// Sign-in is a real username/password exchange against the (fake) API. `master` is the seeded
// platform admin; the fake keeps the HttpOnly refresh cookie the way a browser would.
const MASTER = { username: 'master', password: 'master-pw' }

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install({ signedIn: false })
  backend.addUser(MASTER.username, MASTER.password, { displayName: 'Master Admin' })
})

async function signInWith(username: string, password: string) {
  const user = userEvent.setup()
  render(<App />)
  await user.type(await screen.findByLabelText('Username'), username)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  return user
}

/** A browser reload: the React tree and all module memory go, the localStorage hint and the cookie stay. */
async function reloadApp() {
  cleanup()
  const hint = localStorage.getItem('sbqr-session')
  resetSessionForTests()
  if (hint) localStorage.setItem('sbqr-session', hint)
  void restoreSession()
  render(<App />)
}

function goTo(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

describe('App', () => {
  afterEach(() => {
    cleanup()
    backend.reset()
    resetSessionForTests()
    localStorage.clear()
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
    expect(await screen.findByText('Enter your username.')).toBeInTheDocument()
    expect(screen.getByText('Enter your password.')).toBeInTheDocument()
  })

  it('asks for a username and password: no client credentials, tabs or demo accounts', async () => {
    render(<App />)
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByLabelText(/client/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByText(/demo/i)).not.toBeInTheDocument()
  })

  it('rejects a wrong password with one message', async () => {
    await signInWith(MASTER.username, 'nope')
    expect(await screen.findByText('Invalid username or password.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Billing periods' })).not.toBeInTheDocument()
  })

  it('signs the master admin in to the staff console with the platform and billing menus', async () => {
    await signInWith(MASTER.username, MASTER.password)
    expect(await screen.findByRole('link', { name: 'Crypto keys' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Rate cards' })).toBeInTheDocument()
  })

  it('shows the signed-in user’s name and username in the account menu', async () => {
    const user = await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Institutions' })
    await user.click(screen.getByRole('button', { name: 'Account menu' }))
    expect(await screen.findByText('master')).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Change password' })).toBeInTheDocument()
  })

  it('gives staff no separate Usage menu (usage lives on each institution)', async () => {
    await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Institutions' })
    expect(screen.queryByRole('link', { name: 'Usage' })).not.toBeInTheDocument()
  })

  it('opens institution onboarding for staff', async () => {
    await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Billing periods' })
    goTo('/staff/institutions/new')
    await waitFor(() => expect(window.location.pathname).toBe('/staff/institutions/new'))
  })

  it('refuses an account that has no portal (institution users cannot sign in yet)', async () => {
    backend.addUser('shapla', 'pw', { role: 'FSP_OPERATOR' })
    await signInWith('shapla', 'pw')
    expect(await screen.findByText('This account cannot access the portal.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Statements' })).not.toBeInTheDocument()
  })
})

describe('App: staying signed in', () => {
  afterEach(() => {
    cleanup()
    backend.reset()
    resetSessionForTests()
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('keeps you signed in across a reload, without showing the login page', async () => {
    await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Billing periods' })

    await reloadApp()

    expect(await screen.findByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument()
    expect(backend.authCalls.filter((c) => c.path === '/v1/auth/login')).toHaveLength(1)
  })

  it('stays on the page you reloaded', async () => {
    await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Billing periods' })
    goTo('/staff/rates')
    await waitFor(() => expect(window.location.pathname).toBe('/staff/rates'))

    await reloadApp()

    expect(await screen.findByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/staff/rates')
  })

  it('does not restore a session after you signed out', async () => {
    const user = await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Billing periods' })
    await user.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    await reloadApp()

    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(backend.authCalls.filter((c) => c.path === '/v1/auth/refresh')).toHaveLength(0)
  })

  it('returns to the login screen with an explanation when the session can no longer be refreshed', async () => {
    const user = await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Billing periods' })
    backend.expireAccessTokens()
    backend.dropRefreshCookie()

    await user.click(screen.getByRole('link', { name: 'Institutions' }))

    expect(await screen.findByText('Your session expired. Please sign in again.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('goes back to the page you were on after an expired session is signed in again', async () => {
    await signInWith(MASTER.username, MASTER.password)
    await screen.findByRole('link', { name: 'Billing periods' })
    goTo('/staff/rates')
    await waitFor(() => expect(window.location.pathname).toBe('/staff/rates'))
    await screen.findByRole('heading', { name: 'Rate cards' })
    backend.expireAccessTokens()
    backend.dropRefreshCookie()

    // The page's data goes stale and refetches: the API refuses, the refresh token is gone.
    await act(async () => {
      await queryClient.invalidateQueries()
    })
    await screen.findByText('Your session expired. Please sign in again.')
    const user = userEvent.setup()
    await user.type(screen.getByLabelText('Username'), MASTER.username)
    await user.type(screen.getByLabelText('Password'), MASTER.password)
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/staff/rates')
  }, 15_000)
})

describe('App: first sign-in password change', () => {
  afterEach(() => {
    cleanup()
    backend.reset()
    resetSessionForTests()
    localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('makes an account with a pending password change set a new one before anything else', async () => {
    backend.addUser('fresh', 'temp-pass', { displayName: 'Fresh Admin', mustChangePassword: true })
    const user = await signInWith('fresh', 'temp-pass')

    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/change-password')
    expect(screen.queryByRole('link', { name: 'Billing periods' })).not.toBeInTheDocument()

    // The staff console is out of reach until the password is changed.
    await act(async () => goTo('/staff/overview'))
    expect(window.location.pathname).toBe('/change-password')
    expect(await screen.findByRole('heading', { name: 'Change password' })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Current password'), 'temp-pass')
    await user.type(screen.getByLabelText('New password'), 'a-much-better-pass')
    await user.type(screen.getByLabelText('Repeat new password'), 'a-much-better-pass')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    // The API ends every session on success, so the user signs in again with the new password.
    expect(await screen.findByText('Password changed. Sign in again with your new password.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Username'), 'fresh')
    await user.type(screen.getByLabelText('Password'), 'a-much-better-pass')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('link', { name: 'Billing periods' })).toBeInTheDocument()
  })

  it('shows a wrong current password inline and keeps the user signed in', async () => {
    backend.addUser('fresh', 'temp-pass', { mustChangePassword: true })
    const user = await signInWith('fresh', 'temp-pass')
    await screen.findByRole('heading', { name: 'Change password' })

    await user.type(screen.getByLabelText('Current password'), 'not-it')
    await user.type(screen.getByLabelText('New password'), 'a-much-better-pass')
    await user.type(screen.getByLabelText('Repeat new password'), 'a-much-better-pass')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Change password' })).toBeInTheDocument()
    expect(backend.authCalls.filter((c) => c.path === '/v1/auth/refresh')).toHaveLength(0)
  })

  it('checks the new password locally before calling the API', async () => {
    backend.addUser('fresh', 'temp-pass', { mustChangePassword: true })
    const user = await signInWith('fresh', 'temp-pass')
    await screen.findByRole('heading', { name: 'Change password' })

    await user.type(screen.getByLabelText('Current password'), 'temp-pass')
    await user.type(screen.getByLabelText('New password'), 'short')
    await user.type(screen.getByLabelText('Repeat new password'), 'different')
    await user.click(screen.getByRole('button', { name: 'Change password' }))

    expect(await screen.findByText('Use at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('The passwords do not match.')).toBeInTheDocument()
    expect(backend.authCalls.filter((c) => c.path === '/v1/auth/change-password')).toHaveLength(0)
  })
})
