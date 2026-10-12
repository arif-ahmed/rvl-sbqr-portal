import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ApiError,
  apiGet,
  apiSend,
  changePasswordRequest,
  errorMessage,
  loginRequest,
  logoutRequest,
  refreshSession,
  resetApiClient,
  SessionExpiredError,
  setSessionExpiredHandler,
} from './client'

const user = { id: 'u1', username: 'master', displayName: 'Master Admin', role: 'MASTER_ADMIN', mustChangePassword: false }
const authBody = (n: number, expiresIn = 900) => ({
  accessToken: `access-${n}`,
  tokenType: 'Bearer',
  expiresIn,
  refreshTokenExpiresAt: '2026-10-14T00:00:00Z',
  user,
})

type Call = { url: string; init?: RequestInit }

/**
 * Stub the API: `auth` answers /v1/auth/* (default: every login and refresh succeeds with the next
 * access-N token), `data` answers everything else. Returns the calls, in order.
 */
function stubApi(opts: { auth?: (url: string, n: number) => Response | undefined; data?: (url: string, init: RequestInit | undefined, n: number) => Response } = {}) {
  const calls: Call[] = []
  let tokens = 0
  let dataCalls = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init })
      if (u.startsWith('/v1/auth/')) {
        if (opts.auth) return opts.auth(u, tokens + 1) ?? Response.json(authBody(++tokens))
        return Response.json(authBody(++tokens))
      }
      return opts.data ? opts.data(u, init, ++dataCalls) : Response.json({ fine: true })
    }),
  )
  return calls
}

const authHeader = (c: Call) => (c.init?.headers as Record<string, string> | undefined)?.Authorization
const authCalls = (calls: Call[], path: string) => calls.filter((c) => c.url === path)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  setSessionExpiredHandler(null)
  resetApiClient()
})

describe('loginRequest', () => {
  it('posts the credentials as JSON, returns the user and uses the access token from then on', async () => {
    const calls = stubApi()

    await expect(loginRequest('  master ', 'pw')).resolves.toEqual(user)

    expect(calls[0].url).toBe('/v1/auth/login')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ username: 'master', password: 'pw' })
    await apiGet('/v1/things')
    expect(authHeader(calls[1])).toBe('Bearer access-1')
  })

  it('falls back to the username when the API sends no display name', async () => {
    stubApi({ auth: () => Response.json({ ...authBody(1), user: { ...user, displayName: '' } }) })
    await expect(loginRequest('master', 'pw')).resolves.toMatchObject({ displayName: 'master' })
  })

  it('reports a wrong password in one message', async () => {
    stubApi({ auth: () => Response.json({ error: 'invalid_credentials' }, { status: 401 }) })
    await expect(loginRequest('master', 'nope')).rejects.toThrow('Invalid username or password.')
  })

  it('reports rate limiting', async () => {
    stubApi({ auth: () => new Response(null, { status: 429 }) })
    await expect(loginRequest('master', 'pw')).rejects.toThrow('Too many sign-in attempts.')
  })

  it('reports an unreachable API', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))))
    await expect(loginRequest('master', 'pw')).rejects.toThrow('Could not reach the sign-in service.')
  })

  it('rejects an unexpected response body', async () => {
    stubApi({ auth: () => Response.json({ hello: 'world' }) })
    await expect(loginRequest('master', 'pw')).rejects.toThrow('unexpected response')
  })
})

