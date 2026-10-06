// Wire shapes of the billing API (rvl-secure-bqr-manager, src/Modules/Billing). JSON is camelCase;
// money is a JSON number; instants are ISO-8601 with an offset; `period` is 'YYYY-MM' (Asia/Dhaka).

export type PeriodStatusDto = 'DRAFT' | 'FINALIZED' | 'PROVISIONAL'

/** `GET /v1/admin/billing/periods` row: a stored month at a glance. */
export type PeriodSummaryDto = {
  period: string
  status: 'DRAFT' | 'FINALIZED'
  draftedAt: string | null
  finalizedAt: string | null
  finalizedBy: string | null
  statementCount: number
  grandTotal: number
}

export type StatementLineDto = {
  lineNo: number
  lineType: 'USAGE' | 'ADJUSTMENT'
  /** GENERATION_STATIC | GENERATION_DYNAMIC | VALIDATION on USAGE lines. */
  meterCode: string | null
  adjustmentId: string | null
  description: string
  quantity: number
  unitRate: number
  amount: number
}

export type StatementDto = {
  tenantId: string
  rateCardId: string
  generationRate: number
  validationRate: number
  lines: StatementLineDto[]
  subtotal: number
  adjustmentsTotal: number
  total: number
  currency: string
  calculatedAt: string
}

/** `GET /v1/admin/billing/periods/{period}`: stored figures, or a live PROVISIONAL view when the month has no row. */
export type BillingPeriodDto = {
  period: string
  status: PeriodStatusDto
  provisional: boolean
  draftedAt: string | null
  finalizedAt: string | null
  finalizedBy: string | null
  statements: StatementDto[]
  grandTotal: number
}

/** One tenant's statement with its month's status: `GET /v1/billing/statements` (FI) and `.../periods/{p}/statements/{tenantId}` (staff). */
export type TenantStatementDto = {
  period: string
  status: 'DRAFT' | 'FINALIZED'
  finalizedAt: string | null
  statement: StatementDto
}

export type AdjustmentDto = {
  adjustmentId: string
  tenantId: string
  amount: number
  reason: string
  createdBy: string
  createdAt: string | null
  /** Null while Pending; the statement it settled onto once the month is finalized. */
  appliedStatementId: string | null
}

export type FinalizedPeriodDto = { alreadyFinalized: boolean; appliedAdjustmentCount: number; period: BillingPeriodDto }

export type OutboxBacklogDto = {
  items: {
    outboxMessageId: string
    eventType: string
    status: string
    attempts: number
    occurredAt: string
    nextAttemptAt: string
    lastError: string | null
  }[]
  pendingCount: number
  deadCount: number
}
