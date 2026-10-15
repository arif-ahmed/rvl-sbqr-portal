import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, apiGet, apiSend } from '../../../../shared/api/client'
import type { Institution, KeyMode, Profile } from '../types'
import { toInstitution, toRegisterRequest } from './mappers'
import type { CryptoKeyDto, OnboardingDto, PagedCryptoKeyDto, PagedTenantDto, ProvisionedCredentials, TenantDto } from './types'

// TanStack Query bindings for the tenant onboarding API. Every write refetches the tenant list,
// the tenant and its onboarding view before it resolves, so the screen that comes next never
// shows stale progress. Request shapes: docs/features/institution-onboarding/implementation-guide.md.

const tenantsKey = ['tenants'] as const
const tenantKey = (id: string) => ['tenant', id] as const
const onboardingKey = (id: string) => ['onboarding', id] as const
const activeCryptoKeyKey = (id: string) => ['crypto-key', 'active', id] as const

const base = '/v1/admin/tenants'
const cryptoKeysBase = '/v1/crypto-keys'

// ------------------------------------------------------------------ reads

/** The API caps a page at 100 tenants and the list filters client-side, so read every page. */
export async function fetchAllTenants(): Promise<TenantDto[]> {
  const tenants: TenantDto[] = []
  for (let page = 1; ; page++) {
    const result = await apiGet<PagedTenantDto>(`${base}?page=${page}&pageSize=100`)
    tenants.push(...result.items)
    if (!result.hasMore || result.items.length === 0) return tenants
  }
}

export const useInstitutionList = () =>
  useQuery({
    queryKey: tenantsKey,
    queryFn: async () => (await fetchAllTenants()).map(toInstitution),
  })

const none: Institution[] = []
/** Every institution, or an empty list while loading or on error (use `useInstitutionList` for those states). */
export const useInstitutions = (): Institution[] => useInstitutionList().data ?? none

export const useInstitution = (id: string | undefined) =>
  useQuery({
    queryKey: tenantKey(id ?? ''),
    enabled: !!id,
    queryFn: async () => toInstitution(await apiGet<TenantDto>(`${base}/${id}`)),
  })

/** The institution's onboarding progress (see the contract). Reconciled server-side on every read. */
export const useOnboarding = (id: string | null | undefined) =>
  useQuery({
    queryKey: onboardingKey(id ?? ''),
    enabled: !!id,
    queryFn: () => apiGet<OnboardingDto>(`${base}/${id}/onboarding`),
  })

// ------------------------------------------------------------------ writes

function refresh(qc: QueryClient, id?: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: tenantsKey }),
    ...(id ? [qc.invalidateQueries({ queryKey: tenantKey(id) }), qc.invalidateQueries({ queryKey: onboardingKey(id) })] : []),
  ])
}

/** Step 1: register the institution. Creates a Pending tenant and returns its id. */
export function useRegisterTenant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (profile: Profile) => apiSend<TenantDto>('POST', base, toRegisterRequest(profile)),
    onSuccess: (tenant) => refresh(qc, tenant.tenantId),
  })
}

type Capabilities = { generation: boolean; validation: boolean }
const capabilityBody = (c: Capabilities) => ({ isQrGenerationAllowed: c.generation, isQrValidationAllowed: c.validation })

/** Step 2: save what the institution may do. Pending tenants only. */
export function useSaveConfiguration() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...capabilities }: { id: string } & Capabilities) => apiSend('PATCH', `${base}/${id}/configuration`, capabilityBody(capabilities)),
    onSuccess: (_data, { id }) => refresh(qc, id),
  })
}

/**
 * Step 3: issue the client ID and secret. Resolves to the credentials (the secret is shown once),
 * or `null` when the tenant already has an active credential — a 409 here means "already done",
 * not a failure, so a retry after a dropped connection simply moves on.
 * The result is never cached: `gcTime: 0` drops the secret as soon as nothing observes the mutation.
 */
export function useProvisionCredentials() {
  const qc = useQueryClient()
  return useMutation({
    gcTime: 0,
    mutationFn: async ({ id, ...capabilities }: { id: string } & Capabilities): Promise<ProvisionedCredentials | null> => {
      try {
        return await apiSend<ProvisionedCredentials>('POST', `${base}/${id}/tenant-configuration`, capabilityBody(capabilities))
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) return null
        throw e
      }
    },
    onSuccess: (_data, { id }) => refresh(qc, id),
  })
}

