export type Meter = 'GENERATION_STATIC' | 'GENERATION_DYNAMIC' | 'VALIDATION'
/** Verdict codes as the API records them. Validation verdicts per the billing design; GENERATED for generations. */
export type Verdict =
  | 'GENERATED'
  | 'VALID'
  | 'INVALID_SIGNATURE'
  | 'STRUCTURAL_INVALID'
  | 'KEY_NOT_FOUND'
  | 'KEY_SUSPENDED'
  | 'KEY_REVOKED'
  | 'KEY_NOT_ACTIVE'
  | 'NON_P2P'
  | 'REQUEST_STALE'

export type UsageEvent = {
  id: string
  /** Local time, 'YYYY-MM-DDTHH:mm'. */
  at: string
  meter: Meter
  verdict: Verdict
  billable: boolean
  ref: string
  institutionId: string
}

export const meters: { value: Meter; label: string }[] = [
  { value: 'GENERATION_STATIC', label: 'Static generation' },
  { value: 'GENERATION_DYNAMIC', label: 'Dynamic generation' },
  { value: 'VALIDATION', label: 'Validation' },
]

export const meterLabel = (m: Meter) => meters.find((x) => x.value === m)?.label ?? m

type VerdictInfo = {
  label: string
  billed: boolean
  /** One short phrase shown in the list. */
  short: string
  /** Full sentence shown in the event panel. */
  why: string
  /** True for a completed check that rejected the QR code. */
  rejection?: boolean
}

const completed = 'The platform completed the check and returned a rejection, so it is billed. Catching a bad QR code is the service the institution pays for.'

// The billing policy in one place (ADR 0002, "Bill every conclusive verdict"). Only protocol
// rejections are free; replayed requests and failed calls leave no event, so they never appear.
const verdicts: Record<Verdict, VerdictInfo> = {
  GENERATED: { label: 'Generated', billed: true, short: 'QR code created', why: 'A QR code was created. Every generated QR code is billed.' },
  VALID: { label: 'Valid', billed: true, short: 'Check completed', why: 'The platform completed the check and the QR code is genuine. Every completed validation is billed.' },
  INVALID_SIGNATURE: { label: 'Invalid signature', billed: true, short: 'Rejection is billed', rejection: true, why: `The signature does not match the issuer's key. ${completed}` },
  STRUCTURAL_INVALID: { label: 'Malformed QR', billed: true, short: 'Rejection is billed', rejection: true, why: `The QR code is malformed (bad format or checksum). Reading it still uses platform resources, so it is billed.` },
  KEY_NOT_FOUND: { label: 'Key not found', billed: true, short: 'Rejection is billed', rejection: true, why: `No public key exists for the issuing institution. ${completed}` },
  KEY_SUSPENDED: { label: 'Key suspended', billed: true, short: 'Rejection is billed', rejection: true, why: `The issuing institution's key is suspended. ${completed}` },
  KEY_REVOKED: { label: 'Key revoked', billed: true, short: 'Rejection is billed', rejection: true, why: `The issuing institution's key is revoked. ${completed}` },
  KEY_NOT_ACTIVE: { label: 'Key not active', billed: true, short: 'Rejection is billed', rejection: true, why: `The issuing institution's key is not active yet. ${completed}` },
  NON_P2P: { label: 'Not a P2P code', billed: true, short: 'Rejection is billed', rejection: true, why: `The QR code is not a person-to-person code. ${completed}` },
  REQUEST_STALE: {
    label: 'Stale request',
    billed: false,
    short: 'Protocol rejection',
    why: "The request's timestamp was outside the allowed window, so no check ran. Protocol rejections are never charged. The event is kept for reports.",
  },
}

export const verdictCodes = Object.keys(verdicts) as Verdict[]

const unknown: VerdictInfo = {
  label: 'Unknown result',
  billed: false,
  short: 'Result not recognised',
  why: 'This result is not in the billing rules, so it is not billed. Ask the platform team to check it.',
}

export const verdictInfo = (verdict: string): VerdictInfo => verdicts[verdict as Verdict] ?? unknown
export const verdictLabel = (verdict: string) => verdictInfo(verdict).label

/** Generations are always billed; a validation is billed unless it was a protocol rejection. */
export const isBillable = (meter: Meter, verdict: string) => (meter === 'VALIDATION' ? verdictInfo(verdict).billed : true)

/** Why an event is, or is not, billed. Billing is fixed when the event is written. */
export function billingReason(e: Pick<UsageEvent, 'billable' | 'verdict'>) {
  const info = verdictInfo(e.verdict)
  return { billed: e.billable, short: e.billable ? 'Billed' : info.short, why: info.why, rejection: !!info.rejection }
}

export type UsageSummary = { staticGen: number; dynamicGen: number; validations: number; billable: number; total: number }

export function summarize(events: UsageEvent[]): UsageSummary {
  const count = (m: Meter) => events.filter((e) => e.meter === m).length
  return {
    staticGen: count('GENERATION_STATIC'),
    dynamicGen: count('GENERATION_DYNAMIC'),
    validations: count('VALIDATION'),
    billable: events.filter((e) => e.billable).length,
    total: events.length,
  }
}

export type UsageFilters = {
  meter: '' | Meter
  billing: '' | 'billable' | 'free'
  /** 'YYYY-MM-DD', inclusive. */
  from: string
  to: string
}

export const noFilters: UsageFilters = { meter: '', billing: '', from: '', to: '' }

export const hasFilters = (f: UsageFilters) => Object.values(f).some(Boolean)

export function filterEvents(events: UsageEvent[], f: UsageFilters): UsageEvent[] {
  return events.filter(
    (e) =>
      (!f.meter || e.meter === f.meter) &&
      (!f.billing || e.billable === (f.billing === 'billable')) &&
      (!f.from || e.at.slice(0, 10) >= f.from) &&
      (!f.to || e.at.slice(0, 10) <= f.to),
  )
}

/** The billing period an event falls in, e.g. '2026-09'. */
export const eventPeriod = (e: Pick<UsageEvent, 'at'>) => e.at.slice(0, 7)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** '2026-10-02T10:41' -> '02 Oct 10:41'. */
export function formatEventTime(at: string): string {
  const [date, time] = at.split('T')
  const [, m, d] = date.split('-')
  return `${d} ${MONTHS[Number(m) - 1]} ${time}`
}

const csvCell = (v: string | boolean) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** CSV text for the given events. Pure, so it can be tested without a browser download. */
export function eventsToCsv(events: UsageEvent[]): string {
  const rows = [
    ['event_id', 'occurred_at', 'meter', 'client_reference', 'result', 'billable', 'billing_reason'],
    ...events.map((e) => [e.id, e.at, e.meter, e.ref, e.verdict, e.billable, billingReason(e).short]),
  ]
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}
