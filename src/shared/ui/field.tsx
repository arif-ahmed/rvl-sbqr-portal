import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../cn'

/** Label above, error below in red, hint in grey. With react-hook-form pass `error={errors.x?.message}`. */
export function Field(props: { label: string; htmlFor: string; error?: string; hint?: string; children: ReactNode }) {
  const { label, htmlFor, error, hint, children } = props
  return (
    <div className="mb-4">
      <label htmlFor={htmlFor} className="mb-1.5 block text-[12.5px] font-semibold text-text-2">
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 text-[12.5px] text-bad">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-[12.5px] text-text-3">{hint}</p>
      )}
    </div>
  )
}

const control =
  'w-full rounded-[9px] border border-line-2 bg-surface px-3 text-text outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/15 aria-[invalid=true]:border-bad'

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => (
  <input className={cn(control, 'h-10', className)} {...p} />
)
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => (
  <select className={cn(control, 'h-10', className)} {...p} />
)
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cn(control, 'min-h-24 py-2.5', className)} {...p} />
)
