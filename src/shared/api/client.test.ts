import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiGet, authenticate, resetApiClient } from './client'

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
