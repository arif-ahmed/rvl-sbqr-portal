import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiGet, apiSend, authenticate, errorMessage, resetApiClient } from './client'

/** Minimal unsigned JWT — only the payload segment is decoded. */
const jwt = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`

const adminToken = jwt({ sub: 'platform-admin', scope: ['admin'] })

function stubFetch(handler: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (url: string | URL, init?: RequestInit) => handler(String(url), init))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  resetApiClient()
})

describe('authenticate', () => {
  it('exchanges client credentials at /v1/oauth/token and returns decoded claims', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('/v1/oauth/token')
        ? Response.json({ accessToken: adminToken, tokenType: 'Bearer', expiresIn: 600 })
        : new Response(null, { status: 404 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const claims = await authenticate('platform-bootstrap', 'secret')

    expect(claims).toEqual({ sub: 'platform-admin', tenantId: null, scopes: ['admin'] })
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('/v1/oauth/token')
    expect(init?.method).toBe('POST')
    expect(new URLSearchParams(String(init?.body))).toEqual(
      new URLSearchParams({ grant_type: 'client_credentials', client_id: 'platform-bootstrap', client_secret: 'secret' }),
    )
  })

  it('collapses every 401 into one invalid-credentials message', async () => {
    vi.stubGlobal('fetch', stubFetch(() => Response.json({ error: 'invalid_client' }, { status: 401 })))
    await expect(authenticate('x', 'y')).rejects.toThrow('Invalid client ID or client secret.')
  })

  it('surfaces the token endpoint rate limit', async () => {
    vi.stubGlobal('fetch', stubFetch(() => new Response(null, { status: 429 })))
    await expect(authenticate('x', 'y')).rejects.toThrow('Too many sign-in attempts.')
  })

  it('wraps network failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))
    await expect(authenticate('x', 'y')).rejects.toThrow('Could not reach the sign-in service.')
  })
})

describe('token refresh', () => {
  it('re-mints from the held credentials 30s before expiry', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(() => Response.json({ accessToken: adminToken, tokenType: 'Bearer', expiresIn: 600 }))
    vi.stubGlobal('fetch', fetchMock)
    await authenticate('platform-bootstrap', 'secret')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(570_000 - 1)
    expect(fetchMock).toHaveBeenCalledTimes(1) // not yet
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2) // proactive re-mint fired
    const body = new URLSearchParams(String(fetchMock.mock.calls[1][1]?.body))
    expect(body.get('client_secret')).toBe('secret')
  })

  it('shares one token request across concurrent calls', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('/v1/oauth/token')
        ? Response.json({ accessToken: adminToken, tokenType: 'Bearer', expiresIn: 600 })
        : Response.json([{ ok: 1 }]),
    )
    vi.stubGlobal('fetch', fetchMock)
    await authenticate('platform-bootstrap', 'secret')

    await Promise.all([apiGet('/v1/a'), apiGet('/v1/b')])
    expect(fetchMock).toHaveBeenCalledTimes(3) // one mint + two GETs, no second mint
  })

  it('stops refreshing after reset', async () => {
    vi.useFakeTimers()
    const fetchMock = stubFetch(() => Response.json({ accessToken: adminToken, tokenType: 'Bearer', expiresIn: 600 }))
    vi.stubGlobal('fetch', fetchMock)
    await authenticate('platform-bootstrap', 'secret')
    resetApiClient()

    await vi.advanceTimersByTimeAsync(600_000)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('apiGet', () => {
  it('sends the bearer token and re-mints once on 401', async () => {
    const tokens = [jwt({ sub: 'a', scope: ['admin'] }), jwt({ sub: 'b', scope: ['admin'] })]
    let tokenCalls = 0
    const seenAuth: (string | null)[] = []
    const fetchMock = stubFetch((url, init) => {
      if (url.endsWith('/v1/oauth/token')) {
        tokenCalls++
        return Response.json({ accessToken: tokens[tokenCalls - 1], tokenType: 'Bearer', expiresIn: 600 })
      }
      seenAuth.push(init?.headers ? (init.headers as Record<string, string>).Authorization : null)
      return seenAuth.length === 1 ? new Response(null, { status: 401 }) : Response.json({ fine: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    await authenticate('platform-bootstrap', 'secret')

    await expect(apiGet('/v1/things')).resolves.toEqual({ fine: true })
    expect(tokenCalls).toBe(2)
    expect(seenAuth[0]).not.toBe(seenAuth[1])
  })

  it('refuses calls before sign-in', async () => {
    await expect(apiGet('/v1/things')).rejects.toThrow('Not signed in.')
  })
})

describe('apiSend', () => {
  async function signedIn(handler: (url: string, init?: RequestInit) => Response) {
    const fetchMock = stubFetch((url, init) =>
      url.endsWith('/v1/oauth/token') ? Response.json({ accessToken: adminToken, tokenType: 'Bearer', expiresIn: 600 }) : handler(url, init),
    )
    vi.stubGlobal('fetch', fetchMock)
    await authenticate('platform-bootstrap', 'secret')
    return fetchMock
  }

  it('sends a JSON body with the bearer token and parses the response', async () => {
    const fetchMock = await signedIn(() => Response.json({ tenantId: 't1' }, { status: 201 }))
    await expect(apiSend('POST', '/v1/admin/tenants', { institutionName: 'X' })).resolves.toEqual({ tenantId: 't1' })
    const [, init] = fetchMock.mock.calls[1]
    expect(init?.method).toBe('POST')
    expect(init?.body).toBe(JSON.stringify({ institutionName: 'X' }))
    expect(init?.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('resolves to undefined on 204 and sends no body when none is given', async () => {
    const fetchMock = await signedIn(() => new Response(null, { status: 204 }))
    await expect(apiSend('DELETE', '/v1/admin/tenants/t1/signing-key')).resolves.toBeUndefined()
    const [, init] = fetchMock.mock.calls[1]
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

  it('re-mints once and retries a write on 401', async () => {
    let calls = 0
    await signedIn(() => (++calls === 1 ? new Response(null, { status: 401 }) : Response.json({ ok: true })))
    await expect(apiSend('PATCH', '/v1/admin/tenants/t1/configuration', { isQrGenerationAllowed: true })).resolves.toEqual({ ok: true })
    expect(calls).toBe(2)
  })
})
