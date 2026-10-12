import type { Session } from '../shared/auth/session'

/** An institution user's session. The API cannot sign institution users in yet; the FI screens are tested against this. */
export const fiSession = (tenantId = 'inst-1', username = 'shapla-ops'): Session => ({
  userId: `id-${username}`,
  username,
  name: username,
  title: 'Institution Portal',
  role: 'FSP_OPERATOR',
  surface: 'fi',
  tenantId,
  mustChangePassword: false,
})
