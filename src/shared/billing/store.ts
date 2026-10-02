import { useSyncExternalStore } from 'react'
import {
  periodTotals,
  round2,
  stampNow,
  usageComplete,
  type BillingData,
  type FinalizeOutcome,
  type OutboxEvent,
  type Period,
} from './billing'

// UI-only stand-in for the API, like the rates and institutions stores. Fictional data pinned to
// the October 2026 demo world (design/portal-prototype.html); resets on reload.
// Institution ids match the institutions store so links line up. Replace with TanStack Query
// once the API exists.

function seed(): BillingData {
  const periods = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
  const finalizedAt = ['2026-05-03 11:20', '2026-06-03 10:42', '2026-07-03 15:04', '2026-08-04 09:31', '2026-09-03 12:15']
  return {
    periods,
    periodMeta: {
      ...Object.fromEntries(
        periods.slice(0, 5).map((p, i) => [
          p,
          { period: p, status: 'Finalized' as const, finalizedBy: 'finance@rvl.example', finalizedAt: finalizedAt[i] },
        ]),
      ),
      '2026-09': { period: '2026-09', status: 'Draft' as const, calculatedAt: '2026-10-02 09:14' },
    },
    institutions: [
      { id: 'inst-1', name: 'Shapla Commercial Bank', code: '000901' },
      { id: 'inst-2', name: 'Karnaphuli Trust Bank', code: '000902' },
      { id: 'inst-3', name: 'Teesta Digital Wallet', code: '022901' },
      { id: 'inst-4', name: 'Surma Payments Ltd', code: '032901' },
      { id: 'inst-5', name: 'Nilgiri Mercantile Bank', code: '000903' },
      { id: 'inst-6', name: 'Chandra Settlement Services', code: '042901' },
      { id: 'inst-7', name: 'Doyel Co-operative Finance', code: '012901' },
    ],
    rateCards: [
      { institutionId: 'inst-1', effectiveFrom: '2026-01-01', generationRate: 0.5, validationRate: 0.125 },
      { institutionId: 'inst-1', effectiveFrom: '2026-11-01', generationRate: 0.45, validationRate: 0.12 },
      { institutionId: 'inst-2', effectiveFrom: '2026-01-01', generationRate: 0.5, validationRate: 0.125 },
      { institutionId: 'inst-3', effectiveFrom: '2026-07-01', generationRate: 0.5, validationRate: 0.2 },
      { institutionId: 'inst-6', effectiveFrom: '2026-04-01', generationRate: 0.5, validationRate: 0.2 },
      { institutionId: 'inst-7', effectiveFrom: '2026-06-01', generationRate: 0.48, validationRate: 0.19 },
    ],
    counts: {
      'inst-1': {
        '2026-04': { staticGenerations: 2340, dynamicGenerations: 9502, validations: 11875 },
        '2026-05': { staticGenerations: 2510, dynamicGenerations: 10188, validations: 12644 },
        '2026-06': { staticGenerations: 2655, dynamicGenerations: 10905, validations: 13312 },
        '2026-07': { staticGenerations: 2798, dynamicGenerations: 11401, validations: 14058 },
        '2026-08': { staticGenerations: 2902, dynamicGenerations: 11987, validations: 14917 },
        '2026-09': { staticGenerations: 3015, dynamicGenerations: 12466, validations: 15341 },
      },
      'inst-2': {
        '2026-04': { staticGenerations: 936, dynamicGenerations: 3802, validations: 4750 },
        '2026-05': { staticGenerations: 1004, dynamicGenerations: 4075, validations: 5057 },
        '2026-06': { staticGenerations: 1062, dynamicGenerations: 4362, validations: 5325 },
        '2026-07': { staticGenerations: 1119, dynamicGenerations: 4560, validations: 5623 },
        '2026-08': { staticGenerations: 1161, dynamicGenerations: 4795, validations: 5966 },
        '2026-09': { staticGenerations: 1206, dynamicGenerations: 4986, validations: 6136 },
      },
      'inst-3': {
        '2026-07': { staticGenerations: 0, dynamicGenerations: 0, validations: 2105 },
        '2026-08': { staticGenerations: 0, dynamicGenerations: 0, validations: 2613 },
        '2026-09': { staticGenerations: 0, dynamicGenerations: 0, validations: 3148 },
      },
      'inst-6': {
        '2026-04': { staticGenerations: 402, dynamicGenerations: 1682, validations: 2120 },
        '2026-05': { staticGenerations: 431, dynamicGenerations: 1754, validations: 2199 },
        '2026-06': { staticGenerations: 455, dynamicGenerations: 1834, validations: 2270 },
        '2026-07': { staticGenerations: 468, dynamicGenerations: 1897, validations: 2341 },
        '2026-08': { staticGenerations: 440, dynamicGenerations: 1780, validations: 2192 },
      },
      'inst-7': {
        '2026-06': { staticGenerations: 122, dynamicGenerations: 502, validations: 611 },
        '2026-07': { staticGenerations: 131, dynamicGenerations: 531, validations: 645 },
        '2026-08': { staticGenerations: 118, dynamicGenerations: 479, validations: 580 },
      },
    },
    adjustments: [
      {
        id: 'adj-1', institutionId: 'inst-2', period: '2026-09', amount: -500,
        reason: 'Credit: duplicate validation burst on 14 Sep (INC-2291)', status: 'Pending',
        createdBy: 'finance@rvl.example', createdAt: '2026-09-29 15:10',
      },
      {
        id: 'adj-2', institutionId: 'inst-3', period: '2026-09', amount: 250,
        reason: 'Onboarding support hours, as per agreement', status: 'Pending',
        createdBy: 'finance@rvl.example', createdAt: '2026-09-30 11:02',
      },
      {
        id: 'adj-3', institutionId: 'inst-1', period: '2026-08', amount: -1200,
        reason: 'Credit: rate card correction effective July', status: 'Applied',
        createdBy: 'finance@rvl.example', createdAt: '2026-08-27 10:31',
      },
      {
        id: 'adj-4', institutionId: 'inst-7', period: '2026-07', amount: 300,
        reason: 'Manual certificate re-issue fee', status: 'Applied',
        createdBy: 'finance@rvl.example', createdAt: '2026-07-29 16:45',
      },
    ],
    outbox: [
      { id: 'ob-7731', institutionId: 'inst-3', period: '2026-09', meter: 'VALIDATION', occurredAt: '2026-09-30 23:58', status: 'Queued' },
      { id: 'ob-7732', institutionId: 'inst-3', period: '2026-09', meter: 'VALIDATION', occurredAt: '2026-09-30 23:59', status: 'Queued' },
    ],
  }
}

