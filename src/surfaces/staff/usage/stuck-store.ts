import { useSyncExternalStore } from 'react'
import type { Meter } from '../../../shared/usage/usage'

// UI-only stand-in for the API: usage messages that missed delivery and wait to be requeued.
// Fictional data; resets on reload. Replace with TanStack Query once the API exists.

export type StuckEvent = { id: string; institutionId: string; meter: Meter; at: string }

const seed = (): StuckEvent[] => [
  { id: 'msg_7f3a21', institutionId: 'inst-1', meter: 'VALIDATION', at: '2026-10-01T23:58' },
  { id: 'msg_7f3a22', institutionId: 'inst-1', meter: 'GENERATION_DYNAMIC', at: '2026-10-02T00:03' },
  { id: 'msg_7f3b09', institutionId: 'inst-2', meter: 'VALIDATION', at: '2026-10-02T01:17' },
  { id: 'msg_7f3c40', institutionId: 'inst-3', meter: 'GENERATION_STATIC', at: '2026-10-02T06:52' },
]

let items = seed()
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const set = (next: StuckEvent[]) => {
  items = next
  listeners.forEach((l) => l())
}

export const getStuck = () => items
export const useStuck = () => useSyncExternalStore(subscribe, getStuck)
export const requeue = (id: string) => set(items.filter((e) => e.id !== id))
export const requeueAll = () => set([])
export const resetStuck = () => set(seed())
