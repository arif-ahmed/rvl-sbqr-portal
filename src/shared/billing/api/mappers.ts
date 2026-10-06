import {
  currentPeriod,
  monthAfter,
  periodOf,
  stampDhaka,
  type Adjustment,
  type BillingData,
  type BillingInstitution,
  type BillingPeriodMeta,
  type OutboxEvent,
  type Period,
  type PeriodStatus,
  type Statement,
} from '../billing'
import { countsByPeriod, volumeOf } from '../../usage/api/mappers'
import type { UsageDayDto } from '../../usage/api/types'
import type { AdjustmentDto, BillingPeriodDto, OutboxBacklogDto, PeriodSummaryDto, StatementDto, TenantStatementDto } from './types'

const meterOf = (code: string | null) => code ?? ''

/** What a statement needs from the rest of the world to look complete. */
export type StatementContext = {
  period: Period
  finalized: boolean
  /** Adjustment id -> who recorded it and when; the statement line only carries the reason. */
  adjustmentsById: Map<string, AdjustmentDto>
  /** Rate card id -> 'YYYY-MM-01', when known. */
  rateCardStart: (rateCardId: string) => string | undefined
}

/** Wire statement -> UI statement. Counts and amounts come from the USAGE lines the server wrote. */
export function toStatement(dto: StatementDto, ctx: StatementContext): Statement {
  const usage = (meter: string) => dto.lines.filter((l) => l.lineType === 'USAGE' && meterOf(l.meterCode) === meter)
  const qty = (meter: string) => usage(meter).reduce((t, l) => t + l.quantity, 0)
  const amount = (meter: string) => usage(meter).reduce((t, l) => t + l.amount, 0)
  const adjustments: Adjustment[] = dto.lines
    .filter((l) => l.lineType === 'ADJUSTMENT')
    .map((l) => {
      const source = l.adjustmentId ? ctx.adjustmentsById.get(l.adjustmentId) : undefined
      return {
        id: l.adjustmentId ?? `line-${l.lineNo}`,
        institutionId: dto.tenantId,
        period: ctx.period,
        amount: l.amount,
        reason: l.description,
        status: ctx.finalized ? 'Applied' : 'Pending',
        createdBy: source?.createdBy ?? '',
        createdAt: source?.createdAt ? stampDhaka(source.createdAt) : '',
      }
    })
  return {
    institutionId: dto.tenantId,
    period: ctx.period,
    counts: { staticGenerations: qty('GENERATION_STATIC'), dynamicGenerations: qty('GENERATION_DYNAMIC'), validations: qty('VALIDATION') },
    rate: { generationRate: dto.generationRate, validationRate: dto.validationRate, effectiveFrom: ctx.rateCardStart(dto.rateCardId) },
    staticGenerationAmount: amount('GENERATION_STATIC'),
    dynamicGenerationAmount: amount('GENERATION_DYNAMIC'),
    validationAmount: amount('VALIDATION'),
    subtotal: dto.subtotal,
    adjustments,
    adjustmentsTotal: dto.adjustmentsTotal,
    total: dto.total,
  }
}

const statusOf = (dto: BillingPeriodDto): PeriodStatus => (dto.provisional || dto.status === 'PROVISIONAL' ? 'Provisional' : dto.status === 'FINALIZED' ? 'Finalized' : 'Draft')

export function toPeriodMeta(dto: BillingPeriodDto): BillingPeriodMeta {
  const status = statusOf(dto)
  const latestCalc = dto.statements.map((s) => s.calculatedAt).sort().at(-1) ?? dto.draftedAt
  return {
    period: dto.period,
    status,
    ...(status === 'Finalized' && dto.finalizedAt ? { finalizedAt: stampDhaka(dto.finalizedAt) } : {}),
    ...(status === 'Finalized' && dto.finalizedBy ? { finalizedBy: dto.finalizedBy } : {}),
    ...(status === 'Draft' && latestCalc ? { calculatedAt: stampDhaka(latestCalc) } : {}),
  }
}

export function toOutboxEvent(item: OutboxBacklogDto['items'][number]): OutboxEvent {
  return {
    id: item.outboxMessageId,
    eventType: item.eventType === 'QrGenerated' ? 'QrGenerated' : 'QrValidated',
    period: periodOf(item.occurredAt),
    occurredAt: stampDhaka(item.occurredAt),
    status: item.status === 'DEAD' ? 'Dead' : 'Pending',
    attempts: item.attempts,
    lastError: item.lastError,
  }
}

/**
 * The months the Periods screen offers: every stored month plus the months still open after the newest
 * one, up to the current Dhaka month. Open months are PROVISIONAL until someone drafts them; with
 * nothing stored yet the previous and current month are offered.
 */
export function offeredPeriods(stored: PeriodSummaryDto[], now = new Date()): Period[] {
  const current = currentPeriod(now)
  const known = stored.map((p) => p.period).sort()
  const latest = known.at(-1)
  const open: Period[] = []
  if (latest) {
    for (let p = monthAfter(latest); p <= current && open.length < 24; p = monthAfter(p)) open.push(p)
  } else {
    const [y, m] = current.split('-').map(Number)
    const previous = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
    open.push(previous, current)
  }
  return [...known, ...open]
}

