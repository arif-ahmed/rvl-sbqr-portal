// Money, counts and periods. Rules: DESIGN.md "Money, dates, numbers".

const MINUS = '−'

/** ৳ 1,234 or ৳ 1,234.50. Whole numbers show no decimals. Negative uses a true minus. */
export function bdt(amount: number): string {
  const abs = Math.abs(amount)
  const body = Number.isInteger(abs)
    ? abs.toLocaleString('en-US')
    : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${amount < 0 ? MINUS : ''}৳ ${body}`
}

/** Per-call price: ৳ 0.125, ৳ 0.50, ৳ 2. Up to 4 decimals, at least 2 unless whole. */
export function bdtRate(rate: number): string {
  const body = Number.isInteger(rate)
    ? rate.toLocaleString('en-US')
    : rate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return `৳ ${body}`
}

/** Signed money for adjustments: +৳ 250, −৳ 500. */
export function bdtSigned(amount: number): string {
  return amount > 0 ? `+${bdt(amount)}` : bdt(amount)
}

/** Whole count with thousands separators. */
export function count(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

/** 12.3%. One decimal. */
export function percent(n: number): string {
  return `${n.toFixed(1)}%`
}

/** Change against a previous figure: +4.2%, −1.0%. */
export function percentSigned(n: number): string {
  const body = percent(Math.abs(n))
  return n < 0 && body !== '0.0%' ? `${MINUS}${body}` : n > 0 ? `+${body}` : body
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** '2026-09' -> 'September 2026'. */
export function periodName(period: string): string {
  const [year, month] = period.split('-')
  return `${MONTHS[Number(month) - 1]} ${year}`
}

/** '2026-09' -> 'Sep', for chart axis labels. */
export function monthShort(period: string): string {
  return MONTHS[Number(period.split('-')[1]) - 1].slice(0, 3)
}

/**
 * Render an ISO 8601 timestamp as a human-readable UTC date: '15 March 2027'.
 * The expiry chip and the signing-key cell use this so the day is unambiguous
 * across timezones (the API stamps everything in UTC). Returns '—' when the
 * input is null/undefined — the cert-expiry feature leaves the validity
 * window open when an operator mints without an explicit deadline.
 */
export function expiryDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/**
 * Days remaining until `iso` (UTC), ignoring the time-of-day. Negative when
 * the deadline has passed. Used by <ExpiryChip> to pick its tone:
 * <= 0 → 'bad' (expired), <= 30 → 'warn' (about to expire), otherwise 'ok'.
 */
export function daysUntil(iso: string | null | undefined, now: Date = new Date()): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Floor to UTC midnight so a "today" expiry reports 0, not -1.
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const target = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  return Math.round((target - today) / 86_400_000)
}

/** '12d', '3mo', '2yr'. Used by <ExpiryChip>. */
export function daysUntilHuman(days: number): string {
  if (days < 0) return `${-days}d overdue`
  if (days === 0) return 'today'
  if (days < 60) return `${days}d`
  const months = Math.round(days / 30)
  if (months < 24) return `${months}mo`
  return `${Math.round(days / 365)}yr`
}
