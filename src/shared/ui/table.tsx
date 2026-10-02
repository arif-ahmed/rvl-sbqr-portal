import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from '../cn'

/** Scrolls horizontally inside its card, never the page. */
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

export const Th = ({ right, className, ...p }: ThHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) => (
  <th className={cn('whitespace-nowrap border-b border-line bg-surface-2 px-5 py-2.5 text-left text-xs font-semibold text-text-3', right && 'text-right', className)} {...p} />
)

export const Td = ({ right, className, ...p }: TdHTMLAttributes<HTMLTableCellElement> & { right?: boolean }) => (
  <td className={cn('border-b border-line px-5 py-[13px] align-middle', right && 'num text-right', className)} {...p} />
)

/** Pass `onClick` to make the whole row open a detail view. */
export const Tr = ({ onClick, className, ...p }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr
    onClick={onClick}
    className={cn('last:[&>td]:border-b-0', onClick && 'cursor-pointer hover:bg-surface-2', className)}
    {...p}
  />
)

export function EmptyRow({ cols, title, hint }: { cols: number; title: string; hint?: string }) {
  return (
    <tr>
      <td colSpan={cols} className="px-5 py-12 text-center text-text-3">
        <b className="block text-[15px] text-text">{title}</b>
        {hint}
      </td>
    </tr>
  )
}
