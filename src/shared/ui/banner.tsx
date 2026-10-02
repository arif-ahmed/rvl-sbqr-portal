import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../cn'
import type { Tone } from './status'

const styles: Record<Tone, string> = {
  ok: 'bg-ok-bg border-ok/30 text-ok',
  warn: 'bg-warn-bg border-warn/30 text-warn',
  bad: 'bg-bad-bg border-bad/30 text-bad',
  info: 'bg-info-bg border-info/30 text-info',
}
const icons = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info }

/** Title + one sentence + a link to the fix. */
export function Banner({ tone, title, children }: { tone: Tone; title: string; children?: ReactNode }) {
  const Icon = icons[tone]
  return (
    <div
      role={tone === 'bad' || tone === 'warn' ? 'alert' : 'status'}
      className={cn('mb-4 flex items-start gap-3 rounded-xl border px-4 py-3.5', styles[tone])}
    >
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div>
        <b className="block text-text">{title}</b>
        {children && (
          <div className="text-[13px] leading-[19px] text-text-2 [&_a]:font-semibold [&_a]:text-current [&_a]:underline">{children}</div>
        )}
      </div>
    </div>
  )
}