describe('refreshSession', () => {
  it('posts an empty body (the refresh token is in the cookie) and returns the user', async () => {
    const calls = stubApi()

    await expect(refreshSession()).resolves.toEqual(user)

    expect(calls[0].url).toBe('/v1/auth/refresh')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({})
  })

  it('shares one request between parallel callers', async () => {
    const calls = stubApi()
    await Promise.all([refreshSession(), refreshSession(), refreshSession()])
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
  })

  it('rejects with SessionExpiredError when the API refuses the cookie', async () => {
    stubApi({ auth: () => Response.json({ error: 'invalid_refresh_token' }, { status: 401 }) })
    await expect(refreshSession()).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('does not call a server error a sign-out', async () => {
    stubApi({ auth: () => new Response(null, { status: 503 }) })
    const error = await refreshSession().catch((e) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SessionExpiredError)
  })
})

describe('re-authenticating before the token expires', () => {
  it('refreshes one minute before expiry and uses the new token', async () => {
    vi.useFakeTimers()
    const calls = stubApi()
    await loginRequest('master', 'pw')

    await vi.advanceTimersByTimeAsync(839_000)
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(1_000)
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
    await apiGet('/v1/things')
    expect(authHeader(calls[calls.length - 1])).toBe('Bearer access-2')
  })

  it('keeps refreshing: each new token schedules the next refresh', async () => {
    vi.useFakeTimers()
    const calls = stubApi()
    await loginRequest('master', 'pw')

    await vi.advanceTimersByTimeAsync(3 * 840_000)

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(3)
  })

  it('never schedules tighter than half the lifetime for a very short token', async () => {
    vi.useFakeTimers()
    const calls = stubApi({ auth: (_u, n) => Response.json(authBody(n, 30)) })
    await loginRequest('master', 'pw')

    await vi.advanceTimersByTimeAsync(14_000)
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
  })

  it('retries a background refresh that failed for a transient reason, and keeps the session', async () => {
    vi.useFakeTimers()
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    let refreshes = 0
    const calls = stubApi({ auth: (u) => (u === '/v1/auth/refresh' && ++refreshes === 1 ? new Response(null, { status: 503 }) : undefined) })
    await loginRequest('master', 'pw')

    await vi.advanceTimersByTimeAsync(840_000)
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(15_000)

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(2)
    expect(expired).not.toHaveBeenCalled()
  })

  it('ends the session when the background refresh is refused', async () => {
    vi.useFakeTimers()
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    stubApi({ auth: (u) => (u === '/v1/auth/refresh' ? Response.json({ error: 'invalid_refresh_token' }, { status: 401 }) : undefined) })
    await loginRequest('master', 'pw')

    await vi.advanceTimersByTimeAsync(840_000)

    expect(expired).toHaveBeenCalledTimes(1)
  })

  it('tops the token up as soon as the tab is visible again, if the timer was throttled past the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const calls = stubApi()
    await loginRequest('master', 'pw')
    vi.setSystemTime(Date.now() + 850_000)

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.waitFor(() => expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1))
  })

  it('does not refresh on focus while the token is still comfortably valid', async () => {
    const calls = stubApi()
    await loginRequest('master', 'pw')

    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('online'))

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(0)
  })

  it('refreshes before sending when the token is already inside the window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const calls = stubApi()
    await loginRequest('master', 'pw')
    vi.setSystemTime(Date.now() + 850_000)

    await apiGet('/v1/things')

    expect(calls.map((c) => c.url)).toEqual(['/v1/auth/login', '/v1/auth/refresh', '/v1/things'])
    expect(authHeader(calls[2])).toBe('Bearer access-2')
  })
})

describe('a 401 from the API', () => {
  it('refreshes once and retries with the new token', async () => {
    const calls = stubApi({ data: (_u, _i, n) => (n === 1 ? new Response(null, { status: 401 }) : Response.json({ fine: true })) })
    await loginRequest('master', 'pw')

    await expect(apiGet('/v1/things')).resolves.toEqual({ fine: true })

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
    expect(authHeader(calls[calls.length - 1])).toBe('Bearer access-2')
  })

  it('lets parallel requests that all got a 401 share one refresh', async () => {
    const calls = stubApi({ data: (_u, init) => (authHeader({ url: '', init }) === 'Bearer access-1' ? new Response(null, { status: 401 }) : Response.json({ fine: true })) })
    await loginRequest('master', 'pw')

    await Promise.all([apiGet('/v1/a'), apiGet('/v1/b'), apiGet('/v1/c')])

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
  })

  it('ends the session once when the refresh token is refused too', async () => {
    const expired = vi.fn()
    setSessionExpiredHandler(expired)
    const calls = stubApi({
      auth: (u) => (u === '/v1/auth/refresh' ? Response.json({ error: 'invalid_refresh_token' }, { status: 401 }) : undefined),
      data: () => new Response(null, { status: 401 }),
    })
    await loginRequest('master', 'pw')

    await expect(apiGet('/v1/things')).rejects.toBeInstanceOf(SessionExpiredError)

    expect(expired).toHaveBeenCalledTimes(1)
    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(1)
    await expect(apiGet('/v1/things')).rejects.toBeInstanceOf(SessionExpiredError)
  })

  it('does not treat a 403 as a reason to refresh', async () => {
    const calls = stubApi({ data: () => new Response(null, { status: 403 }) })
    await loginRequest('master', 'pw')

    await expect(apiGet('/v1/things')).rejects.toMatchObject({ status: 403 })

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(0)
  })
})

