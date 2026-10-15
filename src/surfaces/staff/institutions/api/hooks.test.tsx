// 2026-10-15 (cert-expiry workstream). The new mutation hooks for signing-key
// rotation have to:
//  1. PUT /v1/crypto-keys/{tenantId} with the right body shape
//     (gracePeriodMinutes + optional newKeyValidUntil; never both omitted
//     when neither was set, never an empty body when the caller passes
//     only one of them).
//  2. Invalidate the active-key, onboarding, and tenant query keys so the
//     ExpiryChip + KeyStep + institutions cell all refresh on success.
// We stub the global `fetch` (the same way use-institution-directory.test.ts
// does) and assert on both the request that goes out and the queries the
// mutation marks stale.

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loginRequest, resetApiClient } from '../../../../shared/api/client'
import { useActiveCryptoKey, useRotateCryptoKey } from './hooks'

const tenantId = 'tenant-1'
const activeKey = {
  keyId: 'k-1',
  tenantId,
  keyVersion: 1,
  status: 'ACTIVE' as const,
  publicKeyFingerprintSha256: 'abc',
  validUntil: '2028-10-15T00:00:00Z',
  activatedAt: '2026-10-15T00:00:00Z',
}

const loginPayload = {
  accessToken: 'access-token',
  tokenType: 'Bearer',
  expiresIn: 900,
  user: { id: 'u1', username: 'master', displayName: 'Master Admin', role: 'MASTER_ADMIN', mustChangePassword: false },
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function wrapperWith(qc: QueryClient) {
  return ({ children }: PropsWithChildren) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(async () => {
  // Stub the login + every subsequent call; the test body narrows behaviour
  // for each individual call via mockResolvedValueOnce on top of this default.
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).endsWith('/v1/auth/login')) return Response.json(loginPayload)
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchMock)
  await loginRequest('master', 'secret')
})
afterEach(() => {
  vi.unstubAllGlobals()
  resetApiClient()
})

describe('useRotateCryptoKey', () => {
  it('PUTs the rotation with gracePeriodMinutes and an optional newKeyValidUntil', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(activeKey), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const qc = makeClient()
    const { result } = renderHook(() => useRotateCryptoKey(), { wrapper: wrapperWith(qc) })

    result.current.mutate({ id: tenantId, gracePeriodMinutes: 30, newKeyValidUntil: '2028-12-31T00:00:00Z' })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const [url, init] = (fetchMock.mock.calls.find((c) => String(c[0]) === `/v1/crypto-keys/${tenantId}`) ?? []) as [string, RequestInit]
    expect(url).toBe(`/v1/crypto-keys/${tenantId}`)
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({
      gracePeriodMinutes: 30,
      newKeyValidUntil: '2028-12-31T00:00:00Z',
    })
  })

  it('omits the body entirely when the caller passes no overrides', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(activeKey), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const qc = makeClient()
    const { result } = renderHook(() => useRotateCryptoKey(), { wrapper: wrapperWith(qc) })

    result.current.mutate({ id: tenantId })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const [, init] = (fetchMock.mock.calls.find((c) => String(c[0]) === `/v1/crypto-keys/${tenantId}`) ?? []) as [string, RequestInit]
    expect(init.body).toBeUndefined()
  })

  it('invalidates active key, onboarding, and tenant keys on success', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(activeKey), { status: 200, headers: { 'content-type': 'application/json' } }),
    )
    const qc = makeClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')
    // Pre-populate the three query keys the rotate should touch.
    qc.setQueryData(['crypto-key', 'active', tenantId], null)
    qc.setQueryData(['onboarding', tenantId], { currentStep: 'REVIEW' })
    qc.setQueryData(['tenant', tenantId], { tenantId })

    const { result } = renderHook(() => useRotateCryptoKey(), { wrapper: wrapperWith(qc) })
    result.current.mutate({ id: tenantId, gracePeriodMinutes: 5 })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    const touched = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey).filter(Boolean)
    expect(touched).toContainEqual(['crypto-key', 'active', tenantId])
    expect(touched).toContainEqual(['onboarding', tenantId])
    expect(touched).toContainEqual(['tenant', tenantId])
  })
})

describe('useActiveCryptoKey', () => {
  it('returns null on 404 instead of failing the cell render', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not found', { status: 404 }))
    const qc = makeClient()
    const { result } = renderHook(() => useActiveCryptoKey(tenantId), { wrapper: wrapperWith(qc) })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBeNull()
  })

  it('surfaces non-404 errors to the caller', async () => {
    fetchMock.mockResolvedValueOnce(new Response('boom', { status: 500 }))
    const qc = makeClient()
    const { result } = renderHook(() => useActiveCryptoKey(tenantId), { wrapper: wrapperWith(qc) })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
