// Same-origin API seam (dev: Vite proxy, prod: vercel.json rewrites — see
// vite.config.ts). Sign-in exchanges client credentials for a bearer token at
// POST /v1/oauth/token (OAuth 2.1 client-credentials grant, RFC 6749 §4.4).
// The credentials and the token live in memory only (AGENTS.md): a page
// refresh signs the user out. There is no refresh token, so "refreshing"
// means re-running the grant with the held credentials — scheduled 30s
// before expiry so background-throttled tabs still find a valid token, with
// a lazy re-mint and one retry on 401 as the safety net.

/** Re-mint this long before the server-side expiry. The API issues 600s tokens. */
const REFRESH_AHEAD_MS = 30_000

type Credentials = { clientId: string; clientSecret: string }
type TokenCache = { token: string; expEpochMs: number }

/** Claims the API stamps on its JWTs (sub / tenant_id / scope). */
export type TokenClaims = {
  sub: string
  tenantId: string | null
  scopes: string[]
}

let credentials: Credentials | null = null
let cached: TokenCache | null = null
let mintInFlight: Promise<string> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Decode the JWT payload without verifying the signature — the mapping to a
 * portal surface is UI convenience only; the API validates the token on
 * every call (AGENTS.md: scopes are the security boundary).
 */
function decodeClaims(token: string): TokenClaims {
  try {
    const payload = JSON.parse(atob((token.split('.')[1] ?? '').replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: unknown
      tenant_id?: unknown
      scope?: unknown
    }
    return {
      sub: typeof payload.sub === 'string' ? payload.sub : '',
      tenantId: typeof payload.tenant_id === 'string' ? payload.tenant_id : null,
      scopes: Array.isArray(payload.scope)
        ? payload.scope.filter((s): s is string => typeof s === 'string')
        : typeof payload.scope === 'string'
          ? payload.scope.split(' ')
          : [],
    }
  } catch {
    throw new Error('Sign-in failed: unexpected token from the API.')
  }
}

async function requestToken(creds: Credentials): Promise<{ token: string; expiresIn: number }> {
  // RFC 6749 §2.3.1 form encoding; the API also accepts JSON.
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
  })
  let res: Response
  try {
    res = await fetch('/v1/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
  } catch {
    throw new Error('Could not reach the sign-in service.')
  }
  // RFC 6749 §5.2: 401 invalid_client covers unknown id, wrong secret and
  // suspended tenants — one message for all three.
  if (res.status === 401) throw new Error('Invalid client ID or client secret.')
  if (res.status === 429) throw new Error('Too many sign-in attempts. Please wait a moment and try again.')
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`)
  const json = (await res.json()) as { accessToken?: string; expiresIn?: number }
  if (!json.accessToken || typeof json.expiresIn !== 'number') throw new Error('Sign-in failed: unexpected response.')
  return { token: json.accessToken, expiresIn: json.expiresIn }
}

/** Single-flight mint: parallel callers share one token request. */
function mint(): Promise<string> {
  if (!credentials) return Promise.reject(new Error('Not signed in.'))
  mintInFlight ??= requestToken(credentials)
    .then(({ token, expiresIn }) => {
      cached = { token, expEpochMs: Date.now() + expiresIn * 1000 }
      scheduleRefresh(expiresIn)
      return token
    })
    .finally(() => {
      mintInFlight = null
    })
  return mintInFlight
}

function scheduleRefresh(expiresIn: number) {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    // A failed background refresh keeps the old token; the next API call
    // re-mints lazily (and surfaces the error if the credential was revoked).
    mint().catch(() => {})
  }, Math.max(0, expiresIn * 1000 - REFRESH_AHEAD_MS))
}

function currentToken(): string | null {
  return cached && Date.now() < cached.expEpochMs - REFRESH_AHEAD_MS ? cached.token : null
}

async function bearer(): Promise<string> {
  return currentToken() ?? mint()
}

/**
 * Exchange client credentials for a token and adopt them as the session's
 * API credentials. Returns the decoded claims so sign-in can route to the
 * right surface; throws a user-presentable message on failure.
 */
export async function authenticate(clientId: string, clientSecret: string): Promise<TokenClaims> {
  const creds = { clientId: clientId.trim(), clientSecret }
  const { token, expiresIn } = await requestToken(creds)
  credentials = creds
  cached = { token, expEpochMs: Date.now() + expiresIn * 1000 }
  scheduleRefresh(expiresIn)
  return decodeClaims(token)
}

/** Authed GET. Re-mints once and retries on 401 (expired token). */
export async function apiGet<T>(path: string): Promise<T> {
  const attempt = (token: string) => fetch(path, { headers: { Authorization: `Bearer ${token}` } })
  let res = await attempt(await bearer())
  if (res.status === 401) {
    cached = null
    res = await attempt(await mint())
  }
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}

/** Drop credentials, token and any pending refresh — called on sign-out and in tests. */
export function resetApiClient() {
  credentials = null
  cached = null
  mintInFlight = null
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}
