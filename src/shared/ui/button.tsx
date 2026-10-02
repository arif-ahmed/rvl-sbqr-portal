import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../cn'

const variants = {
  primary: 'bg-accent text-on-accent border-accent hover:bg-accent-strong hover:border-accent-strong',
  default: 'bg-surface text-text border-line-2 hover:bg-surface-2',
  danger: 'bg-surface text-bad border-bad/40 hover:bg-bad-bg',
  /** Only inside a confirm dialog. */
  dangerSolid: 'bg-bad text-surface border-bad hover:opacity-90',
  ghost: 'bg-transparent text-text border-transparent hover:bg-surface-2',
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants
  size?: 'md' | 'sm'
}

export function Button({ variant = 'default', size = 'md', className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[9px] border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45',
        size === 'md' ? 'h-[38px] px-4' : 'h-[30px] px-3 text-[13px]',
        variants[variant],
        className,
      )}
      {...rest}
    />
  )
}
