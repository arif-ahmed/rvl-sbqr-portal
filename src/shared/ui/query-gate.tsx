import type { ReactNode } from 'react'
import { errorMessage } from '../api/client'
import { Banner } from './banner'

export type GateState<T> = { data: T | null | undefined; isPending: boolean; error: unknown }

/** Loading, failed, or the screen: every page that reads the API renders its body through this. */
export function QueryGate<T>({ state, what, children }: { state: GateState<T>; what: string; children: (data: T) => ReactNode }) {
  if (state.data != null) return <>{children(state.data)}</>
  if (state.error) return <Banner tone="bad" title={`Could not load ${what}`}>{errorMessage(state.error)}</Banner>
  return (
    <p role="status" className="py-10 text-center text-text-3">
      Loading {what}…
    </p>
  )
}
