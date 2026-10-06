import type { Session } from '../shared/auth/session'

/** The session an institution gets after signing in with its client credentials. */
export const fiSession = (tenantId = 'inst-1', clientId = 'shapla-ops'): Session => ({
  userId: clientId,
  name: clientId,
  title: 'Institution Portal',
  role: 'fi',
  surface: 'fi',
  tenantId,
})
