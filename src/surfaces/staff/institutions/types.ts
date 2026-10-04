import type { StepCode } from './api/types'

export type Profile = {
  name: string
  type: string
  institutionId: string
  contactName: string
  email: string
  phone: string
  address: string
}
export type Access = { generation: boolean; validation: boolean }
export type KeyMode = 'Generate' | 'Adopt'

export type InstitutionStatus = 'Pending' | 'Active' | 'Suspended' | 'Terminated'

/** How far a Pending institution's onboarding has got, as the API reports it. */
export type SetupProgress = { completed: number; total: number; currentStep: StepCode | null }

/** An institution as the list shows it. `code` is type (2 digits) + institution ID (4 digits). */
export type Institution = {
  /** The tenant id (a GUID). */
  id: string
  name: string
  type: string
  code: string
  status: InstitutionStatus
  contactName: string
  email: string
  phone: string
  address: string
  /** What the institution may do. Null while a Pending institution has not been configured yet. */
  access: Access | null
  /** Whether a rate card exists. Without one its usage is recorded but never billed. */
  hasRateCard: boolean
  /** Onboarding progress. Only Pending institutions have it. */
  setup: SetupProgress | null
}
