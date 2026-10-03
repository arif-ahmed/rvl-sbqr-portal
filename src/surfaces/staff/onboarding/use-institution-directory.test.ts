import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authenticate, resetApiClient } from '../../../shared/api/client'
import {
  toRegistryEntry,
  useInstitutionDirectory,
  type DirectoryEntry,
} from './use-institution-directory'

const live: DirectoryEntry[] = [
  {
    institutionCode: '022002',
    instituteType: '02',
    institutionName: 'bKash',
    status: 'ACTIVE',
    source: 'LOCAL',
    syncedAt: '2026-10-03T12:00:00Z',
  },
  {
    institutionCode: '000060',
    instituteType: '00',
    institutionName: 'Brac Bank PLC.',
    status: 'SUSPENDED',
    source: 'LOCAL',
    syncedAt: '2026-10-03T12:00:00Z',
  },
]

afterEach(() => {
  vi.unstubAllGlobals()
  resetApiClient()
})

// authenticate() decodes the token payload, so the stub returns a minimal JWT.
const adminJwt = `h.${btoa(JSON.stringify({ sub: 'platform-admin', scope: ['admin'] }))}.s`

describe('toRegistryEntry', () => {
  it('splits the 6-digit code into type + 4-digit id', () => {
    expect(toRegistryEntry(live[0])).toEqual({ name: 'bKash', type: '02', id: '2002' })
  })
})

describe('useInstitutionDirectory', () => {
  it('serves live rows and freezes non-ACTIVE codes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/v1/oauth/token'))
          return Response.json({ accessToken: adminJwt, tokenType: 'Bearer', expiresIn: 600 })
        return Response.json(live)
      }),
    )
    await authenticate('platform-bootstrap', 'secret')
    const { result } = renderHook(() => useInstitutionDirectory())
    await waitFor(() => expect(result.current.live).toBe(true))
    expect(result.current.entries).toEqual([
      { name: 'bKash', type: '02', id: '2002' },
      { name: 'Brac Bank PLC.', type: '00', id: '0060' },
    ])
    expect(result.current.frozen).toEqual(['000060'])
  })

  it('falls back to the static registry when the API is unreachable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).endsWith('/v1/oauth/token'))
          return Response.json({ accessToken: adminJwt, tokenType: 'Bearer', expiresIn: 600 })
        return new Response(null, { status: 500 })
      }),
    )
    await authenticate('platform-bootstrap', 'secret')
    const { result } = renderHook(() => useInstitutionDirectory())
    await waitFor(() => expect(result.current.live).toBe(false))
    // Static Annex A registry: 93 entries, nothing frozen.
    expect(result.current.entries.length).toBe(93)
    expect(result.current.frozen).toEqual([])
    expect(result.current.entries.find((e) => e.id === '2002')?.name).toBe('bKash')
  })

  it('falls back immediately when nobody is signed in', async () => {
    const { result } = renderHook(() => useInstitutionDirectory())
    await waitFor(() => expect(result.current.entries.length).toBe(93))
    expect(result.current.live).toBe(false)
  })
})
