import { currentPeriod, round2, stampDhaka } from '../shared/billing/billing'
import type { AdjustmentDto, BillingPeriodDto, OutboxBacklogDto, StatementDto, StatementLineDto, TenantStatementDto } from '../shared/billing/api/types'
import type { UsageDayDto, UsageEventDto } from '../shared/usage/api/types'

// An in-memory stand-in for the billing and usage endpoints of rvl-secure-bqr-manager
// (Billing: PeriodsController, AdjustmentsController, UsageController, TenantBillingController;
// Metering: OutboxController). It follows the real rules: a statement per tenant with a rate card in
// effect, usage priced per meter, pending adjustments on the draft, USAGE_NOT_COMPLETE while the outbox
// has messages, DRAFT_CHANGED when the expected total is stale. Tests seed usage, adjustments and the
// outbox directly and then drive the screens through the real client.

type Card = { rateCardId: string; effectiveFrom: string; generationRate: number; validationRate: number }
type StoredPeriod = { status: 'DRAFT' | 'FINALIZED'; draftedAt: string; finalizedAt: string | null; finalizedBy: string | null; statements: StatementDto[] }
type Stored = AdjustmentDto
/** A usage event with its Dhaka day and month worked out once: the scenarios seed hundreds of thousands of them. */
type UsageRow = UsageEventDto & { day: string; period: string }

const problem = (status: number, title: string, detail: string, code?: string) =>
  Response.json({ title, detail, status, ...(code ? { code } : {}) }, { status })

let ids = 0
const uuid = (prefix: string) => `${prefix}-${String(++ids).padStart(4, '0')}`
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/

export class FakeBilling {
  usage: UsageRow[] = []
  adjustments: Stored[] = []
  outbox: OutboxBacklogDto['items'] = []
  periods = new Map<string, StoredPeriod>()
  /** The tenant an FI token belongs to, when the backend is installed as that FI. */
  fiTenantId: string | null = null

  private cardsFor: (tenantId: string) => Card[]
  private tenantIds: () => string[]
  private now: () => Date

  constructor(cardsFor: (tenantId: string) => Card[], tenantIds: () => string[], now: () => Date) {
    this.cardsFor = cardsFor
    this.tenantIds = tenantIds
    this.now = now
  }

  // ---------------------------------------------------------------- seeding helpers for tests

  addUsage(tenantId: string, meterCode: 'GENERATION_STATIC' | 'GENERATION_DYNAMIC' | 'VALIDATION', occurredAt: string, opts: { billable?: boolean; verdict?: string; ref?: string } = {}) {
    const stamp = stampDhaka(occurredAt)
    const event: UsageRow = {
      day: stamp.slice(0, 10),
      period: stamp.slice(0, 7),
      usageEventId: uuid('ue'),
      tenantId,
      meterCode,
      billable: opts.billable ?? true,
      verdict: meterCode === 'VALIDATION' ? (opts.verdict ?? 'VALID') : null,
      clientReference: opts.ref ?? `REF-${ids}`,
      occurredAt,
    }
    this.usage.push(event)
    return event
  }

  /** `count` billable events spread over a month (all on the 10th Dhaka time, which is safe from boundaries). */
  addUsageCounts(tenantId: string, period: string, counts: { staticGenerations?: number; dynamicGenerations?: number; validations?: number }) {
    const at = `${period}-10T04:00:00+00:00`
    for (let i = 0; i < (counts.staticGenerations ?? 0); i++) this.addUsage(tenantId, 'GENERATION_STATIC', at)
    for (let i = 0; i < (counts.dynamicGenerations ?? 0); i++) this.addUsage(tenantId, 'GENERATION_DYNAMIC', at)
    for (let i = 0; i < (counts.validations ?? 0); i++) this.addUsage(tenantId, 'VALIDATION', at)
  }

