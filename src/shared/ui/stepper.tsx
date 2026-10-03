import { Check } from 'lucide-react'
import { cn } from '../cn'

export type StepDef = { id: string; label: string; optional?: boolean }

/** Progress for a multi-step form. Wide screens show every step; smaller ones show "Step n of N" and a bar. */
export function Stepper({ steps, current }: { steps: StepDef[]; current: number }) {
  return (
    <nav aria-label="Progress" className="mb-6">
      <div className="lg:hidden">
        <div className="mb-2 text-[13px] text-text-2">
          Step {current + 1} of {steps.length} · <b className="text-text">{steps[current]?.label}</b>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((current + 1) / steps.length) * 100}%` }} />
        </div>
      </div>
      <ol className="hidden items-center lg:flex">
        {steps.map((s, i) => {
          const state = i < current ? 'done' : i === current ? 'current' : 'todo'
          return (
            <li key={s.id} aria-current={state === 'current' ? 'step' : undefined} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border text-[12.5px] font-semibold',
                  state === 'done' && 'border-accent bg-accent text-on-accent',
                  state === 'current' && 'border-accent text-accent-strong',
                  state === 'todo' && 'border-line-2 text-text-3',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn('ml-2 text-[13px] font-medium whitespace-nowrap', state === 'todo' ? 'text-text-3' : 'text-text')}>
                {s.label}
                {s.optional && <small className="sr-only"> (optional)</small>}
              </span>
              {i < steps.length - 1 && <span aria-hidden className={cn('mx-3 h-px flex-1', i < current ? 'bg-accent' : 'bg-line')} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
