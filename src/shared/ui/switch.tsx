import { cn } from '../cn'

/** On/off setting row: label and description on the left, switch on the right. */
export function SwitchRow(props: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const { id, label, description, checked, onChange, disabled } = props
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line px-4 py-3.5">
      <div>
        <label htmlFor={id} className="block font-semibold">
          {label}
        </label>
        {description && <span className="text-[12.5px] text-text-3">{description}</span>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45',
          checked ? 'border-accent bg-accent' : 'border-line-2 bg-line',
        )}
      >
        <span className={cn('absolute top-0.5 left-0.5 size-4.5 rounded-full bg-white transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}
