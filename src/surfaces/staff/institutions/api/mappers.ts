import { institutionCode } from '../../onboarding/institution-types'
import type { Institution, InstitutionStatus, Profile } from '../types'
import type { OnboardingDto, OnboardingStepDto, StepCode, StepStatus, TenantDto } from './types'

/** The API stores 'PENDING'; the UI says 'Pending'. Anything unknown is shown as Pending rather than dropped. */
export function toStatus(status: string): InstitutionStatus {
  const s = status.slice(0, 1).toUpperCase() + status.slice(1).toLowerCase()
  return s === 'Active' || s === 'Suspended' || s === 'Terminated' ? s : 'Pending'
}

/** Steps before credentials: the institution has no working access yet. */
const beforeCredentials: (StepCode | null)[] = ['PROFILE', 'CONFIGURATION', 'CREDENTIALS']

export function toInstitution(dto: TenantDto): Institution {
  const status = toStatus(dto.status)
  const setup = status === 'Pending' && dto.onboarding ? { completed: dto.onboarding.completedSteps, total: dto.onboarding.totalSteps, currentStep: dto.onboarding.currentStep } : null
  const notSetUp = !!setup && beforeCredentials.includes(setup.currentStep)
  return {
    id: dto.tenantId,
    name: dto.institutionName,
    type: dto.institutionType,
    code: dto.institutionCode,
    status,
    contactName: dto.contactName,
    email: dto.contactEmail,
    phone: dto.contactPhone ?? '',
    address: dto.address ?? '',
    access: notSetUp ? null : { generation: dto.isQrGenerationAllowed, validation: dto.isQrValidationAllowed },
    hasRateCard: dto.hasRateCard ?? false,
    setup,
  }
}

/** Back to the wizard's form shape: the 6-digit code splits into type + institution ID. */
export function toProfile(i: Institution): Profile {
  return { name: i.name, type: i.type, institutionId: i.code.slice(2), contactName: i.contactName, email: i.email, phone: i.phone, address: i.address }
}

/** The body of POST /v1/admin/tenants. Optional fields are left out rather than sent empty. */
export function toRegisterRequest(p: Profile) {
  return {
    institutionName: p.name.trim(),
    institutionCode: institutionCode(p.type, p.institutionId),
    contactName: p.contactName.trim(),
    contactEmail: p.email.trim(),
    ...(p.phone.trim() ? { contactPhone: p.phone.trim() } : {}),
    ...(p.address.trim() ? { address: p.address.trim() } : {}),
  }
}

export const stepLabels: Record<StepCode, string> = {
  PROFILE: 'Institution',
  CONFIGURATION: 'Configuration',
  CREDENTIALS: 'Credentials',
  SIGNING_KEY: 'Signing key',
  REVIEW: 'Review',
}

export const isStepDone = (status: StepStatus) => status === 'COMPLETED'

/** The status of one step in an onboarding view, NOT_STARTED when the API did not list it. */
export const stepStatus = (onboarding: OnboardingDto | undefined, code: StepCode): StepStatus => onboarding?.steps.find((s) => s.code === code)?.status ?? 'NOT_STARTED'

export const stepOf = (onboarding: OnboardingDto | undefined, code: StepCode): OnboardingStepDto | undefined => onboarding?.steps.find((s) => s.code === code)
