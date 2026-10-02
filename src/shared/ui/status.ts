export type Tone = 'ok' | 'warn' | 'bad' | 'info'

/** Status -> tone. Keep in sync with the status table in DESIGN.md. */
const statusTone: Record<string, Tone> = {
  Active: 'ok', Finalized: 'ok', Applied: 'ok', Complete: 'ok', Valid: 'ok', Generated: 'ok', Delivered: 'ok',
  Pending: 'info', Scheduled: 'info',
  Draft: 'warn', Queued: 'warn', Suspended: 'warn', Indeterminate: 'warn',
  Terminated: 'bad', Invalid: 'bad', Error: 'bad',
}

export const toneFor = (status: string): Tone => statusTone[status] ?? 'info'
