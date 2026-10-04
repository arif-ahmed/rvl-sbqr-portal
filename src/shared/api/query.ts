import { QueryClient } from '@tanstack/react-query'

/**
 * The one QueryClient for the app. Reads go stale after a few seconds so a wizard step that
 * just wrote something shows fresh data on the next screen; mutations never retry, because
 * several of them are one-shot (a client secret is issued once).
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 10_000, retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
}

/** The app-wide instance. Sign-out clears it so one user's cached data never reaches the next. */
export const queryClient = createQueryClient()