describe('changePasswordRequest', () => {
  it('sends both passwords with the bearer token', async () => {
    const calls = stubApi({ auth: (u) => (u === '/v1/auth/change-password' ? new Response(null, { status: 204 }) : undefined) })
    await loginRequest('master', 'pw')

    await changePasswordRequest('pw', 'new-password')

    const call = calls[calls.length - 1]
    expect(call.url).toBe('/v1/auth/change-password')
    expect(authHeader(call)).toBe('Bearer access-1')
    expect(JSON.parse(String(call.init?.body))).toEqual({ currentPassword: 'pw', newPassword: 'new-password' })
  })

  it('reports a wrong current password without trying to refresh', async () => {
    const calls = stubApi({ auth: (u) => (u === '/v1/auth/change-password' ? Response.json({ error: 'invalid_credentials' }, { status: 401 }) : undefined) })
    await loginRequest('master', 'pw')

    await expect(changePasswordRequest('wrong', 'new-password')).rejects.toThrow('Current password is incorrect.')

    expect(authCalls(calls, '/v1/auth/refresh')).toHaveLength(0)
  })

  it('shows the API’s reason for rejecting the new password', async () => {
    stubApi({ auth: (u) => (u === '/v1/auth/change-password' ? Response.json({ error: 'New password must differ.' }, { status: 400 }) : undefined) })
    await loginRequest('master', 'pw')
    await expect(changePasswordRequest('pw', 'pw')).rejects.toThrow('New password must differ.')
  })
})

describe('logoutRequest', () => {
  it('asks the API to revoke the session with the bearer token', async () => {
    const calls = stubApi({ auth: (u) => (u === '/v1/auth/logout' ? new Response(null, { status: 204 }) : undefined) })
    await loginRequest('master', 'pw')

    await logoutRequest()

    const call = calls[calls.length - 1]
    expect(call.url).toBe('/v1/auth/logout')
    expect(authHeader(call)).toBe('Bearer access-1')
  })

  it('never throws, even when the API is unreachable', async () => {
    stubApi()
    await loginRequest('master', 'pw')
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))
    await expect(logoutRequest()).resolves.toBeUndefined()
  })
})

describe('apiSend', () => {
  async function signedIn(data: (url: string, init?: RequestInit) => Response) {
    const calls = stubApi({ data })
    await loginRequest('master', 'pw')
    return calls
  }

  it('sends a JSON body with the bearer token and parses the response', async () => {
    const calls = await signedIn(() => Response.json({ tenantId: 't1' }, { status: 201 }))
    await expect(apiSend('POST', '/v1/admin/tenants', { institutionName: 'X' })).resolves.toEqual({ tenantId: 't1' })
    const { init } = calls[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ institutionName: 'X' }))
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json', Authorization: 'Bearer access-1' })
  })

  it('resolves to undefined on 204 and sends no body when none is given', async () => {
    const calls = await signedIn(() => new Response(null, { status: 204 }))
    await expect(apiSend('DELETE', '/v1/admin/tenants/t1/signing-key')).resolves.toBeUndefined()
    const { init } = calls[1]
    expect(init?.body).toBeUndefined()
    expect(init?.headers).not.toHaveProperty('Content-Type')
  })

  it('throws an ApiError carrying the problem details and blockers', async () => {
    await signedIn(() =>
      Response.json(
        { title: 'Invariant violation', detail: 'Tenant cannot be activated.', blockers: [{ code: 'CREDENTIAL_MISSING', message: 'No active API credential.' }, { bad: true }] },
        { status: 409 },
      ),
    )
    const error = await apiSend('POST', '/v1/admin/tenants/t1/activate').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 409, title: 'Invariant violation', detail: 'Tenant cannot be activated.', message: 'POST /v1/admin/tenants/t1/activate failed: 409' })
    expect(error.blockers).toEqual([{ code: 'CREDENTIAL_MISSING', message: 'No active API credential.' }])
    expect(errorMessage(error)).toBe('Tenant cannot be activated.')
  })

  it('copes with an error body that is not JSON', async () => {
    await signedIn(() => new Response('upstream down', { status: 502 }))
    const error = await apiGet('/v1/things').catch((e) => e)
    expect(error).toMatchObject({ status: 502, title: null, detail: null, blockers: [] })
    expect(errorMessage(error, 'fallback')).toBe('fallback')
  })

  it('refreshes once and retries a write on 401', async () => {
    let calls = 0
    await signedIn(() => (++calls === 1 ? new Response(null, { status: 401 }) : Response.json({ ok: true })))
    await expect(apiSend('PATCH', '/v1/admin/tenants/t1/configuration', { isQrGenerationAllowed: true })).resolves.toEqual({ ok: true })
    expect(calls).toBe(2)
  })
})