  addAdjustment(tenantId: string, amount: number, reason: string, createdBy = 'platform:admin') {
    const adj: Stored = { adjustmentId: uuid('adj'), tenantId, amount, reason, createdBy, createdAt: this.now().toISOString(), appliedStatementId: null }
    this.adjustments.push(adj)
    return adj
  }

  addOutbox(status: 'PENDING' | 'DEAD', occurredAt: string, eventType = 'QrValidated') {
    const item = { outboxMessageId: uuid('ob'), eventType, status, attempts: status === 'DEAD' ? 10 : 1, occurredAt, nextAttemptAt: occurredAt, lastError: status === 'DEAD' ? 'handler failed' : null }
    this.outbox.push(item)
    return item
  }

  /** Put a month straight into a stored state, as the server would after drafting or finalizing it. */
  setPeriod(period: string, status: 'DRAFT' | 'FINALIZED', finalizedBy = 'platform:admin') {
    const statements = this.liveStatements(period)
    if (status === 'FINALIZED') this.settleAdjustments(statements)
    this.periods.set(period, {
      status,
      draftedAt: `${period}-28T10:00:00+00:00`,
      finalizedAt: status === 'FINALIZED' ? afterMonthEnd(period) : null,
      finalizedBy: status === 'FINALIZED' ? finalizedBy : null,
      statements,
    })
  }

  // ---------------------------------------------------------------- the rules

  private billable(tenantId: string, period: string) {
    return this.usage.filter((e) => e.tenantId === tenantId && e.billable && e.period === period)
  }

  private liveStatements(period: string): StatementDto[] {
    const out: StatementDto[] = []
    for (const tenantId of [...this.tenantIds()].sort()) {
      const card = this.cardsFor(tenantId)
        .filter((c) => c.effectiveFrom.slice(0, 7) <= period)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
      if (!card) continue
      const events = this.billable(tenantId, period)
      const qty = (m: string) => events.filter((e) => e.meterCode === m).length
      const usageLine = (lineNo: number, meterCode: string, rate: number, description: string): StatementLineDto => ({
        lineNo,
        lineType: 'USAGE',
        meterCode,
        adjustmentId: null,
        description,
        quantity: qty(meterCode),
        unitRate: rate,
        amount: round2(qty(meterCode) * rate),
      })
      const lines: StatementLineDto[] = [
        usageLine(1, 'GENERATION_STATIC', card.generationRate, 'Static QR generation'),
        usageLine(2, 'GENERATION_DYNAMIC', card.generationRate, 'Dynamic QR generation'),
        usageLine(3, 'VALIDATION', card.validationRate, 'QR validation'),
      ]
      const pending = this.adjustments.filter((a) => a.tenantId === tenantId && a.appliedStatementId === null)
      pending.forEach((a, i) => lines.push({ lineNo: 4 + i, lineType: 'ADJUSTMENT', meterCode: null, adjustmentId: a.adjustmentId, description: a.reason, quantity: 1, unitRate: a.amount, amount: a.amount }))
      const subtotal = round2(lines.filter((l) => l.lineType === 'USAGE').reduce((t, l) => t + l.amount, 0))
      const adjustmentsTotal = round2(pending.reduce((t, a) => t + a.amount, 0))
      out.push({
        tenantId,
        rateCardId: card.rateCardId,
        generationRate: card.generationRate,
        validationRate: card.validationRate,
        lines,
        subtotal,
        adjustmentsTotal,
        total: round2(subtotal + adjustmentsTotal),
        currency: 'BDT',
        calculatedAt: this.now().toISOString(),
      })
    }
    return out
  }

  private settleAdjustments(statements: StatementDto[]) {
    let applied = 0
    for (const s of statements)
      for (const l of s.lines)
        if (l.adjustmentId) {
          const adj = this.adjustments.find((a) => a.adjustmentId === l.adjustmentId)
          if (adj && !adj.appliedStatementId) {
            adj.appliedStatementId = `stmt-${s.tenantId}`
            applied++
          }
        }
    return applied
  }

