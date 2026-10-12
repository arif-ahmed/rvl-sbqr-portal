import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { ApiError, apiGet, apiSend } from '../../../../shared/api/client'
import type { Institution, KeyMode, Profile } from '../types'
import { toInstitution, toRegisterRequest } from './mappers'
import type { OnboardingDto, PagedTenantDto, ProvisionedCredentials, TenantDto } from './types'

// TanStack Query bindings for the tenant onboarding API. Every write refetches the tenant list,
// the tenant and its onboarding view before it resolves, so the screen that comes next never
// shows stale progress. Request shapes: docs/features/institution-onboarding/implementation-guide.md.

const tenantsKey = ['tenants'] as const
const tenantKey = (id: string) => ['tenant', id] as const
const onboardingKey = (id: string) => ['onboarding', id] as const

const base = '/v1/admin/tenants'

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
    mutationFn: ({ id, mode, privateKeyPem }: { id: string; mode: KeyMode; privateKeyPem?: string }) =>
      apiSend('POST', '/v1/crypto-keys', { tenantId: id, mode, ...(mode === 'Adopt' ? { privateKeyPem } : {}) }),
    onSuccess: (_data, { id }) => refresh(qc, id),
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
