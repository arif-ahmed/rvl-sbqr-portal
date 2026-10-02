import type { Meter } from '../usage/usage'

/**
 * The billing domain, mirroring the API's rules (docs/features/metering-billing): a Dhaka month
 * per institution, usage × the rate card in effect, adjustments applied on finalize, amounts
 * rounded once per line. Statements are billing records, never tax invoices.
 */

/** 'YYYY-MM'. */
export type Period = string
export type PeriodStatus = 'Draft' | 'Finalized'

export type BillingPeriodMeta = {
  period: Period
  status: PeriodStatus
  /** Finalized only: who approved the month and when. */
  finalizedBy?: string
  /** 'YYYY-MM-DD HH:mm'. */
  finalizedAt?: string
  /** Draft only: when the statements were last recalculated. */
  calculatedAt?: string
}

export type UsageCounts = { staticGenerations: number; dynamicGenerations: number; validations: number }

/** What a statement needs to know about a rate card; the API's card satisfies this shape. */
export type RateCardSnapshot = {
  institutionId: string
  /** 'YYYY-MM-01'. */
  effectiveFrom: string
  generationRate: number
  validationRate: number
}

export type Adjustment = {
  id: string
  institutionId: string
  period: Period
  /** Non-zero. Negative is a credit for the institution. */
  amount: number
  reason: string
  status: 'Pending' | 'Applied'
  createdBy: string
  /** 'YYYY-MM-DD HH:mm'. */
  createdAt: string
}

/** An outbox message whose usage event has not been recorded yet. */
export type OutboxEvent = {
  id: string
  institutionId: string
  period: Period
  meter: Meter
  /** 'YYYY-MM-DD HH:mm'. */
  occurredAt: string
  status: 'Queued' | 'Delivered'
}

export type BillingInstitution = { id: string; name: string; code: string }

export type BillingData = {
  /** Oldest first. */
  periods: Period[]
  periodMeta: Record<Period, BillingPeriodMeta>
  institutions: BillingInstitution[]
  rateCards: RateCardSnapshot[]
  /** Per institution, per period; absent means no usage that month. */
  counts: Record<string, Partial<Record<Period, UsageCounts>>>
  adjustments: Adjustment[]
  outbox: OutboxEvent[]
}

export type FinalizeOutcome = 'Finalized' | 'AlreadyFinalized' | 'UsageNotComplete' | 'DraftChanged'

/**
 * Round to 2 dp, half away from zero — the API's rule, applied exactly once per statement line.
 * toPrecision(15) first so products like 15341 × 0.125 × 100 land on the decimal they mean.
 */
export function round2(amount: number): number {
  const scaled = Number((Math.abs(amount) * 100).toPrecision(15))
  return (Math.sign(amount) * Math.round(scaled)) / 100
}

/** The card a period is priced with: the latest one that has started by then. */
export function rateCardFor<T extends RateCardSnapshot>(cards: T[], institutionId: string, period: Period): T | null {
  return (
    cards
      .filter((c) => c.institutionId === institutionId && c.effectiveFrom.slice(0, 7) <= period)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? null
  )
}

/** A month can only close when every usage event has been recorded. */
export const usageComplete = (outbox: OutboxEvent[], period: Period) =>
  !outbox.some((e) => e.period === period && e.status === 'Queued')

const queuedFor = (outbox: OutboxEvent[], institutionId: string, period: Period) =>
  outbox.filter((e) => e.institutionId === institutionId && e.period === period && e.status === 'Queued').length

export type Statement = {
  institutionId: string
  period: Period
  counts: UsageCounts
  rate: { generationRate: number; validationRate: number; effectiveFrom: string }
  staticGenerationAmount: number
  dynamicGenerationAmount: number
  validationAmount: number
  subtotal: number
  /** Pending and applied, for this institution and period. */
  adjustments: Adjustment[]
  adjustmentsTotal: number
  /** May be negative: a credit the institution carries into Finance's invoice. */
  total: number
  queuedEvents: number
}

/**
 * One institution's month. Null when there is no usage or no card in effect: the usage is
 * recorded but the institution is not billable, so no statement exists.
 */