  private view(period: string): BillingPeriodDto {
    const stored = this.periods.get(period)
    const statements = stored ? stored.statements : this.liveStatements(period)
    return {
      period,
      status: stored ? stored.status : 'PROVISIONAL',
      provisional: !stored,
      draftedAt: stored?.draftedAt ?? null,
      finalizedAt: stored?.finalizedAt ?? null,
      finalizedBy: stored?.finalizedBy ?? null,
      statements,
      grandTotal: round2(statements.reduce((t, s) => t + s.total, 0)),
    }
  }

  private previous(period: string) {
    const [y, m] = period.split('-').map(Number)
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
  }

  // ---------------------------------------------------------------- routing

  /** Null when the path is not a billing or usage route. */
  handle(method: string, pathname: string, params: URLSearchParams, body: { [k: string]: unknown }): Response | null {
    const admin = '/v1/admin/billing'
    if (pathname === `${admin}/periods` && method === 'GET') return Response.json([...this.periods.entries()].sort(([a], [b]) => b.localeCompare(a)).map(([p, s]) => this.summary(p, s)))

    const per = pathname.match(/^\/v1\/admin\/billing\/periods\/([^/]+)(?:\/(.*))?$/)
    if (per) return this.periodRoute(method, per[1], per[2] ?? '', params, body)

    if (pathname === `${admin}/adjustments`) {
      if (method === 'GET') {
        const tenantId = params.get('tenantId')
        const pending = params.get('pending')
        return Response.json(this.adjustments.filter((a) => (!tenantId || a.tenantId === tenantId) && (pending === null || (a.appliedStatementId === null) === (pending === 'true'))))
      }
      if (method === 'POST') {
        const tenantId = String(body.tenantId ?? '')
        const amount = Number(body.amount)
        if (!this.tenantIds().includes(tenantId) || !amount || !String(body.reason ?? '').trim()) return problem(400, 'Invalid adjustment', 'tenantId, a non-zero amount and a reason are required.')
        return Response.json(this.addAdjustment(tenantId, amount, String(body.reason), String(body.createdBy ?? 'platform:admin')), { status: 201 })
      }
    }

    if (pathname === '/v1/admin/outbox' && method === 'GET') {
      const status = params.get('status')?.toUpperCase()
      const items = this.outbox.filter((o) => !status || o.status === status)
      return Response.json({ items, pendingCount: this.outbox.filter((o) => o.status === 'PENDING').length, deadCount: this.outbox.filter((o) => o.status === 'DEAD').length } satisfies OutboxBacklogDto)
    }
    const requeue = pathname.match(/^\/v1\/admin\/outbox\/([^/]+)\/requeue$/)
    if (requeue && method === 'POST') {
      const item = this.outbox.find((o) => o.outboxMessageId === requeue[1] && o.status === 'DEAD')
      if (!item) return problem(404, 'Dead-lettered message not found', 'No dead-lettered message with that id.')
      // The dispatcher delivers a requeued message: it becomes a usage row and leaves the backlog.
      this.outbox = this.outbox.filter((o) => o !== item)
      return Response.json({ outboxMessageId: item.outboxMessageId, status: 'PENDING' })
    }

    if (pathname === `${admin}/usage` && method === 'GET') return this.usagePage(params, params.get('tenantId'))
    if (pathname === `${admin}/usage/summary` && method === 'GET') return this.usageSummary(params, params.get('tenantId'))

    // FI routes: the tenant is the token's, never a parameter.
    if (pathname.startsWith('/v1/billing/')) {
      if (!this.fiTenantId) return problem(403, 'Forbidden', 'This token carries no tenant.')
      if (pathname === '/v1/billing/statements' && method === 'GET') return Response.json(this.fiStatements())
      const one = pathname.match(/^\/v1\/billing\/statements\/([^/]+)$/)
      if (one && method === 'GET') {
        const found = this.fiStatements().find((s) => s.period === one[1])
        return found ? Response.json(found) : problem(404, 'Statement request failed', 'No statement for that month.')
      }
      if (pathname === '/v1/billing/usage' && method === 'GET') return this.usagePage(params, this.fiTenantId)
      if (pathname === '/v1/billing/usage/summary' && method === 'GET') return this.usageSummary(params, this.fiTenantId)
    }
    return null
  }

