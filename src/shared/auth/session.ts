import { useSyncExternalStore } from 'react'

export type Role = 'admin' | 'finance' | 'fi'
export type Surface = 'staff' | 'fi'

export type Session = {
  userId: string
  name: string
  /** Shown under the name: "Finance", "Platform Admin", or the institution name. */
  title: string
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
 * Per-user sign-in does not exist in the API yet (only client credentials).
 * Until it does, sign-in works only with VITE_MOCK_AUTH=true (see .env.example),
 * which the production build leaves off. Replace the body with the real call then.
 */
export async function signIn(userId: string, password: string, surface: Surface): Promise<Session> {
  if (import.meta.env.VITE_MOCK_AUTH === 'true') {
    const { mockSignIn } = await import('./mock')
    const next = await mockSignIn(userId, password, surface)
    setSession(next)
    return next
  }
  throw new Error('Sign-in is not available yet. The API has no user login.')
}

export function signOut() {
  setSession(null)
}
