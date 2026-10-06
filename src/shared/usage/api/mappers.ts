import { currentPeriod, stampDhaka, type Period, type UsageCounts } from '../../billing/billing'
import type { Meter, UsageEvent } from '../usage'
import type { UsageDayDto, UsageEventDto } from './types'

export function toUsageEvent(dto: UsageEventDto): UsageEvent {
  const meter = dto.meterCode as Meter
  return {
    id: dto.usageEventId,
    at: stampDhaka(dto.occurredAt).replace(' ', 'T'),
    meter,
    verdict: (dto.verdict ?? 'GENERATED') as UsageEvent['verdict'],
    billable: dto.billable,
    ref: dto.clientReference,
    institutionId: dto.tenantId,
  }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM' -> its last calendar day, 'YYYY-MM-DD'. */
export function lastDayOf(period: Period): string {
  const [y, m] = period.split('-').map(Number)
  return `${period}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

/** The API serves at most this many days per usage range. */
export const MAX_RANGE_DAYS = 400

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + n))
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`
}

/** From the first listed month to the end of the current one, trimmed to what the API will serve. */
export function summaryRange(periods: Period[], now = new Date()): { from: string; to: string } {
  const to = lastDayOf(currentPeriod(now))
  const first = `${periods[0] ?? currentPeriod(now)}-01`
  const earliest = addDays(to, -(MAX_RANGE_DAYS - 1))
  return { from: first < earliest ? earliest : first, to }
}

export type PeriodUsage = Record<Period, Record<string, UsageCounts>>

/** Billable events per month and institution, from the daily counts. Unbilled events are not counted. */
export function countsByPeriod(days: UsageDayDto[]): PeriodUsage {
  const out: PeriodUsage = {}
  for (const d of days) {
    if (!d.billable) continue
    const period = d.day.slice(0, 7)
    const c = ((out[period] ??= {})[d.tenantId] ??= { staticGenerations: 0, dynamicGenerations: 0, validations: 0 })
    if (d.meterCode === 'GENERATION_STATIC') c.staticGenerations += d.count
    else if (d.meterCode === 'GENERATION_DYNAMIC') c.dynamicGenerations += d.count
    else if (d.meterCode === 'VALIDATION') c.validations += d.count
  }
  return out
}

export const volumeOf = (c: UsageCounts) => c.staticGenerations + c.dynamicGenerations + c.validations
