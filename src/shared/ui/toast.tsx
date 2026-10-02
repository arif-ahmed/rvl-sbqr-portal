import { useSyncExternalStore } from 'react'
import { cn } from '../cn'
import { getToasts, subscribe } from './toast-store'

export function Toaster() {
  const list = useSyncExternalStore(subscribe, getToasts)
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed top-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {list.map((t) => (
        <div key={t.id} className={cn('rounded-full px-[18px] py-2.5 font-semibold text-surface shadow-lg', t.bad ? 'bg-bad' : 'bg-ok')}>
          {t.text}
        </div>
      ))}
    </div>
  )
}
