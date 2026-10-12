import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { apiGet } from '../api/client'
import { FakeBackend } from '../../test/fake-backend'
import { getSession, getSessionNotice, getSessionStatus, resetSessionForTests, restoreSession, SESSION_EXPIRED_NOTICE, signIn, signOut } from './session'

const HINT = 'sbqr-session'

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install({ signedIn: false })
  backend.addUser('master', 'secret', { displayName: 'Master Admin' })
})

afterEach(() => {
  backend.reset()
  resetSessionForTests()
  localStorage.clear()
})

/** What a page reload does: memory is wiped, the localStorage hint and the HttpOnly cookie stay. */
function reload() {
  const hint = localStorage.getItem(HINT)
  resetSessionForTests()
  if (hint) localStorage.setItem(HINT, hint)
}

describe('sign-in (username and password)', () => {
  it('signs a platform user in to the staff console', async () => {
    const session = await signIn('master', 'secret')

    expect(session).toMatchObject({ username: 'master', name: 'Master Admin', role: 'MASTER_ADMIN', surface: 'staff', title: 'Platform Admin', mustChangePassword: false })
    expect(getSession()).toBe(session)
    expect(getSessionStatus()).toBe('authenticated')
  })

  it('keeps tokens out of browser storage: only the non-secret hint is written', async () => {
    await signIn('master', 'secret')

    expect(localStorage.getItem(HINT)).toBe('1')
    expect(localStorage.length).toBe(1)
    expect(sessionStorage.length).toBe(0)
    expect(JSON.stringify({ ...localStorage })).not.toMatch(/access-|refresh-/)
  })

  it('rejects a wrong password and leaves no session or hint', async () => {
    await expect(signIn('master', 'nope')).rejects.toThrow('Invalid username or password.')

    expect(getSession()).toBeNull()
    expect(localStorage.getItem(HINT)).toBeNull()
  })

  it('carries a pending password change', async () => {
    backend.addUser('fresh', 'temp', { mustChangePassword: true })
    expect(await signIn('fresh', 'temp')).toMatchObject({ mustChangePassword: true })
  })

  it('refuses an account whose role has no portal and revokes the session it just opened', async () => {
    backend.addUser('shapla', 'pw', { role: 'FSP_OPERATOR' })

    await expect(signIn('shapla', 'pw')).rejects.toThrow('cannot access the portal')

    expect(getSession()).toBeNull()
    expect(localStorage.getItem(HINT)).toBeNull()
    expect(backend.authCalls.map((c) => c.path)).toContain('/v1/auth/logout')
    expect(backend.refreshCookie).toBeNull()
  })
})

describe('sign-out', () => {
  it('clears the session, the hint and the server-side session', async () => {
    await signIn('master', 'secret')

    await signOut()

    expect(getSession()).toBeNull()
    expect(getSessionStatus()).toBe('anonymous')
    expect(localStorage.getItem(HINT)).toBeNull()
    expect(backend.refreshCookie).toBeNull()
    await expect(apiGet('/v1/admin/tenants')).rejects.toBeInstanceOf(Error)
  })

  it('does not call the API when nobody is signed in', async () => {
    await signOut()
    expect(backend.authCalls).toHaveLength(0)
  })
})

describe('staying signed in across a reload', () => {
  it('restores the session from the refresh cookie without asking for a password', async () => {
    await signIn('master', 'secret')
    reload()
    expect(getSession()).toBeNull()

    await restoreSession()

    expect(getSession()).toMatchObject({ username: 'master', name: 'Master Admin', surface: 'staff' })
    expect(backend.authCalls.map((c) => c.path)).toEqual(['/v1/auth/login', '/v1/auth/refresh'])
    // And the API works with the token that came back.
    await expect(apiGet('/v1/admin/tenants')).resolves.toBeDefined()
  })

  it('shows the restoring state until the refresh settles', async () => {
    await signIn('master', 'secret')
    reload()
    // The hint exists, so a reload starts in `restoring` rather than flashing the login page.
    const pending = restoreSession()
    expect(getSessionStatus()).toBe('restoring')
    await pending
    expect(getSessionStatus()).toBe('authenticated')
  })

  it('restores only once however many times it is asked', async () => {
    await signIn('master', 'secret')
    reload()

    await Promise.all([restoreSession(), restoreSession()])

    expect(backend.authCalls.filter((c) => c.path === '/v1/auth/refresh')).toHaveLength(1)
  })

  it('does not touch the network for a visitor who never signed in', async () => {
    await restoreSession()

    expect(getSessionStatus()).toBe('anonymous')
    expect(backend.authCalls).toHaveLength(0)
  })

  it('goes anonymous and forgets the hint when the refresh cookie is gone', async () => {
    await signIn('master', 'secret')
    reload()
    backend.dropRefreshCookie()

    await restoreSession()

    expect(getSession()).toBeNull()
    expect(getSessionStatus()).toBe('anonymous')
    expect(localStorage.getItem(HINT)).toBeNull()
  })

  it('keeps the hint when the API is merely unreachable, so the next load tries again', async () => {
    await signIn('master', 'secret')
    reload()
    backend.failNext('POST', '/v1/auth/refresh', 503)

    await restoreSession()

    expect(getSession()).toBeNull()
    expect(localStorage.getItem(HINT)).toBe('1')
  })

  it('survives repeated reloads, rotating the cookie each time', async () => {
    await signIn('master', 'secret')
    for (let i = 0; i < 3; i++) {
      reload()
      await restoreSession()
      expect(getSession()?.username).toBe('master')
    }
  })

  it('stops a replayed (already rotated) refresh cookie from restoring anything', async () => {
    await signIn('master', 'secret')
    const stale = backend.refreshCookie
    reload()
    await restoreSession()
    expect(getSession()).not.toBeNull()

    reload()
    backend.setRefreshCookie(stale)
    await restoreSession()

    expect(getSession()).toBeNull()
  })
})

describe('when the session ends underneath the app', () => {
  it('signs out with a notice when the refresh token is refused', async () => {
    await signIn('master', 'secret')
    backend.expireAccessTokens()
    backend.dropRefreshCookie()

    await expect(apiGet('/v1/admin/institutions')).rejects.toThrow('Your session has expired')

    expect(getSession()).toBeNull()
    expect(getSessionStatus()).toBe('anonymous')
    expect(getSessionNotice()).toBe(SESSION_EXPIRED_NOTICE)
    expect(localStorage.getItem(HINT)).toBeNull()
  })

  it('refreshes silently when only the access token expired', async () => {
    await signIn('master', 'secret')
    backend.expireAccessTokens()

    await expect(apiGet('/v1/admin/tenants')).resolves.toBeDefined()

    expect(getSession()).not.toBeNull()
  })

  it('follows another tab that signed out', async () => {
    await signIn('master', 'secret')

    localStorage.removeItem(HINT)
    window.dispatchEvent(new StorageEvent('storage', { key: HINT, oldValue: '1', newValue: null }))

    expect(getSession()).toBeNull()
    expect(getSessionStatus()).toBe('anonymous')
  })
})