  private summary(period: string, s: StoredPeriod) {
    return {
      period,
      status: s.status,
      draftedAt: s.draftedAt,
      finalizedAt: s.finalizedAt,
      finalizedBy: s.finalizedBy,
      statementCount: s.statements.length,
      grandTotal: round2(s.statements.reduce((t, x) => t + x.total, 0)),
    }
  }

  private periodRoute(method: string, period: string, sub: string, params: URLSearchParams, body: { [k: string]: unknown }): Response {
    if (!PERIOD.test(period)) return problem(404, 'Billing period not found', "'Period' must be a billing month in the form YYYY-MM.")
    if (sub === '' && method === 'GET') return Response.json(this.view(period))

    const stored = this.periods.get(period)
    if (sub === 'statements.csv' && method === 'GET') {
      const rows = (stored?.statements ?? []).flatMap((s) => s.lines.map((l) => [period, s.tenantId, l.lineType, l.meterCode ?? '', l.description, l.quantity, l.unitRate, l.amount].join(',')))
      return new Response(`period,tenant,line_type,meter,description,quantity,unit_rate,amount\n${rows.join('\n')}`, { headers: { 'Content-Type': 'text/csv' } })
    }
    if (sub === 'usage.csv' && method === 'GET') {
      const tenantId = params.get('tenantId')
      if (!tenantId) return problem(400, 'Invalid usage export request', 'tenantId must not be empty.')
      const events = this.usage.filter((e) => e.tenantId === tenantId && e.period === period && (params.get('all') === 'true' || e.billable))
      return new Response(`event_id,meter,billable\n${events.map((e) => [e.usageEventId, e.meterCode, e.billable].join(',')).join('\n')}`, { headers: { 'Content-Type': 'text/csv' } })
    }
    const stmt = sub.match(/^statements\/([^/]+)$/)
    if (stmt && method === 'GET') {
      const s = stored?.statements.find((x) => x.tenantId === stmt[1])
      return stored && s ? Response.json({ period, status: stored.status, finalizedAt: stored.finalizedAt, statement: s } satisfies TenantStatementDto) : problem(404, 'Statement not found', 'No statement for that month.')
    }

    if (sub === 'draft' && method === 'POST') {
      if (stored) return Response.json(this.view(period))
      if (period >= currentPeriod(this.now())) return problem(409, 'Billing period conflict', `${period} has not ended yet.`, 'GRACE_NOT_OVER')
      if (this.periods.size > 0 && this.periods.get(this.previous(period))?.status !== 'FINALIZED') return problem(409, 'Billing period conflict', `${this.previous(period)} is not finalized.`, 'PREVIOUS_PERIOD_NOT_FINALIZED')
      if (this.outbox.length > 0) return problem(409, 'Billing period conflict', 'Usage events are still outstanding.', 'USAGE_NOT_COMPLETE')
      this.periods.set(period, { status: 'DRAFT', draftedAt: this.now().toISOString(), finalizedAt: null, finalizedBy: null, statements: this.liveStatements(period) })
      return Response.json(this.view(period), { status: 201 })
    }
    if (sub === 'recalculate' && method === 'POST') {
      if (!stored) return problem(404, 'Billing period not found', `${period} has no draft.`)
      if (stored.status === 'FINALIZED') return problem(409, 'Billing period conflict', `${period} is finalized.`, 'PERIOD_FINALIZED')
      stored.statements = this.liveStatements(period)
      return Response.json(this.view(period))
    }
    if (sub === 'finalize' && method === 'POST') {
      if (!stored) return problem(404, 'Billing period not found', `${period} has no draft.`)
      if (stored.status === 'FINALIZED') return Response.json({ alreadyFinalized: true, appliedAdjustmentCount: 0, period: this.view(period) })
      if (this.outbox.length > 0) return problem(409, 'Billing period finalize refused', 'Usage events are still outstanding.', 'USAGE_NOT_COMPLETE')
      const fresh = this.liveStatements(period)
      const freshTotal = round2(fresh.reduce((t, s) => t + s.total, 0))
      const storedTotal = round2(stored.statements.reduce((t, s) => t + s.total, 0))
      if (Number(body.expectedTotal) !== freshTotal || storedTotal !== freshTotal) {
        stored.statements = fresh
        return problem(409, 'Billing period finalize refused', 'The draft changed; it was rebuilt.', 'DRAFT_CHANGED')
      }
      stored.status = 'FINALIZED'
      stored.finalizedAt = this.now().toISOString()
      stored.finalizedBy = String(body.finalizedBy ?? '')
      const applied = this.settleAdjustments(stored.statements)
      return Response.json({ alreadyFinalized: false, appliedAdjustmentCount: applied, period: this.view(period) })
    }
    return problem(404, 'Not found', `${method} periods/${period}/${sub} is not part of the fake API.`)
  }