export function buildStatement(data: BillingData, institutionId: string, period: Period): Statement | null {
  const counts = data.counts[institutionId]?.[period]
  const card = rateCardFor(data.rateCards, institutionId, period)
  if (!counts || !card) return null
  const staticGenerationAmount = round2(counts.staticGenerations * card.generationRate)
  const dynamicGenerationAmount = round2(counts.dynamicGenerations * card.generationRate)
  const validationAmount = round2(counts.validations * card.validationRate)
  const subtotal = round2(staticGenerationAmount + dynamicGenerationAmount + validationAmount)
  const adjustments = data.adjustments.filter((a) => a.institutionId === institutionId && a.period === period)
  const adjustmentsTotal = round2(adjustments.reduce((sum, a) => sum + a.amount, 0))
  return {
    institutionId,
    period,
    counts,
    rate: { generationRate: card.generationRate, validationRate: card.validationRate, effectiveFrom: card.effectiveFrom },
    staticGenerationAmount,
    dynamicGenerationAmount,
    validationAmount,
    subtotal,
    adjustments,
    adjustmentsTotal,
    total: round2(subtotal + adjustmentsTotal),
    queuedEvents: queuedFor(data.outbox, institutionId, period),
  }
}

export type PeriodTotals = {
  statements: Statement[]
  counts: UsageCounts
  subtotal: number
  adjustmentsTotal: number
  total: number
}

export function periodTotals(data: BillingData, period: Period): PeriodTotals {
  const statements = data.institutions
    .map((i) => buildStatement(data, i.id, period))
    .filter((s): s is Statement => s !== null)
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

export const queuedEvents = (data: BillingData, period?: Period) =>
  data.outbox.filter((e) => e.status === 'Queued' && (!period || e.period === period))

/** What the Overview calls "open items": everything that blocks a quiet month close. */
export const openIssues = (data: BillingData) => queuedEvents(data).length + pendingAdjustments(data).length

export const draftPeriod = (data: BillingData) => [...data.periods].reverse().find((p) => data.periodMeta[p].status === 'Draft') ?? null

/** The month after a period, e.g. '2026-09' -> '2026-10'. */
export function monthAfter(period: Period): Period {
  const [year, month] = period.split('-').map(Number)
  const next = new Date(year, month, 1)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

/** 'YYYY-MM-DD HH:mm' in local time, the shape the seeds and audit trail use. */
export function stampNow(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`
}

/** Disputes are accepted this many days after approval (PRD R27; contract check pending, Q7). */
export const DISPUTE_WINDOW_DAYS = 30

/** 'YYYY-MM-DD HH:mm' of approval -> 'YYYY-MM-DD', the last day a dispute is accepted. */
export function disputeWindowEnd(finalizedAt: string): string {
  const [y, m, d] = finalizedAt.slice(0, 10).split('-').map(Number)
  const end = new Date(y, m - 1, d + DISPUTE_WINDOW_DAYS)
  const pad = (n: number) => String(n).padStart(2, '0')
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

const csvCell =(value: string | number | boolean) => {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csv = (rows: (string | number | boolean)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\n')

/** One row per institution, matching the API's statements.csv columns. Pure, so tests need no download. */
export function statementsToCsv(data: BillingData, period: Period, nameOf: (id: string) => string): string {
  const totals = periodTotals(data, period)
  return csv([
    ['period', 'institution', 'static_generations', 'dynamic_generations', 'validations', 'subtotal', 'adjustments', 'total', 'currency'],
    ...totals.statements.map((s) => [
      period,
      nameOf(s.institutionId),
      s.counts.staticGenerations,
      s.counts.dynamicGenerations,
      s.counts.validations,
      s.subtotal,
      s.adjustmentsTotal,
      s.total,
      'BDT',
    ]),
  ])
}

/** Billable counts per meter, matching the API's usage.csv columns. */
export function usageToCsv(data: BillingData, period: Period, nameOf: (id: string) => string): string {
  const totals = periodTotals(data, period)
  return csv([
    ['period', 'institution', 'meter', 'billable_count'],
    ...totals.statements.flatMap((s) => [
      [period, nameOf(s.institutionId), 'GENERATION_STATIC', s.counts.staticGenerations],
      [period, nameOf(s.institutionId), 'GENERATION_DYNAMIC', s.counts.dynamicGenerations],
      [period, nameOf(s.institutionId), 'VALIDATION', s.counts.validations],
    ]),
  ])
}

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
