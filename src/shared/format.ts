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
