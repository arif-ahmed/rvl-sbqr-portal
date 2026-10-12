// Wire shapes of the usage read API: `/v1/admin/billing/usage[/summary]` (staff) and
// `/v1/billing/usage[/summary]` (an FI, always its own tenant). Instants are ISO-8601; days are
// Asia/Dhaka calendar days ('yyyy-MM-dd').

export type UsageEventDto = {
  usageEventId: string
  tenantId: string
  meterCode: string
  billable: boolean
  /** The validation verdict; null on generation events. */
  verdict: string | null
  clientReference: string
  occurredAt: string
}

export type UsagePageDto = { items: UsageEventDto[]; nextCursor: string | null }

export type UsageDayDto = { day: string; tenantId: string; meterCode: string; billable: boolean; count: number }

export type UsageSummaryDto = { from: string; to: string; days: UsageDayDto[] }
