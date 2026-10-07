// Same-origin API seam (dev: Vite proxy, prod: vercel.json rewrites — see
// vite.config.ts). Users sign in with a username and password at POST /v1/auth/login.
// The API answers with a short-lived access token in the body and a rotating refresh
// token in an HttpOnly cookie (Path=/v1/auth) that JavaScript never sees.
//
// The access token lives in memory only (AGENTS.md). A reload starts with no token, so the
// session restores itself with POST /v1/auth/refresh (the cookie rides along). Tokens are
// refreshed ahead of expiry by a timer, on tab focus / reconnect, and as a safety net on a 401.
//
// Refresh tokens are one-time-use with reuse detection and no grace period: two refreshes
// racing with the same cookie would revoke the whole session. They are therefore serialized,
// in this tab by a single in-flight promise and across tabs by a Web Lock.

/** Refresh this long before the access token expires. The API issues 900s tokens. */
const REFRESH_AHEAD_MS = 60_000
/** Retry delay after a background refresh fails for a reason other than "signed out". */
const REFRESH_RETRY_MS = 15_000

/** Who the API says is signed in (login and refresh both return it). */
export type AuthUser = {
  id: string
  username: string
  displayName: string
  /** Backend role, e.g. MASTER_ADMIN. */
  role: string
  /** The API does not enforce this; the portal sends the user to change their password first. */
  mustChangePassword: boolean
}

type TokenCache = { token: string; expEpochMs: number }

/** The refresh token is gone, expired or revoked: the user has to sign in again. */
export class SessionExpiredError extends Error {
  constructor() {
    super('Your session has expired. Please sign in again.')
    this.name = 'SessionExpiredError'
  }
}

let cached: TokenCache | null = null
let refreshInFlight: Promise<AuthUser> | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let active = false
let onSessionExpired: (() => void) | null = null

/** The session layer registers how to drop the signed-in state when the refresh token is rejected. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

type AuthPayload = { accessToken: string; expiresIn: number; user: AuthUser }

function parseAuthPayload(json: unknown): AuthPayload {
  const j = (json ?? {}) as Partial<AuthPayload> & { user?: Partial<AuthUser> }
  const u = j.user
  if (
    typeof j.accessToken !== 'string' ||
    !j.accessToken ||
    typeof j.expiresIn !== 'number' ||
    !u ||
    typeof u.id !== 'string' ||
    typeof u.username !== 'string' ||
    typeof u.role !== 'string'
  ) {
    throw new Error('Sign-in failed: unexpected response.')
  }
  return {
    accessToken: j.accessToken,
    expiresIn: j.expiresIn,
    user: {
      id: u.id,
      username: u.username,
      displayName: typeof u.displayName === 'string' && u.displayName ? u.displayName : u.username,
      role: u.role,
      mustChangePassword: u.mustChangePassword === true,
    },
  }
}

function adopt({ accessToken, expiresIn }: AuthPayload) {
  cached = { token: accessToken, expEpochMs: Date.now() + expiresIn * 1000 }
  active = true
  scheduleRefresh(expiresIn * 1000)
}

function currentToken(): string | null {
  return cached && Date.now() < cached.expEpochMs - REFRESH_AHEAD_MS ? cached.token : null
}

/** Fire shortly before expiry; never tighter than half the lifetime so a short token cannot spin. */
function scheduleRefresh(lifetimeMs: number, delayMs = Math.max(lifetimeMs - REFRESH_AHEAD_MS, lifetimeMs / 2)) {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    refreshOrExpire().catch(() => {
      // Transient failure (offline, 5xx): keep the session and try again while the token may still be valid.
      if (active) scheduleRefresh(0, REFRESH_RETRY_MS)
    })
  }, delayMs)
}

async function postJson(path: string, body: unknown, token?: string): Promise<Response> {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
}

/**
 * Exchange a username and password for a session. The refresh cookie is set by the API;
 * the access token is adopted here. Throws a user-presentable message on failure.
 */
export async function loginRequest(username: string, password: string): Promise<AuthUser> {
  let res: Response
  try {
    res = await postJson('/v1/auth/login', { username: username.trim(), password })
  } catch {
    throw new Error('Could not reach the sign-in service.')
  }
  // Unknown user, wrong password, disabled and locked accounts are indistinguishable on purpose.
  // Validation failures also come back as 401 (invalid_request).
  if (res.status === 401) throw new Error('Invalid username or password.')
  if (res.status === 429) throw new Error('Too many sign-in attempts. Please wait a moment and try again.')
  if (!res.ok) throw new Error(`Sign-in failed (${res.status}).`)
  const payload = parseAuthPayload(await res.json().catch(() => null))
  adopt(payload)
  return payload.user
}

async function doRefresh(): Promise<AuthUser> {
  let res: Response
  try {
    res = await postJson('/v1/auth/refresh', {})
  } catch {
    throw new Error('Could not reach the sign-in service.')
  }
  if (res.status === 401) throw new SessionExpiredError()
  if (!res.ok) throw new Error(`Session refresh failed (${res.status}).`)
  const payload = parseAuthPayload(await res.json().catch(() => null))
  adopt(payload)
  return payload.user
}

/** Run `fn` while holding the cross-tab refresh lock (plain call where Web Locks is unavailable). */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('sbqr-refresh', fn) : fn()
}

/**
 * Trade the refresh cookie for a new access token and the signed-in user. Single-flight:
 * parallel callers share one request. Rejects with SessionExpiredError when the cookie is
 * missing, expired or revoked.
 */
