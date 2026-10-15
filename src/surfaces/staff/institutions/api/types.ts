import type { Blocker } from '../../../../shared/api/client'

// Wire types for the tenant onboarding API (rvl-secure-bqr-manager, Tenancy module).
// docs/features/institution-onboarding/implementation-guide.md section 2 is the contract.

export type StepCode = 'PROFILE' | 'CONFIGURATION' | 'CREDENTIALS' | 'SIGNING_KEY' | 'REVIEW'
export type StepStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

/** The onboarding steps in the order the wizard shows them. */
export const stepOrder: StepCode[] = ['PROFILE', 'CONFIGURATION', 'CREDENTIALS', 'SIGNING_KEY', 'REVIEW']

/** One row of GET /v1/admin/tenants. The two extra fields are the onboarding additions. */
export type TenantDto = {
  tenantId: string
  institutionName: string
  institutionCode: string
  institutionType: string
  status: string
  statusReason?: string | null
  contactName: string
  contactEmail: string
  contactPhone?: string | null
  address?: string | null
  isQrGenerationAllowed: boolean
  isQrValidationAllowed: boolean
  isActive: boolean
  hasRateCard?: boolean
  /** Present for Pending tenants only. */
  onboarding?: { completedSteps: number; totalSteps: number; currentStep: StepCode | null } | null
}

export type PagedTenantDto = { items: TenantDto[]; page: number; pageSize: number; totalCount: number; hasMore: boolean }

export type OnboardingStepDto = {
  code: StepCode
  status: StepStatus
  required: boolean
  completedAt: string | null
  completedBy: string | null
}

/** GET /v1/admin/tenants/{id}/onboarding. Never carries a secret. */
export type OnboardingDto = {
  tenantId: string
  status: string
  currentStep: StepCode | null
  canActivate: boolean
  hasRateCard: boolean
  steps: OnboardingStepDto[]
  blockers: Blocker[]
  configuration: { isQrGenerationAllowed: boolean; isQrValidationAllowed: boolean } | null
  credential: { clientId: string; status: string; expiresAt: string | null } | null
  /**
   * The tenant's ACTIVE signing key — the Ed25519 private half held in the
   * platform's vault. <c>validUntil</c> mirrors <c>crypto_keys.valid_until</c>
   * so the wizard's "Signing key" step can render an ExpiryChip and surface a
   * 30-day warning before rotation is required. <c>null</c> = open-ended
   * validity (the pre-cert-expiry behaviour, preserved for back-compat).
   */
  signingKey: { keyId: string; version: number; status: string; validUntil: string | null } | null
}

/** GET /v1/crypto-keys/{tenantId} (paged history) and GET /v1/crypto-keys/{tenantId}/active. */
export type CryptoKeyDto = {
  cryptoKeyId: string
  tenantId: string
  keyId: string
  keyVersion: number
  publicKeyPem: string
  status: string
  isActive: boolean
  createdAt: string
  validUntil: string | null
}

export type PagedCryptoKeyDto = {
  items: CryptoKeyDto[]
  page: number
  pageSize: number
  totalCount: number
  hasMore: boolean
}

/** POST /v1/admin/tenants/{id}/tenant-configuration. `clientSecret` is shown once and never stored. */
export type ProvisionedCredentials = {
  tenantId: string
  credentialId: string
  clientId: string
  clientSecret: string
  expiresAt: string | null
}