  private fiStatements(): TenantStatementDto[] {
    return [...this.periods.entries()]
      .filter(([, p]) => p.status === 'FINALIZED')
      .flatMap(([period, p]) => {
        const s = p.statements.find((x) => x.tenantId === this.fiTenantId)
        return s ? [{ period, status: 'FINALIZED' as const, finalizedAt: p.finalizedAt, statement: s }] : []
      })
      .sort((a, b) => b.period.localeCompare(a.period))
  }

  private inRange(e: UsageRow, params: URLSearchParams) {
    return e.day >= (params.get('from') ?? '') && e.day <= (params.get('to') ?? '')
  }

  private usagePage(params: URLSearchParams, tenantId: string | null): Response {
    if (!params.get('from') || !params.get('to')) return problem(400, 'Invalid usage request', "'from' and 'to' (yyyy-MM-dd) are required.")
    const meter = params.get('meter')
    const billable = params.get('billable')
    const all = this.usage
      .filter((e) => (!tenantId || e.tenantId === tenantId) && this.inRange(e, params) && (!meter || e.meterCode === meter) && (billable === null || e.billable === (billable === 'true')))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.usageEventId.localeCompare(a.usageEventId))
    const size = Number(params.get('pageSize') ?? 50)
    const offset = Number(params.get('cursor') ? atob(params.get('cursor')!) : 0)
    const items = all.slice(offset, offset + size).map(({ day: _day, period: _period, ...event }) => event)
    const next = offset + size < all.length ? btoa(String(offset + size)) : null
    return Response.json({ items, nextCursor: next })
  }

  private usageSummary(params: URLSearchParams, tenantId: string | null): Response {
    if (!params.get('from') || !params.get('to')) return problem(400, 'Invalid usage request', "'from' and 'to' (yyyy-MM-dd) are required.")
    const groups = new Map<string, UsageDayDto>()
    for (const e of this.usage) {
      if ((tenantId && e.tenantId !== tenantId) || !this.inRange(e, params)) continue
      const key = [e.day, e.tenantId, e.meterCode, e.billable].join('|')
      const row = groups.get(key) ?? { day: e.day, tenantId: e.tenantId, meterCode: e.meterCode, billable: e.billable, count: 0 }
      row.count++
      groups.set(key, row)
    }
    return Response.json({ from: params.get('from'), to: params.get('to'), days: [...groups.values()] })
  }
}

/** '2026-09' -> an ISO instant on the 3rd of the next month: where a finalized month is stamped. */
function afterMonthEnd(period: string): string {
  const [y, m] = period.split('-').map(Number)
  const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  return `${next}-03T06:00:00+00:00`
}
