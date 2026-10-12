import {
  blockingEvents,
  buildStatement,
  pendingAdjustments,
  periodTotals,
  round2,
  type BillingData,
  type Period,
  type PeriodStatus,
  type Statement,
  type UsageCounts,
} from '../../../shared/billing/billing'

export type ReportRow = {
  institutionId: string
  /** Billable generations and validations. */
  volume: number
  /** Statement total, adjustments included. */
  revenue: number
  /** Percent of the month's revenue. */
  share: number
}

export type MonthlyReport = {
  period: Period
  status: PeriodStatus
  /** Billed institutions, largest revenue first. */
  rows: ReportRow[]
  /** Institutions with usage but no rate card: recorded, not billed. */
  unbilled: { institutionId: string; volume: number }[]
  volume: number
  revenue: number
  /** The month before, when the ledger has one. */
  previous: Period | null
  /** Percent change against the previous month; null when there is nothing to compare. */
  change: { volume: number | null; revenue: number | null }
  pendingAdjustments: number
  lateUsage: number
}

const volumeOf = (c: UsageCounts) => c.staticGenerations + c.dynamicGenerations + c.validations

const changeOf = (now: number, before: number): number | null => (before ? ((now - before) / before) * 100 : null)

/**
 * Monthly volume and revenue per institution (ticket 06). Pure, so the page and the CSV share
 * one set of figures. Daily totals need the usage ledger and come with the API.
 */
export function monthlyReport(data: BillingData, period: Period): MonthlyReport {
  const totals = periodTotals(data, period)
  const volume = volumeOf(totals.counts)
  const revenue = totals.total

  const rows = totals.statements
    .map((s) => ({
      institutionId: s.institutionId,
      volume: volumeOf(s.counts),
      revenue: s.total,
      share: revenue > 0 ? (s.total / revenue) * 100 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue)

  const unbilled = Object.entries(data.unbilled[period] ?? {}).map(([institutionId, volume]) => ({ institutionId, volume }))

  const index = data.periods.indexOf(period)
  const previous = index > 0 ? data.periods[index - 1] : null
  const before = previous ? periodTotals(data, previous) : null

  return {
    period,
    status: data.periodMeta[period].status,
    rows,
    unbilled,
    volume,
    revenue,
    previous,
    change: before
      ? { volume: changeOf(volume, volumeOf(before.counts)), revenue: changeOf(revenue, before.total) }
      : { volume: null, revenue: null },
    pendingAdjustments: pendingAdjustments(data, period).length,
    lateUsage: blockingEvents(data, period).length,
  }
}

export type HistoryRow = {
  period: Period
  status: PeriodStatus
  counts: UsageCounts
  volume: number
  revenue: number
  /** Revenue change against the month before; null when that month billed nothing. */
  change: number | null
}

export type InstitutionReport = {
  period: Period
  status: PeriodStatus
  /** Null when there is no usage or no rate card in effect that month. */
  statement: Statement | null
  /** Usage recorded without a rate card: not billed. */
  unbilledVolume: number
  /** 1-based place by revenue this month, out of `of` billed institutions. */
  rank: number | null
  of: number
  share: number
  /** Up to six months ending at `period`, oldest first. */
  history: HistoryRow[]
}

const noCounts: UsageCounts = { staticGenerations: 0, dynamicGenerations: 0, validations: 0 }

/** Everything about one institution's month, with the months leading up to it. */
export function institutionReport(data: BillingData, institutionId: string, period: Period): InstitutionReport {
  const month = monthlyReport(data, period)
  const place = month.rows.findIndex((r) => r.institutionId === institutionId)
  const statement = buildStatement(data, institutionId, period)

  const index = data.periods.indexOf(period)
  const rows = data.periods.slice(Math.max(0, index - 6), index + 1).map((p) => {
    const s = buildStatement(data, institutionId, p)
    const c = s?.counts ?? noCounts
    return { period: p, status: data.periodMeta[p].status, counts: c, volume: volumeOf(c), revenue: s?.total ?? 0 }
  })
  const history = rows.map((r, i) => ({ ...r, change: i > 0 ? changeOf(r.revenue, rows[i - 1].revenue) : null })).slice(-6)

  return {
    period,
    status: month.status,
    statement,
    unbilledVolume: data.unbilled[period]?.[institutionId] ?? 0,
    rank: place >= 0 ? place + 1 : null,
    of: month.rows.length,
    share: place >= 0 ? month.rows[place].share : 0,
    history,
  }
}

/** The history table as CSV, one row per month. */
export function institutionReportToCsv(report: InstitutionReport, name: string): string {
  return toCsv([
    ['institution', 'period', 'status', 'static_generations', 'dynamic_generations', 'validations', 'volume', 'revenue', 'currency'],
    ...report.history.map((h) => [name, h.period, h.status, h.counts.staticGenerations, h.counts.dynamicGenerations, h.counts.validations, h.volume, h.revenue, 'BDT']),
  ])
}

export type TrendRow = {
  period: Period
  status: PeriodStatus
  counts: UsageCounts
  volume: number
  revenue: number
  change: number | null
  /** Revenue per institution id. */
  byInstitution: Record<string, number>
}

/** Every month in the ledger, with each institution's part of it. */
export function trendReport(data: BillingData): { rows: TrendRow[]; institutions: string[] } {
  const rows = data.periods.map((p, i) => {
    const t = periodTotals(data, p)
    return {
      period: p,
      status: data.periodMeta[p].status,
      counts: t.counts,
      volume: volumeOf(t.counts),
      revenue: t.total,
      byInstitution: Object.fromEntries(t.statements.map((s) => [s.institutionId, s.total])),
      prior: i > 0 ? periodTotals(data, data.periods[i - 1]).total : 0,
    }
  })
  const seen = new Set(rows.flatMap((r) => Object.keys(r.byInstitution)))
  return {
    rows: rows.map(({ prior, ...r }) => ({ ...r, change: changeOf(r.revenue, prior) })),
    institutions: data.institutions.filter((i) => seen.has(i.id)).map((i) => i.id),
  }
}

export function trendToCsv(trend: ReturnType<typeof trendReport>, nameOf: (id: string) => string): string {
  return toCsv([
    ['period', 'status', 'institution', 'revenue', 'currency'],
    ...trend.rows.flatMap((r) => trend.institutions.filter((id) => id in r.byInstitution).map((id) => [r.period, r.status, nameOf(id), r.byInstitution[id], 'BDT'])),
  ])
}

const cell = (value: string | number | boolean) => {
  const s = String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** One row per institution, billed first. Not-billed rows carry revenue 0. */
export function reportToCsv(report: MonthlyReport, nameOf: (id: string) => string): string {
  return toCsv([
    ['period', 'institution', 'volume', 'revenue', 'share_percent', 'billed', 'currency'],
    ...report.rows.map((r) => [report.period, nameOf(r.institutionId), r.volume, r.revenue, round2(r.share), true, 'BDT']),
    ...report.unbilled.map((u) => [report.period, nameOf(u.institutionId), u.volume, 0, 0, false, 'BDT']),
  ])
}

const toCsv = (rows: (string | number | boolean)[][]) => rows.map((r) => r.map(cell).join(',')).join('\n')
