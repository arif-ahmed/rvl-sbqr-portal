export type Profile = {
  name: string
  type: string
  institutionId: string
  contactName: string
  email: string
  phone: string
  address: string
}
export type Access = { generation: boolean; validation: boolean; clientId: string }
export type Certificate = { thumbprint: string; subject: string; expiresAt: string }
export type KeyMode = 'Generate' | 'Adopt'

export type InstitutionStatus = 'Pending' | 'Active' | 'Suspended' | 'Terminated'

/** An institution as the list shows it. `code` is type (2 digits) + institution ID (4 digits). */
export type Institution = {
  id: string
  name: string
  type: string
  code: string
  status: InstitutionStatus
  contactName: string
  email: string
  phone: string
  address: string
  /** Null until credentials are issued. The secret itself is never kept. */
  access: Access | null
  certificate: Certificate | null
  keyMode: KeyMode | null
}
