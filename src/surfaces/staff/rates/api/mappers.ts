import type { RateCard } from '../rates'
import type { CreateRateCardDto, RateCardDto } from './types'

/** The server always stores BDT. Anything else would mean the wire has drifted. */
function assertBdt(currency: string): asserts currency is 'BDT' {
  if (currency !== 'BDT') throw new Error(`Unexpected rate-card currency: ${currency}`)
}

/** Wire → UI: keep the portal's existing `RateCard` shape (id, institutionId, `YYYY-MM-DD`)
 *  so the pure rules in `../rates.ts` continue to work untouched. */
export function toRateCard(dto: RateCardDto): RateCard {
  assertBdt(dto.currency)
  return {
    id: dto.rateCardId,
    institutionId: dto.tenantId,
    effectiveFrom: dto.effectiveFrom,
    generationRate: dto.generationRate,
    validationRate: dto.validationRate,
  }
}

/** UI → wire. `createdBy` is required by the DTO but the server overwrites it with the
 *  authenticated actor — send the institution name as a stable placeholder. */
export function toCreateRateCard(input: { institutionId: string; effectiveFrom: string; generationRate: number; validationRate: number; actorLabel: string }): CreateRateCardDto {
  return {
    tenantId: input.institutionId,
    effectiveFrom: input.effectiveFrom,
    generationRate: input.generationRate,
    validationRate: input.validationRate,
    createdBy: input.actorLabel,
  }
}