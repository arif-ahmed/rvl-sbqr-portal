import { Building2 } from 'lucide-react'
import { useId, useState } from 'react'
import { cn } from '../../../shared/cn'
import { Button, Input } from '../../../shared/ui'
import { institutionRegistry, type RegistryEntry } from './institution-registry'
import { institutionCode, typeLabel } from './institution-types'

const codeOf = (e: RegistryEntry) => institutionCode(e.type, e.id)

/** Searchable list of registered institutions. Choosing one fills name, type and ID together. */
export function InstitutionPicker(props: {
  value: RegistryEntry | null
  onChange: (entry: RegistryEntry | null) => void
  /** Directory universe to search. Defaults to the static Annex A registry. */
  entries?: RegistryEntry[]
  /** Institution codes that already have a tenant; shown but not selectable. */
  taken: string[]
  /** Directory codes whose trust status is not ACTIVE; shown but not selectable. */
  frozen?: string[]
  disabled?: boolean
  invalid?: boolean
}) {
  const { value, onChange, entries = institutionRegistry, taken, frozen = [], disabled, invalid } = props
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-line px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-strong">
          <Building2 className="size-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate">{value.name}</b>
          <span className="text-[12.5px] text-text-2">
            {typeLabel(value.type)} · code <span className="num">{codeOf(value)}</span>
          </span>
        </div>
        {!disabled && (
          <Button size="sm" onClick={() => onChange(null)}>
            Change
          </Button>
        )}
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  // When there is no query, show the full directory so the admin can scan every
  // option — available and locked rows live in the same list. When the admin
  // types, narrow to matches in any group.
  const matches = q
    ? entries.filter((e) => e.name.toLowerCase().includes(q) || codeOf(e).startsWith(q))
    : entries
  const isTaken = (e: RegistryEntry) => taken.includes(codeOf(e))
  const isFrozen = (e: RegistryEntry) => frozen.includes(codeOf(e))
  const blocked = (e: RegistryEntry) => isTaken(e) || isFrozen(e)
  // One flat list in institution-code order (the Bangladesh Bank directory order), so
  // available and locked rows interleave exactly as the regulator lists them.
  const ordered = [...matches].sort((a, b) => codeOf(a).localeCompare(codeOf(b)))

  function choose(e: RegistryEntry) {
    if (blocked(e)) return
    onChange(e)
    setQuery('')
    setOpen(false)
  }

  return (
    <div className="relative">
      <Input
        id="institution"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && ordered[active] ? `${listId}-${active}` : undefined}
        aria-invalid={invalid}
        autoComplete="off"
        placeholder="Search by name or code"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
            setActive((a) => Math.min(ordered.length - 1, a + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(0, a - 1))
          } else if (e.key === 'Enter' && open && ordered[active]) {
            e.preventDefault()
            choose(ordered[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Institutions"
          // Keep focus on the input while the list is used: grabbing the scrollbar or the
          // list's padding would otherwise blur the input and close the list under the cursor.
          onMouseDown={(ev) => ev.preventDefault()}
          className="absolute z-20 mt-1 max-h-[min(30rem,60vh)] w-full overflow-auto rounded-xl border border-line bg-surface py-1 shadow-lg">
          {ordered.length === 0 && <li className="px-4 py-3 text-text-3">No institution matches.</li>}
          {ordered.map((e, i) => {
            const taken = isTaken(e)
            const frozen = !taken && isFrozen(e)
            const locked = taken || frozen
            return (
              <li
                key={codeOf(e)}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                aria-disabled={locked}
                // mousedown, not click: the input would blur and close the list first.
                onMouseDown={(ev) => {
                  ev.preventDefault()
                  choose(e)
                }}
                className={cn(
                  'flex items-center justify-between gap-3 px-4 py-2.5',
                  i === active && 'bg-surface-2',
                  locked ? 'cursor-not-allowed text-text-3' : 'cursor-pointer',
                )}
              >
                <span className="min-w-0 truncate">
                  {e.name}
                  {locked && (
                    <span className="ml-2 inline-block rounded-md bg-surface-2 px-1.5 py-0.5 align-middle text-[11px] font-medium text-text-2">
                      {taken ? 'Already onboarded' : 'Trust inactive'}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[12.5px] text-text-3">
                  {typeLabel(e.type).split(' (')[0]} · <span className="num">{codeOf(e)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
