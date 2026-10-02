import type { ReactNode } from 'react'
import { cn } from '../cn'
import { toneFor, type Tone } from './status'

const tones: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  bad: 'bg-bad-bg text-bad',
  info: 'bg-info-bg text-info',
}

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold', tones[tone])}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}

/** Chip whose colour comes from the status name; pass `label` to override the text. */
export function StatusChip({ status, label }: { status: string; label?: string }) {
  return <Chip tone={toneFor(status)}>{label ?? status}</Chip>
}
