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
  signingKey: { keyId: string; version: number; status: string } | null
}

/** POST /v1/admin/tenants/{id}/tenant-configuration. `clientSecret` is shown once and never stored. */
export type ProvisionedCredentials = {
  tenantId: string
  credentialId: string
  clientId: string
  clientSecret: string
  expiresAt: string | null
}