export function refreshSession(): Promise<AuthUser> {
  refreshInFlight ??= withRefreshLock(doRefresh).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

/** Refresh, and when the API rejects the refresh token drop the session (once) before rethrowing. */
async function refreshOrExpire(): Promise<AuthUser> {
  try {
    return await refreshSession()
  } catch (e) {
    if (e instanceof SessionExpiredError) expireSession()
    throw e
  }
}

function expireSession() {
  const wasActive = active
  resetApiClient()
  if (wasActive) onSessionExpired?.()
}

async function bearer(): Promise<string> {
  const token = currentToken()
  if (token) return token
  await refreshOrExpire()
  if (!cached) throw new SessionExpiredError()
  return cached.token
}

// Background tabs throttle timers and laptops sleep past them: when the tab is visible or the
// network returns, top the token up straight away instead of waiting for the next API call.
function topUpIfNeeded() {
  if (active && !currentToken()) refreshOrExpire().catch(() => {})
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') topUpIfNeeded()
  })
  window.addEventListener('online', topUpIfNeeded)
}

/** Best-effort server-side sign-out: revokes the refresh family and clears the cookie. Never throws. */
export async function logoutRequest(): Promise<void> {
  try {
    const token = currentToken() ?? (await refreshSession().then(() => cached?.token))
    if (token) await postJson('/v1/auth/logout', {}, token)
  } catch {
    // Already signed out, offline or revoked: nothing left to undo server-side.
  }
}

/**
 * Change the signed-in user's password. The API revokes every session on success (204), so the
 * caller must sign out locally afterwards. A 401 here means a wrong current password, never an
 * expired token — this call deliberately bypasses the refresh-and-retry path.
 */
export async function changePasswordRequest(currentPassword: string, newPassword: string): Promise<void> {
  const token = await bearer()
  let res: Response
  try {
    res = await postJson('/v1/auth/change-password', { currentPassword, newPassword }, token)
  } catch {
    throw new Error('Could not reach the service.')
  }
  if (res.ok) return
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null
  if (res.status === 401) throw new Error('Current password is incorrect.')
  if (res.status === 403) throw new Error('This account is disabled.')
  if (res.status === 429) throw new Error('Too many attempts. Please wait a moment and try again.')
  throw new Error(typeof body?.error === 'string' && body.error !== 'invalid_request' ? body.error : 'The new password was rejected. Choose a different one.')
}

/** A reason the API refuses to continue, such as an activation precondition. */
export type Blocker = { code: string; message: string }

/**
 * A non-2xx API response. `title` and `detail` come from the problem-details body when there is
 * one; `blockers` is the optional list of unmet preconditions (e.g. why activation was refused).
 * The message stays "<METHOD> <path> failed: <status>" — use `errorMessage` for UI text.
 */
export class ApiError extends Error {
  readonly status: number
  readonly title: string | null
  readonly detail: string | null
  /** The problem body's `code` extension, e.g. USAGE_NOT_COMPLETE on a 409 (null when absent). */
  readonly code: string | null
  readonly blockers: Blocker[]

  constructor(method: string, path: string, status: number, problem: unknown) {
    super(`${method} ${path} failed: ${status}`)
    this.name = 'ApiError'
    this.status = status
    const body = problem && typeof problem === 'object' ? (problem as Record<string, unknown>) : {}
    this.title = typeof body.title === 'string' ? body.title : null
    this.detail = typeof body.detail === 'string' ? body.detail : null
    this.code = typeof body.code === 'string' ? body.code : null
    this.blockers = Array.isArray(body.blockers)
      ? body.blockers.filter((b): b is Blocker => !!b && typeof (b as Blocker).code === 'string' && typeof (b as Blocker).message === 'string')
      : []
  }
}

/** UI text for a failed request: the server's explanation when it gave one. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof ApiError) return error.detail ?? error.title ?? fallback
  return error instanceof Error && error.message ? error.message : fallback
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/**
 * Authed request. A 401 means the access token was rejected: refresh once (reusing a token another
 * caller already refreshed) and retry. If the refresh token is rejected too, the session ends.
 * Bodies are JSON.
 */
async function send(method: Method, path: string, body?: unknown): Promise<Response> {
  const attempt = (token: string) =>
    fetch(path, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  const used = await bearer()
  let res = await attempt(used)
  if (res.status === 401) {
    const already = cached && cached.token !== used && Date.now() < cached.expEpochMs ? cached.token : null
    res = await attempt(already ?? (await refreshOrExpire().then(() => bearer())))
  }
  if (!res.ok) throw new ApiError(method, path, res.status, await res.json().catch(() => null))
  return res
}

/** JSON in, JSON out; 204 resolves to undefined. */
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const res = await send(method, path, body)
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

/** Authed GET. */
export const apiGet = <T>(path: string): Promise<T> => request<T>('GET', path)

/** Authed GET of a text body (the CSV exports). */
export const apiGetText = async (path: string): Promise<string> => (await send('GET', path)).text()

/** Authed POST / PUT / PATCH / DELETE with an optional JSON body. */
export const apiSend = <T = void>(method: Exclude<Method, 'GET'>, path: string, body?: unknown): Promise<T> => request<T>(method, path, body)

/** Drop the access token and any pending refresh — called on sign-out, session expiry and in tests. */
export function resetApiClient() {
  cached = null
  active = false
  refreshInFlight = null
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
}