/** Step 4: generate a signing key, or adopt the institution's own. The PEM goes in the request and is kept nowhere. */
export function useCreateSigningKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, mode, privateKeyPem, validUntil }: { id: string; mode: KeyMode; privateKeyPem?: string; validUntil?: string }) =>
      apiSend('POST', '/v1/crypto-keys', { tenantId: id, mode, ...(mode === 'Adopt' ? { privateKeyPem } : {}), ...(validUntil ? { validUntil } : {}) }),
    onSuccess: (_data, { id }) => {
      refresh(qc, id)
      qc.invalidateQueries({ queryKey: activeCryptoKeyKey(id) })
    },
  })
}

export type TenantAction = 'activate' | 'suspend' | 'reactivate' | 'terminate'

/** Step 6 (activate) and the lifecycle actions on the list and detail pages. */
export function useTenantAction() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: TenantAction; reason?: string }) =>
      apiSend<TenantDto>('POST', `${base}/${id}/${action}`, reason?.trim() ? { reason: reason.trim() } : undefined),
    onSuccess: (_data, { id }) => refresh(qc, id),
  })
}

// ------------------------------------------------------------------ signing-key lifecycle

/**
 * The tenant's currently ACTIVE signing key (single row, by tenant id).
 * Drives the ExpiryChip in the institutions list and the institutions detail
 * page. <c>null</c> when the tenant has no ACTIVE key yet.
 *
 * <para>
 * Hit: <c>GET /v1/crypto-keys/{tenantId}/active</c> — a dedicated single-row
 * endpoint, not the paged history. The list page issues one per row; the
 * detail page issues one alongside the onboarding view; both feed the same
 * query key so the rotate mutation invalidates the right place.
 * </para>
 */
export function useActiveCryptoKey(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: activeCryptoKeyKey(tenantId ?? ''),
    enabled: !!tenantId,
    queryFn: async () => {
      try {
        return await apiGet<CryptoKeyDto>(`${cryptoKeysBase}/${tenantId}/active`)
      } catch (e) {
        // 404 = no ACTIVE key (Pending tenant or a tenant that has been
        // rotated into REVOKED). Surface as null so the cell renders
        // "No key" rather than an error banner.
        if (e instanceof ApiError && e.status === 404) return null
        throw e
      }
    },
  })
}

/**
 * Rotate the tenant's ACTIVE signing key. PUT <c>/v1/crypto-keys/{tenantId}</c>
 * with an optional <c>gracePeriodMinutes</c> (default 60, 0 = immediate
 * cut-over) and an optional <c>newKeyValidUntil</c> override.
 *
 * <para>
 * Invalidates the active-key query and the tenant's onboarding view so the
 * wizard's "Signing key" step refreshes with the rotated row's
 * <c>validUntil</c> on success. The same key is invalidated by
 * <see cref="useCreateSigningKey"/> (POST) so a successful mint
 * refreshes the chip too.
 * </para>
 */
export function useRotateCryptoKey() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, gracePeriodMinutes, newKeyValidUntil }: { id: string; gracePeriodMinutes?: number; newKeyValidUntil?: string }) => {
      const body: Record<string, unknown> = {}
      if (gracePeriodMinutes !== undefined) body.gracePeriodMinutes = gracePeriodMinutes
      if (newKeyValidUntil) body.newKeyValidUntil = newKeyValidUntil
      return apiSend<CryptoKeyDto>('PUT', `${cryptoKeysBase}/${id}`, Object.keys(body).length ? body : undefined)
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: activeCryptoKeyKey(id) })
      qc.invalidateQueries({ queryKey: onboardingKey(id) })
      qc.invalidateQueries({ queryKey: tenantKey(id) })
    },
  })
}

/** Paged full history (every status) — used by the institution detail page. */
export function useCryptoKeyHistory(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ['crypto-key', 'history', tenantId ?? ''] as const,
    enabled: !!tenantId,
    queryFn: () => apiGet<PagedCryptoKeyDto>(`${cryptoKeysBase}/${tenantId}?page=1&pageSize=20`),
  })
}
