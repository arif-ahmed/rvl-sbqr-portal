import { useSyncExternalStore } from 'react'
import { loginRequest, logoutRequest, refreshSession, resetApiClient, setSessionExpiredHandler, SessionExpiredError, type AuthUser } from '../api/client'
import { queryClient } from '../api/query'

/** Backend user roles (the API's `role` claim). */
export type Role = 'MASTER_ADMIN' | 'OPS' | 'AUDITOR' | 'SUPPORT' | 'FINANCE' | 'FSP_OPERATOR' | 'FSP_VIEWER'
export type Surface = 'staff' | 'fi'

export type Session = {
  /** The API's user id (a GUID). */
  userId: string
  username: string
  /** Display name, shown in the account menu. */
  name: string
  /** Shown under the name, e.g. "Platform Admin". */
  title: string
  /** The institution's tenant id (an FI session only). The API scopes every FI request to it from the token. */
  tenantId?: string
  role: Role
  surface: Surface
  /** Set for an account that must pick a new password before doing anything else. The API does not enforce it. */
  mustChangePassword: boolean
}

/** `restoring` while a reload is trading the refresh cookie for a session; the app waits before routing. */
export type SessionStatus = 'restoring' | 'anonymous' | 'authenticated'

export const SESSION_EXPIRED_NOTICE = 'Your session expired. Please sign in again.'
export const PASSWORD_CHANGED_NOTICE = 'Password changed. Sign in again with your new password.'

/**
 * Persistence across reloads (AGENTS.md): the access token and the Session object live in memory
 * only. After a reload the HttpOnly refresh cookie (invisible to JavaScript) restores the session.
 * The only thing written to localStorage is this non-secret flag meaning "a session probably
 * exists", which saves a pointless refresh call for visitors who never signed in and lets other
 * tabs notice a sign-out.
 */
const HINT_KEY = 'sbqr-session'

function hasHint(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === '1'
  } catch {
    return false
  }
}

function setHint(on: boolean) {
  try {
    if (on) localStorage.setItem(HINT_KEY, '1')
    else localStorage.removeItem(HINT_KEY)
  } catch {
    // Storage blocked: the session just will not survive a reload.
  }
}

let session: Session | null = null
let status: SessionStatus = hasHint() ? 'restoring' : 'anonymous'
let notice: string | null = null
let restoring: Promise<void> | null = null
const listeners = new Set<() => void>()

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
export const getSession = () => session
export const getSessionStatus = () => status
export const useSession = () => useSyncExternalStore(subscribe, getSession)
export const useSessionStatus = () => useSyncExternalStore(subscribe, getSessionStatus)
/** A one-shot message for the login screen, e.g. why the user was signed out. */
export const getSessionNotice = () => notice
export const useSessionNotice = () => useSyncExternalStore(subscribe, getSessionNotice)

function setState(next: Session | null, nextStatus: SessionStatus, nextNotice: string | null = null) {
  session = next
  status = nextStatus
  notice = nextNotice
  listeners.forEach((l) => l())
}

export const clearSessionNotice = () => {
  if (notice === null) return
  notice = null
  listeners.forEach((l) => l())
}

export const homePath = (s: Session) => `/${s.surface}/overview`

/** Home for a session: a pending password change comes before everything else. */
export const landingPath = (s: Session) => (s.mustChangePassword ? '/change-password' : homePath(s))

const PLATFORM_TITLES: Partial<Record<string, string>> = {
  MASTER_ADMIN: 'Platform Admin',
  OPS: 'Operations',
  AUDITOR: 'Auditor',
  SUPPORT: 'Support',
  FINANCE: 'Finance',
}

/**
 * Map the API's user to a portal session. Platform roles use the staff console. Tenant roles
 * cannot sign in yet and the token carries no tenant id, so they are refused rather than guessed
 * at. UI convenience only: the API enforces what each role may call.
 */
function sessionFromUser(user: AuthUser): Session {
  const title = PLATFORM_TITLES[user.role]
  if (!title) throw new Error('This account cannot access the portal.')
  return {
    userId: user.id,
    username: user.username,
    name: user.displayName,
    title,
    role: user.role as Role,
    surface: 'staff',
    mustChangePassword: user.mustChangePassword,
  }
}

/** Drop the signed-in state in this tab only (the server side is already gone or handled by the caller). */
function clearLocal(nextNotice: string | null) {
  resetApiClient()
  queryClient.clear()
  setState(null, 'anonymous', nextNotice)
}

/** Sign in with a username and password. Rejects with a user-presentable message. */
export async function signIn(username: string, password: string): Promise<Session> {
  const user = await loginRequest(username, password)
  let next: Session
  try {
    next = sessionFromUser(user)
  } catch (e) {
    await logoutRequest()
    resetApiClient()
    throw e
  }
  setHint(true)
  setState(next, 'authenticated')
  return next
}

/**
 * Sign out: the screen flips immediately, the server revokes the session in the background.
 * Other tabs follow through the storage event on the hint.
 */
export function signOut(nextNotice: string | null = null): Promise<void> {
  const revoke = session ? logoutRequest() : Promise.resolve()
  setHint(false)
  queryClient.clear()
  setState(null, 'anonymous', nextNotice)
  return revoke.finally(resetApiClient)
}

/**
 * Called once at startup. When a session probably exists, trade the refresh cookie for a new
 * access token and the user; otherwise settle as anonymous without touching the network.
 */
export function restoreSession(): Promise<void> {
  restoring ??= (async () => {
    if (!hasHint()) {
      setState(null, 'anonymous')
      return
    }
    setState(null, 'restoring')
    let user: AuthUser
    try {
      user = await refreshSession()
    } catch (e) {
      resetApiClient()
      // Only a rejected cookie ends the session. Offline or an API outage keeps the hint so the next load retries.
      if (e instanceof SessionExpiredError) setHint(false)
      setState(null, 'anonymous')
      return
    }
    try {
      setState(sessionFromUser(user), 'authenticated')
    } catch {
      await logoutRequest()
      resetApiClient()
      setHint(false)
      setState(null, 'anonymous')
    }
  })()
  return restoring
}

// The refresh token was rejected while the app was running: the session is over.
setSessionExpiredHandler(() => {
  setHint(false)
  clearLocal(SESSION_EXPIRED_NOTICE)
})

// Another tab signed out (or its session expired): follow it without a second server call.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if ((e.key === HINT_KEY || e.key === null) && !hasHint() && session) clearLocal(null)
  })
}

/** Reset module state between tests. */
export function resetSessionForTests() {
  resetApiClient()
  restoring = null
  setHint(false)
  setState(null, 'anonymous')
}
