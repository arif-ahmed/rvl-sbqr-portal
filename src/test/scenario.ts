import type { FakeBackend } from './fake-backend'

export const SHAPLA = 'inst-1'
export const KARNAPHULI = 'inst-2'
export const TEESTA = 'inst-3'
export const CHANDRA = 'inst-6'

/** September 2026 as seeded below, so assertions read as arithmetic rather than magic numbers. */
export const SEPTEMBER = {
  shapla: { counts: { staticGenerations: 3015, dynamicGenerations: 12466, validations: 15341 }, subtotal: 9658.13, total: 9658.13 },
  karnaphuli: { counts: { validations: 8000 }, subtotal: 1000, adjustment: -250, total: 750 },
  teesta: { counts: { validations: 3148 }, subtotal: 629.6, total: 629.6 },
  total: 11037.73,
}

/** A charge that settled onto Shapla's August statement. */
export const AUGUST_CHARGE = { amount: 300, reason: 'Support hours, August (INC-2188)' }

/**
 * Early October 2026 (the test clock). Shapla and Karnaphuli have had a card since January, Teesta since July;
 * Chandra (SUSPENDED, no card) has usage that is recorded but not billed.
 *   April–August: finalized (Shapla billed every month, Teesta from July); August carries a ৳ 300 charge.
 *   September:    a Draft; Karnaphuli carries a ৳ 250 credit; one dead-lettered and one pending usage message
 *                 are still outstanding, so the month cannot close yet.
 *   October:      open, provisional.
 */
export function seedOctober2026(backend: FakeBackend, opts: { outbox?: boolean } = {}) {
  const b = backend.billing
  backend.addRateCard(TEESTA, '2026-07-01', 0.5, 0.2)

  const months = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
  months.forEach((p, i) => {
    b.addUsageCounts(SHAPLA, p, { staticGenerations: 2000 + 100 * i, dynamicGenerations: 10000 + 500 * i, validations: 14000 + 300 * i })
    if (p >= '2026-07') b.addUsageCounts(TEESTA, p, { validations: 2500 + 100 * i })
    if (p === '2026-08') b.addAdjustment(SHAPLA, AUGUST_CHARGE.amount, AUGUST_CHARGE.reason, 'platform-admin')
    b.setPeriod(p, 'FINALIZED')
  })

  b.addUsageCounts(SHAPLA, '2026-09', SEPTEMBER.shapla.counts)
  b.addUsageCounts(KARNAPHULI, '2026-09', SEPTEMBER.karnaphuli.counts)
  b.addUsageCounts(TEESTA, '2026-09', SEPTEMBER.teesta.counts)
  b.addUsageCounts(CHANDRA, '2026-09', { staticGenerations: 10, dynamicGenerations: 5, validations: 8 })
  b.addAdjustment(KARNAPHULI, SEPTEMBER.karnaphuli.adjustment, 'Credit: duplicate burst, 14 Sep (INC-2291)', 'platform-admin')
  b.setPeriod('2026-09', 'DRAFT')

  if (opts.outbox !== false) {
    b.addOutbox('DEAD', '2026-09-30T10:00:00+00:00')
    b.addOutbox('PENDING', '2026-09-30T11:00:00+00:00')
  }
}
