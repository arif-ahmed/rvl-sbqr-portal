/**
 * The billing domain as the UI sees it (docs/features/metering-billing): a Dhaka month per
 * institution, usage × the rate card in effect, adjustments applied on finalize. Every amount is
 * computed by the API and only read here, so the portal and the statements Finance receives can
 * never disagree. Statements are billing records, never tax invoices.
 */

/** 'YYYY-MM'. */
export type Period = string
/** Provisional: no draft exists yet; the figures are a live view of the usage so far. */
export type PeriodStatus = 'Draft' | 'Finalized' | 'Provisional'

export type BillingPeriodMeta = {
  period: Period
  status: PeriodStatus
  /** Finalized only: who approved the month and when. */
  finalizedBy?: string
  /** 'YYYY-MM-DD HH:mm' (Dhaka). */
  finalizedAt?: string
  /** Draft only: when the statements were last calculated, 'YYYY-MM-DD HH:mm' (Dhaka). */
  calculatedAt?: string
}

export type UsageCounts = { staticGenerations: number; dynamicGenerations: number; validations: number }

export type Adjustment = {
  id: string
  institutionId: string
  /** The month it was applied in; a Pending one lands on the open month. */
  period: Period
  /** Non-zero. Negative is a credit for the institution. */
  amount: number
  reason: string
  status: 'Pending' | 'Applied'
  createdBy: string
  /** 'YYYY-MM-DD HH:mm' (Dhaka). */
  createdAt: string
}

/** A usage message that has not become a usage row yet. It blocks the close of its month and every later one. */
export type OutboxEvent = {
  id: string
  eventType: 'QrGenerated' | 'QrValidated'
  /** The Dhaka month the event happened in. */
  period: Period
  /** 'YYYY-MM-DD HH:mm' (Dhaka). */
  occurredAt: string
  /** Pending: still being delivered. Dead: gave up, needs a requeue. */
  status: 'Pending' | 'Dead'
  attempts: number
  lastError: string | null
}

export type BillingInstitution = { id: string; name: string; code: string }

export type Statement = {
  institutionId: string
  period: Period
  counts: UsageCounts
  rate: { generationRate: number; validationRate: number; effectiveFrom?: string }
  staticGenerationAmount: number
  dynamicGenerationAmount: number
  validationAmount: number
  subtotal: number
  /** On the statement: applied once finalized, pending (previewed) while it is a draft. */
  adjustments: Adjustment[]
  adjustmentsTotal: number
  /** May be negative: a credit the institution carries into Finance's invoice. */
  total: number
}

export type BillingData = {
  /** Oldest first. */
  periods: Period[]
  periodMeta: Record<Period, BillingPeriodMeta>
  institutions: BillingInstitution[]
  /** Per period, per institution id. Absent means no statement (no usage or no rate card in effect). */
  statements: Record<Period, Record<string, Statement>>
  adjustments: Adjustment[]
  /** Usage messages still outstanding, oldest first. */
  outbox: OutboxEvent[]
  /** Per period, per institution id: billable events recorded but not billed, because no rate card was in effect. */
  unbilled: Record<Period, Record<string, number>>
}

export type FinalizeOutcome = 'Finalized' | 'AlreadyFinalized' | 'UsageNotComplete' | 'DraftChanged' | 'PeriodNotReady'

/**
 * Round to 2 dp, half away from zero — the API's rule, applied exactly once per statement line.
 * toPrecision(15) first so products like 15341 × 0.125 × 100 land on the decimal they mean.
 */
export function round2(amount: number): number {
  const scaled = Number((Math.abs(amount) * 100).toPrecision(15))
  return (Math.sign(amount) * Math.round(scaled)) / 100
}

/** One institution's month, or null when it has no statement. */
export const buildStatement = (data: BillingData, institutionId: string, period: Period): Statement | null =>
  data.statements[period]?.[institutionId] ?? null

export type PeriodTotals = {
  statements: Statement[]
  counts: UsageCounts
  subtotal: number
  adjustmentsTotal: number
  total: number
}

const nameFor = (data: BillingData, id: string) => data.institutions.find((i) => i.id === id)?.name ?? id

export function periodTotals(data: BillingData, period: Period): PeriodTotals {
  const statements = Object.values(data.statements[period] ?? {}).sort((a, b) => nameFor(data, a.institutionId).localeCompare(nameFor(data, b.institutionId)))
  const sumCounts = (key: keyof UsageCounts) => statements.reduce((t, s) => t + s.counts[key], 0)
  return {
    statements,
    counts: {
      staticGenerations: sumCounts('staticGenerations'),
      dynamicGenerations: sumCounts('dynamicGenerations'),
      validations: sumCounts('validations'),
    },
    subtotal: round2(statements.reduce((t, s) => t + s.subtotal, 0)),
    adjustmentsTotal: round2(statements.reduce((t, s) => t + s.adjustmentsTotal, 0)),
    total: round2(statements.reduce((t, s) => t + s.total, 0)),
  }
}

