import { afterEach, describe, expect, it, vi } from 'vitest'
import { resetApiClient } from '../api/client'
import { getSession, signIn, signOut } from './session'

const jwt = (payload: object) => `h.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.s`

const adminToken = jwt({ sub: 'platform-admin', scope: ['admin'] })
const tenantToken = jwt({ sub: 'client:shapla-api', tenant_id: '0f1e2d3c-1111-2222-3333-444455556666', scope: ['qr:generate', 'qr:validate'] })

function stubToken(token: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ accessToken: token, tokenType: 'Bearer', expiresIn: 600 })),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetApiClient()
  signOut()
})

describe('real sign-in (client credentials)', () => {
  it('routes an admin-scoped token to the staff console', async () => {
    stubToken(adminToken)

    const session = await signIn('platform-bootstrap', 'secret', 'staff')

    expect(session).toMatchObject({ role: 'admin', surface: 'staff', title: 'Platform Admin' })
    expect(getSession()).toBe(session)
  })

  it('routes a tenant token to the institution portal', async () => {
    stubToken(tenantToken)

    const session = await signIn('shapla-api', 'secret', 'fi')

    expect(session).toMatchObject({ role: 'fi', surface: 'fi', userId: 'client:shapla-api', tenantId: '0f1e2d3c-1111-2222-3333-444455556666' })
  })

  it('rejects a credential minted for the other portal and drops it', async () => {
    stubToken(adminToken)

    await expect(signIn('platform-bootstrap', 'secret', 'fi')).rejects.toThrow('RVL staff console')
    expect(getSession()).toBeNull()
  })

  it('rejects a token with no portal identity', async () => {
    stubToken(jwt({ sub: 'nobody', scope: [] }))

    await expect(signIn('odd-client', 'secret', 'fi')).rejects.toThrow('cannot access either portal')
  })
})

describe('sign-out', () => {
  it('clears the session and the held credentials', async () => {
    stubToken(adminToken)
    const session = await signIn('platform-bootstrap', 'secret', 'staff')
    expect(session.surface).toBe('staff')

    signOut()

    expect(getSession()).toBeNull()
    await expect(import('../api/client').then((m) => m.apiGet('/v1/x'))).rejects.toThrow('Not signed in.')
  })
})
