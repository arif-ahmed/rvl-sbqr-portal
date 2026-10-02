export type Tone = 'ok' | 'warn' | 'bad' | 'info'

/** Status -> tone. Keep in sync with the status table in DESIGN.md. */
const statusTone: Record<string, Tone> = {
  Active: 'ok', 'In effect': 'ok', Finalized: 'ok', Applied: 'ok', Complete: 'ok', VALID: 'ok', GENERATED: 'ok', Delivered: 'ok',
  Pending: 'info', Scheduled: 'info', NON_P2P: 'info',
  Draft: 'warn', Queued: 'warn', Suspended: 'warn', KEY_NOT_FOUND: 'warn', KEY_SUSPENDED: 'warn', KEY_REVOKED: 'warn', KEY_NOT_ACTIVE: 'warn', REQUEST_STALE: 'warn',
  Terminated: 'bad', INVALID_SIGNATURE: 'bad', STRUCTURAL_INVALID: 'bad',
}

export const toneFor = (status: string): Tone => statusTone[status] ?? 'info'
