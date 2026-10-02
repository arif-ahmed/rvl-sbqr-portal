import { useSyncExternalStore } from 'react'
import type { RateCard } from './rates'
import { nextMonth } from './rates'

// UI-only stand-in for the API, like the institutions store. Fictional data; resets on reload.
// Replace with TanStack Query once the API exists.

function seed(): RateCard[] {
  const year = new Date().getFullYear()
  return [
    { id: 'rc-1', institutionId: 'inst-1', effectiveFrom: `${year}-01-01`, generationRate: 0.5, validationRate: 0.125 },
    { id: 'rc-2', institutionId: 'inst-1', effectiveFrom: `${nextMonth()}-01`, generationRate: 0.45, validationRate: 0.12 },
    { id: 'rc-3', institutionId: 'inst-2', effectiveFrom: `${year}-01-01`, generationRate: 0.5, validationRate: 0.125 },
  ]
}

let items = seed()
let counter = items.length
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const set = (next: RateCard[]) => {
  items = next
  listeners.forEach((l) => l())
}

export const getRateCards = () => items
export const useRateCards = () => useSyncExternalStore(subscribe, getRateCards)

export function addRateCard(card: Omit<RateCard, 'id'>) {
  set([...items, { ...card, id: `rc-${++counter}` }])
}
export const withdrawRateCard = (id: string) => set(items.filter((c) => c.id !== id))
export function resetRateCards() {
  set(seed())
  counter = items.length
}