export const pendingAdjustments = (data: BillingData, period?: Period) =>
  data.adjustments.filter((a) => a.status === 'Pending' && (!period || a.period === period))

/** Outstanding usage messages that keep `period` (or any month, when omitted) from closing: its own and every earlier month's. */
export const blockingEvents = (data: BillingData, period?: Period) => data.outbox.filter((e) => !period || e.period <= period)

/** What the Overview calls "open items": everything that blocks a quiet month close. */
export const openIssues = (data: BillingData) => data.outbox.length + pendingAdjustments(data).length

/** The month being prepared: the Draft if there is one, else the newest not-yet-finalized month. */
export const draftPeriod = (data: BillingData) =>
  [...data.periods].reverse().find((p) => data.periodMeta[p].status === 'Draft') ??
  [...data.periods].reverse().find((p) => data.periodMeta[p].status === 'Provisional') ??
  null

/** The month after a period, e.g. '2026-09' -> '2026-10'. */
export function monthAfter(period: Period): Period {
  const [year, month] = period.split('-').map(Number)
  const next = new Date(year, month, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const DHAKA_OFFSET_MS = 6 * 3_600_000
const pad = (n: number) => String(n).padStart(2, '0')

/** An ISO instant as a Dhaka wall-clock reading ('YYYY-MM-DD HH:mm'), the shape the audit trail uses. */
export function stampDhaka(iso: string): string {
  const d = new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** The Dhaka billing month an ISO instant falls in. */
export const periodOf = (iso: string): Period => stampDhaka(iso).slice(0, 7)

/** 'YYYY-MM-DD HH:mm' (Dhaka) for now. */
export const stampNow = (now = new Date()): string => stampDhaka(now.toISOString())

/** The current Dhaka billing month. */
export const currentPeriod = (now = new Date()): Period => periodOf(now.toISOString())

/** Disputes are accepted this many days after approval (PRD R27; contract check pending, Q7). */
export const DISPUTE_WINDOW_DAYS = 30

/** 'YYYY-MM-DD HH:mm' of approval -> 'YYYY-MM-DD', the last day a dispute is accepted. */
export function disputeWindowEnd(finalizedAt: string): string {
  const [y, m, d] = finalizedAt.slice(0, 10).split('-').map(Number)
  const end = new Date(y, m - 1, d + DISPUTE_WINDOW_DAYS)
  return `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`
}

/** Approved statements of an institution for months before `period`, oldest first. */
export function earlierStatements(data: BillingData, institutionId: string, period: Period): { period: Period; total: number }[] {
  return data.periods
    .filter((p) => p < period && data.periodMeta[p].status === 'Finalized')
    .flatMap((p) => {
      const s = buildStatement(data, institutionId, p)
      return s ? [{ period: p, total: s.total }] : []
    })
}

/** Every statement an institution has, newest month first. Months without usage or a rate card have none. */
export function institutionStatements(data: BillingData, institutionId: string): Statement[] {
  return [...data.periods]
    .reverse()
    .flatMap((p) => {
      const s = buildStatement(data, institutionId, p)
      return s ? [s] : []
    })
}

const csvCell = (value: string | number | boolean) => {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csv = (rows: (string | number | boolean)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

/** One statement's line items, the file Finance attaches to the invoice. */
export function statementToCsv(statement: Statement, nameOf: (id: string) => string): string {
  return csv([
    ['period', 'institution', 'line', 'quantity', 'rate', 'amount', 'currency'],
    [statement.period, nameOf(statement.institutionId), 'Static generation', statement.counts.staticGenerations, statement.rate.generationRate, statement.staticGenerationAmount, 'BDT'],
    [statement.period, nameOf(statement.institutionId), 'Dynamic generation', statement.counts.dynamicGenerations, statement.rate.generationRate, statement.dynamicGenerationAmount, 'BDT'],
    [statement.period, nameOf(statement.institutionId), 'Validation (conclusive)', statement.counts.validations, statement.rate.validationRate, statement.validationAmount, 'BDT'],
    ...statement.adjustments.map((a) => [statement.period, nameOf(statement.institutionId), `Adjustment: ${a.reason}`, 1, '', a.amount, 'BDT'] as (string | number)[]),
    [statement.period, nameOf(statement.institutionId), 'TOTAL', '', '', statement.total, 'BDT'],
  ])
}
