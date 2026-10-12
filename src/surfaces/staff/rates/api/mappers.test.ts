import { describe, expect, it } from 'vitest'
import { toCreateRateCard, toRateCard } from './mappers'
import type { RateCardDto } from './types'

const dto: RateCardDto = {
  rateCardId: 'rc-guid',
  tenantId: 'tenant-guid',
  effectiveFrom: '2027-02-01',
  generationRate: 0.5,
  validationRate: 0.125,
  currency: 'BDT',
  createdBy: 'platform:admin',
}

describe('rate-card mappers', () => {
  it('turns the wire DTO into the portal shape (renames rateCardId → id, tenantId → institutionId)', () => {
    expect(toRateCard(dto)).toEqual({
      id: 'rc-guid',
      institutionId: 'tenant-guid',
      effectiveFrom: '2027-02-01',
      generationRate: 0.5,
      validationRate: 0.125,
    })
  })

  it('refuses a non-BDT currency — the server is the source of truth on this', () => {
    expect(() => toRateCard({ ...dto, currency: 'USD' as 'BDT' })).toThrow(/Unexpected rate-card currency/)
  })

  it('builds the create body, including the actor label the server will overwrite with the JWT actor', () => {
    expect(toCreateRateCard({ institutionId: 'tenant-guid', effectiveFrom: '2027-02-01', generationRate: 0.5, validationRate: 0.125, actorLabel: 'platform:admin' })).toEqual({
      tenantId: 'tenant-guid',
      effectiveFrom: '2027-02-01',
      generationRate: 0.5,
      validationRate: 0.125,
      createdBy: 'platform:admin',
    })
  })
})