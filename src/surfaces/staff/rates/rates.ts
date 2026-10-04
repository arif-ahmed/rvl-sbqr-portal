import { z } from 'zod'

/** Prices per call for one institution, from the 1st of `effectiveFrom`'s month. */
export type RateCard = {
  id: string
  institutionId: string
  /** 'YYYY-MM-01'. */
  effectiveFrom: string
  generationRate: number
  validationRate: number
}

export type CardState = 'Scheduled' | 'In effect' | 'Superseded'

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' of a date, in local time. */
export const monthOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
export const currentMonth = (now = new Date()) => monthOf(now)
export const nextMonth = (now = new Date()) => monthOf(new Date(now.getFullYear(), now.getMonth() + 1, 1))

const cardMonth = (c: RateCard) => c.effectiveFrom.slice(0, 7)

/** The card a month is priced with: the latest one that has started by then. */
export function cardFor(cards: RateCard[], institutionId: string, month: string): RateCard | null {
  return (
    cards
      .filter((c) => c.institutionId === institutionId && cardMonth(c) <= month)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  )
}

/** Scheduled (not started, can be withdrawn), In effect, or Superseded by a later card that has started. */
export function cardState(card: RateCard, cards: RateCard[], now = new Date()): CardState {
  const cur = currentMonth(now)
  if (cardMonth(card) > cur) return 'Scheduled'
  return cardFor(cards, card.institutionId, cur)?.id === card.id ? 'In effect' : 'Superseded'
}

export type Operation = 'generation' | 'validation'
export type PriceGap = { operation: Operation; reason: 'no-card' | 'zero-price' }

/**
 * Where an institution may use an operation (its access) but is not charged for it in `month`:
 * no card in effect, or the card prices it at ৳0. A price for an operation the institution cannot use is not a gap.
 * An institution whose access is not set up yet has no gaps.
 */
export function priceGaps(access: { generation: boolean; validation: boolean } | null, cards: RateCard[], institutionId: string, month: string): PriceGap[] {
  if (!access) return []
  const card = cardFor(cards, institutionId, month)
  const gaps: PriceGap[] = []
  const check = (operation: Operation, allowed: boolean, price: number | undefined) => {
    if (!allowed) return
    if (!card) gaps.push({ operation, reason: 'no-card' })
    else if (price === 0) gaps.push({ operation, reason: 'zero-price' })
  }
  check('generation', access.generation, card?.generationRate)
  check('validation', access.validation, card?.validationRate)
  return gaps
}

/** 'Can generate and validate QR codes', 'Can validate QR codes only', or null when access is not set up. */
export function accessSummary(access: { generation: boolean; validation: boolean } | null): string | null {
  if (!access) return null
  if (access.generation && access.validation) return 'Can generate and validate QR codes'
  return access.generation ? 'Can generate QR codes only' : 'Can validate QR codes only'
}

/** Only a card that has not taken effect can be withdrawn. */
export const canWithdraw = (card: RateCard, cards: RateCard[], now = new Date()) => cardState(card, cards, now) === 'Scheduled'

/** A per-call price as form text: BDT, up to 4 decimals, zero allowed. Shared by the Rates drawer and onboarding. */
export const price = z.string().trim().regex(/^\d+(\.\d{1,4})?$/, 'Enter a price in BDT with up to 4 decimals.')

/** A price starts on the 1st of a month, and the current or a future month. The form holds prices as text. */
export const rateCardSchema = z.object({
  institutionId: z.string().min(1, 'Choose an institution.'),
  startMonth: z
    .string()
    .regex(/^\d{4}-\d{2}$/, 'Choose the month the price starts.')
    .refine((m) => m >= currentMonth(), 'The price must start in the current or a future month.'),
  generationRate: price,
  validationRate: price,
})

export type RateCardForm = z.infer<typeof rateCardSchema>