let data = seed()
let counter = data.adjustments.length
const listeners = new Set<() => void>()
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}
const set = (next: BillingData) => {
  data = next
  listeners.forEach((l) => l())
}

export const getBilling = () => data
export const useBilling = () => useSyncExternalStore(subscribe, getBilling)

/**
 * The month-close step: lock the period against the total that was reviewed, and settle the
 * period's pending adjustments onto their statements. Mirrors the API's finalize outcomes.
 */
export function finalizePeriod(period: Period, expectedTotal: number, finalizedBy: string, at = stampNow()): FinalizeOutcome {
  const meta = data.periodMeta[period]
  if (!meta || meta.status === 'Finalized') return 'AlreadyFinalized'
  if (!usageComplete(data.outbox, period)) return 'UsageNotComplete'
  if (round2(expectedTotal) !== periodTotals(data, period).total) return 'DraftChanged'
  set({
    ...data,
    periodMeta: { ...data.periodMeta, [period]: { period, status: 'Finalized', finalizedBy, finalizedAt: at } },
    adjustments: data.adjustments.map((a) => (a.period === period ? { ...a, status: 'Applied' as const } : a)),
  })
  return 'Finalized'
}

export function recalculatePeriod(period: Period, at = stampNow()) {
  const meta = data.periodMeta[period]
  if (!meta || meta.status === 'Finalized') return
  set({ ...data, periodMeta: { ...data.periodMeta, [period]: { ...meta, calculatedAt: at } } })
}

export function addAdjustment(input: { institutionId: string; period: Period; amount: number; reason: string; createdBy: string; at?: string }) {
  const { at = stampNow(), ...rest } = input
  set({ ...data, adjustments: [...data.adjustments, { ...rest, id: `adj-${++counter}`, status: 'Pending', createdAt: at }] })
}

/** Pending only: applied adjustments are part of a finalized month and cannot be touched. */
export function removeAdjustment(id: string) {
  set({ ...data, adjustments: data.adjustments.filter((a) => !(a.id === id && a.status === 'Pending')) })
}

/** Re-deliver a stuck message; its usage event is recorded into the month's counts. */
export function requeueEvent(id: string) {
  const event = data.outbox.find((e) => e.id === id && e.status === 'Queued')
  if (!event) return
  set(deliver(data, event))
}

export function requeueAll() {
  const queued = data.outbox.filter((e) => e.status === 'Queued')
  if (queued.length === 0) return
  set(queued.reduce(deliver, data))
}

function deliver(state: BillingData, event: OutboxEvent): BillingData {
  const previous = state.counts[event.institutionId]?.[event.period] ?? { staticGenerations: 0, dynamicGenerations: 0, validations: 0 }
  const counts = {
    ...state.counts,
    [event.institutionId]: {
      ...state.counts[event.institutionId],
      [event.period]: {
        staticGenerations: previous.staticGenerations + (event.meter === 'GENERATION_STATIC' ? 1 : 0),
        dynamicGenerations: previous.dynamicGenerations + (event.meter === 'GENERATION_DYNAMIC' ? 1 : 0),
        validations: previous.validations + (event.meter === 'VALIDATION' ? 1 : 0),
      },
    },
  }
  return { ...state, counts, outbox: state.outbox.map((e) => (e.id === event.id ? { ...e, status: 'Delivered' as const } : e)) }
}

/** For tests: back to the seed data. */
export function resetBilling() {
  data = seed()
  counter = data.adjustments.length
  listeners.forEach((l) => l())
}