export type AssembleInput = {
  institutions: BillingInstitution[]
  /** One response per offered period (the order of `offered`). */
  periods: BillingPeriodDto[]
  adjustments: AdjustmentDto[]
  outbox: OutboxBacklogDto
  /** Daily usage over the offered months; what has usage but no statement is reported as unbilled. */
  usageDays: UsageDayDto[]
  rateCardStart: (rateCardId: string) => string | undefined
}

/** Everything the staff billing screens read, assembled from the API's responses. */
export function assembleBillingData({ institutions, periods, adjustments, outbox, usageDays, rateCardStart }: AssembleInput): BillingData {
  const sorted = [...periods].sort((a, b) => a.period.localeCompare(b.period))
  const adjustmentsById = new Map(adjustments.map((a) => [a.adjustmentId, a]))
  const periodMeta: Record<Period, BillingPeriodMeta> = {}
  const statements: BillingData['statements'] = {}
  // Which month settled each applied adjustment, from the statement lines that carry it.
  const appliedIn = new Map<string, Period>()

  for (const dto of sorted) {
    const meta = toPeriodMeta(dto)
    periodMeta[dto.period] = meta
    const ctx: StatementContext = { period: dto.period, finalized: meta.status === 'Finalized', adjustmentsById, rateCardStart }
    statements[dto.period] = Object.fromEntries(dto.statements.map((s) => [s.tenantId, toStatement(s, ctx)]))
    if (meta.status === 'Finalized') {
      for (const s of dto.statements) for (const l of s.lines) if (l.adjustmentId) appliedIn.set(l.adjustmentId, dto.period)
    }
  }

  // A Pending adjustment lands on the oldest month that is not finalized yet.
  const open = sorted.find((p) => periodMeta[p.period].status !== 'Finalized')?.period ?? currentPeriod()
  const fallback = sorted.filter((p) => periodMeta[p.period].status === 'Finalized').at(-1)?.period ?? open

  const unbilled: BillingData['unbilled'] = {}
  for (const [period, byInstitution] of Object.entries(countsByPeriod(usageDays))) {
    for (const [id, counts] of Object.entries(byInstitution)) {
      if (statements[period]?.[id] || volumeOf(counts) === 0) continue
      ;(unbilled[period] ??= {})[id] = volumeOf(counts)
    }
  }

  return {
    periods: sorted.map((p) => p.period),
    periodMeta,
    institutions,
    statements,
    unbilled,
    adjustments: adjustments.map((a) => toAdjustment(a, a.appliedStatementId ? (appliedIn.get(a.adjustmentId) ?? fallback) : open)),
    outbox: outbox.items.map(toOutboxEvent),
  }
}

export function toAdjustment(dto: AdjustmentDto, period: Period): Adjustment {
  return {
    id: dto.adjustmentId,
    institutionId: dto.tenantId,
    period,
    amount: dto.amount,
    reason: dto.reason,
    status: dto.appliedStatementId ? 'Applied' : 'Pending',
    createdBy: dto.createdBy,
    createdAt: dto.createdAt ? stampDhaka(dto.createdAt) : '',
  }
}

/** A finalized statement of one FI as the FI portal reads it, in the shape the shared screens use. */
export function toTenantStatement(dto: TenantStatementDto, rateCardStart: (id: string) => string | undefined = () => undefined): Statement {
  return toStatement(dto.statement, {
    period: dto.period,
    finalized: dto.status === 'FINALIZED',
    adjustmentsById: new Map(),
    rateCardStart,
  })
}

export type FiAssembleInput = {
  tenantId: string
  /** The name the statement is addressed to. The API does not return a profile yet, so this is the sign-in identity. */
  name: string
  statements: TenantStatementDto[]
  usageDays: UsageDayDto[]
  now?: Date
}

/**
 * What the FI portal reads: the institution's finalized statements plus its usage. A month with usage but no
 * finalized statement is 'Draft' here (still open, or awaiting RVL's finalize); an FI never sees a draft's figures.
 */
export function assembleFiData({ tenantId, name, statements, usageDays, now = new Date() }: FiAssembleInput): { billing: BillingData; usage: ReturnType<typeof countsByPeriod> } {
  const usage = countsByPeriod(usageDays)
  const periods = [...new Set([...statements.map((s) => s.period), ...Object.keys(usage), currentPeriod(now)])].sort()
  const periodMeta: BillingData['periodMeta'] = {}
  const byPeriod: BillingData['statements'] = {}
  const adjustments: Adjustment[] = []
  for (const p of periods) {
    const dto = statements.find((s) => s.period === p)
    periodMeta[p] = dto ? { period: p, status: 'Finalized', ...(dto.finalizedAt ? { finalizedAt: stampDhaka(dto.finalizedAt) } : {}) } : { period: p, status: 'Draft' }
    if (dto) {
      const statement = toTenantStatement(dto)
      byPeriod[p] = { [tenantId]: statement }
      adjustments.push(...statement.adjustments)
    }
  }
  return {
    billing: { periods, periodMeta, institutions: [{ id: tenantId, name, code: '' }], statements: byPeriod, adjustments, outbox: [], unbilled: {} },
    usage,
  }
}
