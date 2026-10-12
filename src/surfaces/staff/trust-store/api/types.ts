// Wire shape of GET /v1/trust-store/institutions (camelCase JSON, BB-sourced).
// The top-level `syncedAt` is the manager's max(`synced_at`) across rows, so the
// banner can render "Last synced 12 min ago" without scanning the list client-side.
// Each `institution` is the institution's active (latest key_version) public-key row —
// `publicKeyPem` and `publicKeySha256` are surfaced because the operator-facing use
// case is "which key do we trust for Institution X?".

export type TrustStoreList = {
  syncedAt: string | null
  institutions: TrustStoreInstitution[]
}

export type TrustStoreInstitution = {
  institutionCode: string
  instituteType: string
  institutionName: string
  status: string
  source: string
  keyVersion: number
  publicKeyPem: string
  publicKeySha256: string
  syncedAt: string
}
