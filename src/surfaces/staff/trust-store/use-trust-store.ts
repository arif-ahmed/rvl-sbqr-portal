import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../../shared/api/client'
import type { TrustStoreList } from './api/types'

// Trust store query: the BB-sourced institution directory with public keys. Lives
// under /v1/trust-store/institutions (separate from /v1/admin/institutions, which
// is the onboarding-picker projection that omits cryptographic material). Same
// MasterAdmin scope on the manager, which the portal session already carries.
const trustStoreKey = ['trust-store', 'institutions'] as const

export const useTrustStore = () =>
  useQuery({
    queryKey: trustStoreKey,
    queryFn: () => apiGet<TrustStoreList>('/v1/trust-store/institutions'),
    // The BB sync runs daily — there is no value in refetching on window
    // focus; a 5-minute stale window is the right ceiling for a manual tab.
    staleTime: 5 * 60_000,
    // The key material is large; a reload re-fetches anyway because
    // TanStack never persists query data across reloads.
  })

/** Every trust-store institution, or an empty list while loading / on error. */
export const useTrustStoreInstitutions = () => useTrustStore().data?.institutions ?? []
