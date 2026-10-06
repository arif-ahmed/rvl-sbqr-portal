import { useSyncExternalStore } from 'react'
import { authenticate, resetApiClient, type TokenClaims } from '../api/client'
import { queryClient } from '../api/query'

export type Role = 'admin' | 'fi'
export type Surface = 'staff' | 'fi'

export type Session = {
  userId: string
  name: string
  /** Shown under the name: "Platform Admin" or "Institution Portal". */
  title: string
  /** The institution's tenant id (an FI session only). The API scopes every FI request to it from the token. */
  tenantId?: string
  role: Role
  surface: Surface
}

// The session lives in memory only: never localStorage, never logged (AGENTS.md).
// A page refresh signs the user out until the API issues refresh tokens.
let session: Session | null = null
const listeners = new Set<() => void>()

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
export const getSession = () => session
export const useSession = () => useSyncExternalStore(subscribe, getSession)

function setSession(next: Session | null) {
  session = next
  listeners.forEach((l) => l())
}

export const homePath = (s: Session) => `/${s.surface}/overview`

/**
 * Map token claims to a session. `scope=admin` only exists on the platform
 * bootstrap client; tenant credentials carry `tenant_id` and QR scopes.
 * UI convenience only — the API scopes are the security boundary.
 */
function sessionFromClaims(c: TokenClaims): Session {
  if (c.scopes.includes('admin')) {
    return { userId: c.sub || 'staff', name: 'RVL Staff', title: 'Platform Admin', role: 'admin', surface: 'staff' }
  }
  if (c.tenantId) {
    return { userId: c.sub, name: c.sub, title: 'Institution Portal', role: 'fi', surface: 'fi', tenantId: c.tenantId }
  }
  throw new Error('This client credential cannot access either portal.')
}

/**
 * Sign-in has no per-user accounts (AGENTS.md): the "username" and "password" are a
 * client_id / client_secret pair exchanged at POST /v1/oauth/token. RVL staff sign in with the
 * platform bootstrap client; an institution signs in with the client it was provisioned.
 */
export async function signIn(clientId: string, clientSecret: string, surface: Surface): Promise<Session> {
  const claims = await authenticate(clientId, clientSecret)
  let next: Session
  try {
    next = sessionFromClaims(claims)
  } catch (e) {
    resetApiClient()
    throw e
  }
  if (next.surface !== surface) {
    resetApiClient()
    throw new Error(
      next.surface === 'staff'
        ? 'This client credential belongs to the RVL staff console. Switch to the RVL Staff tab and try again.'
        : 'This client credential belongs to an institution. Switch to the Institution tab and try again.',
    )
  }
  setSession(next)
  return next
}

export function signOut() {
  setSession(null)
  resetApiClient()
  queryClient.clear()
}
