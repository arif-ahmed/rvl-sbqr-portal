import { describe, expect, it } from 'vitest'
import { toInstitution, toProfile, toRegisterRequest, toStatus } from './mappers'
import type { TenantDto } from './types'

const dto: TenantDto = {
  tenantId: 'guid-1', institutionName: 'Example Bank', institutionCode: '000901', institutionType: '00', status: 'PENDING',
  contactName: 'Rafiq', contactEmail: 'rafiq@example.test', contactPhone: null, address: null,
  isQrGenerationAllowed: true, isQrValidationAllowed: false, isActive: true,
}

describe('toStatus', () => {
  it('turns the API enum into the UI label', () => {
    expect(toStatus('PENDING')).toBe('Pending')
    expect(toStatus('Active')).toBe('Active')
    expect(toStatus('SUSPENDED')).toBe('Suspended')
    expect(toStatus('TERMINATED')).toBe('Terminated')
  })
})

describe('toInstitution', () => {
  it('keeps access empty until a Pending institution reaches the credentials step', () => {
    const early = { ...dto, onboarding: { completedSteps: 1, totalSteps: 6, currentStep: 'CONFIGURATION' as const } }
    expect(toInstitution(early)).toMatchObject({ id: 'guid-1', access: null, setup: { completed: 1, total: 6, currentStep: 'CONFIGURATION' } })
    const later = { ...dto, onboarding: { completedSteps: 3, totalSteps: 6, currentStep: 'CERTIFICATE' as const } }
    expect(toInstitution(later).access).toEqual({ generation: true, validation: false })
  })

  it('has access and no setup for a live institution, and defaults hasRateCard to false', () => {
    expect(toInstitution({ ...dto, status: 'ACTIVE' })).toMatchObject({ status: 'Active', access: { generation: true, validation: false }, setup: null, hasRateCard: false })
    expect(toInstitution({ ...dto, status: 'ACTIVE', hasRateCard: true }).hasRateCard).toBe(true)
  })

  it('turns missing optional contact fields into empty strings', () => {
    expect(toInstitution(dto)).toMatchObject({ phone: '', address: '' })
  })
})

describe('profile mapping', () => {
  it('splits the 6-digit code back into type and institution ID', () => {
    expect(toProfile(toInstitution(dto))).toMatchObject({ type: '00', institutionId: '0901', email: 'rafiq@example.test' })
  })

  it('leaves optional fields out of the register request when blank', () => {
    const profile = { name: ' Example Bank ', type: '00', institutionId: '0901', contactName: 'Rafiq', email: 'rafiq@example.test', phone: '', address: '  ' }
    expect(toRegisterRequest(profile)).toEqual({ institutionName: 'Example Bank', institutionCode: '000901', contactName: 'Rafiq', contactEmail: 'rafiq@example.test' })
    expect(toRegisterRequest({ ...profile, phone: '+8801700000000', address: 'Dhaka' })).toMatchObject({ contactPhone: '+8801700000000', address: 'Dhaka' })
  })
})
