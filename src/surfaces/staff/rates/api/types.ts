// Wire types for the rate-cards API (rvl-secure-bqr-manager, Billing module).
// Server: src/Modules/Billing/SBQR.Modules.Billing.Api/Controllers/RateCardsController.cs
//         src/Modules/Billing/SBQR.Modules.Billing.Application/RateCards/RateCardResponse.cs
//         src/Modules/Billing/SBQR.Modules.Billing.Api/Contracts/CreateRateCardRequest.cs
//
// All routes are admin-only (`AdminCredentialTree`) and sit under the `v1.internal-admin`
// OpenAPI document. Currency is always BDT and never accepted on the wire.

/** Body of `POST /v1/admin/billing/rate-cards`. The server ignores `createdBy` — the audit row
 *  uses the authenticated actor — but the field is kept on the DTO for backward compatibility. */
export type CreateRateCardDto = {
  tenantId: string
  /** ISO date for the 1st of the current or a future Dhaka month, e.g. `2027-02-01`. */
  effectiveFrom: string
  generationRate: number
  validationRate: number
  createdBy: string
}

/** Response of `GET /v1/admin/billing/rate-cards?tenantId=` and `POST /v1/admin/billing/rate-cards`. */
export type RateCardDto = {
  rateCardId: string
  tenantId: string
  effectiveFrom: string
  generationRate: number
  validationRate: number
  currency: 'BDT'
  createdBy: string
}