export type Meter = 'GENERATION_STATIC' | 'GENERATION_DYNAMIC' | 'VALIDATION'
export type Verdict = 'Generated' | 'Valid' | 'Invalid' | 'Indeterminate' | 'Error'

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

/** Generations are always billed; a validation only when the verdict is conclusive (valid or invalid). */
export const isBillable = (meter: Meter, verdict: Verdict) =>
  meter === 'VALIDATION' ? verdict === 'Valid' || verdict === 'Invalid' : true

export type UsageFilters = {
  query: string
  meter: '' | Meter
  billing: '' | 'billable' | 'free'
  /** 'YYYY-MM-DD', inclusive. */
  from: string
  to: string
}

export const noFilters: UsageFilters = { query: '', meter: '', billing: '', from: '', to: '' }

export const hasFilters = (f: UsageFilters) => Object.values(f).some(Boolean)

export function filterEvents(events: UsageEvent[], f: UsageFilters): UsageEvent[] {
  const q = f.query.trim().toLowerCase()
  return events.filter(
    (e) =>
      (!f.meter || e.meter === f.meter) &&
      (!f.billing || e.billable === (f.billing === 'billable')) &&
      (!f.from || e.at.slice(0, 10) >= f.from) &&
      (!f.to || e.at.slice(0, 10) <= f.to) &&
      (!q || `${e.ref} ${e.id}`.toLowerCase().includes(q)),
  )
}

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
    ['event_id', 'occurred_at', 'meter', 'client_reference', 'result', 'billable'],
    ...events.map((e) => [e.id, e.at, e.meter, e.ref, e.verdict, e.billable]),
  ]
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}
