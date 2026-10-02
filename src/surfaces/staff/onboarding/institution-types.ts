// Institution types from the Bangladesh Bank P2P specification, Tag 26.01
// ("Recipient's Institution Type"). 06-99 are reserved and not offered.
export const institutionTypes = [
  { value: '00', label: 'Bank' },
  { value: '01', label: 'NBFI' },
  { value: '02', label: 'MFS provider' },
  { value: '03', label: 'PSP / e-wallet service provider' },
  { value: '04', label: 'Payment System Operator (PSO)' },
  { value: '05', label: 'White-label ATM / recipient acquirer (WLAMA)' },
] as const

export type InstitutionTypeCode = (typeof institutionTypes)[number]['value']

export const typeLabel = (code: string) => institutionTypes.find((t) => t.value === code)?.label ?? code

/** Institution code = type (2 digits) + institution ID (4 digits), e.g. 00 + 0085. */
export const institutionCode = (type: string, id: string) => type + id
