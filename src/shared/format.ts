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
