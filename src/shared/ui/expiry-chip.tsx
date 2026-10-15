import type { ReactNode } from 'react'
import { cn } from '../cn'
import { daysUntil, daysUntilHuman, expiryDate } from '../format'

const tones = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
} as const

type Tone = keyof typeof tones

/**
 * Visual cue for a signing-key expiry date. The tone comes from how close
 * the deadline is to today (UTC midnight cutoff):
 *
 * <list type="bullet">
 *   <item><c>bad</c> — already expired (or never set, treated as N/A).</item>
 *   <item><c>warn</c> — within 30 days. The portal surfaces this before
 *         rotation to give the operator time to schedule it.</item>
 *   <item><c>ok</c> — comfortably in the future.</item>
 * </list>
 *
 * Pass an explicit <c>tone</c> to override the auto-pick (e.g., in tests
 * that need a deterministic tone).
 */
export function ExpiryChip({
  validUntil,
  tone,
  prefix = 'Expires',
  children,
}: {
  /** ISO 8601 UTC timestamp. <c>null</c> = open-ended validity. */
  validUntil: string | null | undefined
  /** Override the auto-picked tone. */
  tone?: Tone
  /** 'Expires' (default) for a future deadline, 'Expired' for a past one. */
  prefix?: string
  /** Optional extra content shown after the date (e.g., a Rotate button). */
  children?: ReactNode
}) {
  const days = daysUntil(validUntil)
  const auto: Tone = validUntil == null
    ? 'bad'
    : days == null
      ? 'bad'
      : days <= 0
        ? 'bad'
        : days <= 30
          ? 'warn'
          : 'ok'
  const selected = tone ?? auto
  const label = validUntil == null
    ? 'No expiry'
    : days == null
      ? 'No expiry'
      : days <= 0
        ? `Expired ${expiryDate(validUntil)}`
        : `${prefix} ${expiryDate(validUntil)} (${daysUntilHuman(days)})`

  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold',
        tones[selected],
      )}
      data-testid="expiry-chip"
      data-tone={selected}
      data-days={days ?? 'none'}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {label}
      {children}
    </span>
  )
}
