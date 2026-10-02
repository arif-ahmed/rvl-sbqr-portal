import type { ReactNode } from 'react'
import { cn } from '../cn'

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-xl border border-line bg-surface', className)}>{children}</section>
}

export function CardHeader({ title, sub, actions }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {sub && <span className="text-[12.5px] text-text-3">{sub}</span>}
      <span className="flex-1" />
      {actions}
    </div>
  )
}

/** Headline number tile. Pass already-formatted `value` (see shared/format). */
export function Kpi({ label, value, sub, icon }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode }) {
  return (
    <Card className="px-5 py-[18px]">
      <div className="flex items-center gap-2 text-[12.5px] font-medium text-text-3">
        {icon && <span className="grid size-[26px] place-items-center rounded-lg bg-accent-soft text-accent-strong [&>svg]:size-[15px]">{icon}</span>}
        {label}
      </div>
      <div className="num mt-2.5 text-[26px] leading-[34px] font-bold tracking-tight">{value}</div>
      {sub && <div className="text-[12.5px] text-text-2">{sub}</div>}
    </Card>
  )
}
