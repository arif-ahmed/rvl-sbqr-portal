import { ChevronLeft, ChevronRight } from 'lucide-react'
import { periodName } from '../format'
import { Button, Select } from '../ui'
import type { BillingData, Period } from './billing'

/** Previous / month list / next. Newest first, one optgroup per year, so it stays scannable. */
export function PeriodPicker({ billing, value, onChange }: { billing: BillingData; value: Period; onChange: (p: Period) => void }) {
  const idx = billing.periods.indexOf(value)
  const groups: { year: string; months: Period[] }[] = []
  for (const p of [...billing.periods].reverse()) {
    const year = p.slice(0, 4)
    const last = groups.at(-1)
    if (last?.year === year) last.months.push(p)
    else groups.push({ year, months: [p] })
  }

  return (
    <>
      <Button aria-label="Previous period" className="h-10 px-3" disabled={idx === 0} onClick={() => onChange(billing.periods[idx - 1])}>
        <ChevronLeft className="size-4" aria-hidden />
      </Button>
      <Select aria-label="Billing period" className="w-auto" value={value} onChange={(e) => onChange(e.target.value)}>
        {groups.map((g) => (
          <optgroup key={g.year} label={g.year}>
            {g.months.map((p) => (
              <option key={p} value={p}>
                {periodName(p).split(' ')[0]} · {billing.periodMeta[p].status}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
      <Button aria-label="Next period" className="h-10 px-3" disabled={idx === billing.periods.length - 1} onClick={() => onChange(billing.periods[idx + 1])}>
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </>
  )
}
