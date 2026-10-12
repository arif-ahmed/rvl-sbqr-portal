import * as Menu from '@radix-ui/react-dropdown-menu'
import { KeyRound, LogOut, Menu as MenuIcon, QrCode, SunMoon, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { signOut, type Session, type Surface } from '../auth/session'
import { cn } from '../cn'
import { applyTheme, cycleTheme, getTheme } from '../theme'

export type NavItem = { to: string; label: string; icon: LucideIcon; badge?: number } | { heading: string }

const linkBase = 'flex min-h-11 items-center gap-3 rounded-full px-3 font-medium transition-colors lg:min-h-10'

/** Sidebar + top bar for a signed-in surface. Pages render as children. */
export function AppShell(props: { surface: Surface; session: Session; nav: NavItem[]; title: string; children: ReactNode }) {
  const { surface, session, nav, title, children } = props
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.dataset.surface = surface
    applyTheme(getTheme())
  }, [surface])

  const initials = session.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="grid min-h-svh lg:grid-cols-[244px_minmax(0,1fr)] print:block">
      <aside
        aria-label="Primary"
        className={cn(
          'print:hidden fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col gap-0.5 overflow-auto bg-side p-3.5 text-side-text transition-transform lg:sticky lg:top-0 lg:z-auto lg:h-svh lg:w-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center gap-3 px-2 pt-0.5 pb-5 text-white">
          <span className="grid size-9 place-items-center rounded-[10px] bg-white text-accent-strong">
            <QrCode className="size-5" aria-hidden />
          </span>
          <div>
            <b className="block font-head text-sm leading-[17px]">Secure Bangla QR</b>
            <span className="text-[11.5px] text-side-head">{surface === 'staff' ? 'Staff Console' : session.title}</span>
          </div>
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5">
          {nav.map((item) =>
            'heading' in item ? (
              <div key={item.heading} className="px-3 pt-4 pb-1.5 text-[10.5px] font-semibold tracking-[0.09em] text-side-head uppercase">
                {item.heading}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(linkBase, isActive ? 'bg-accent text-on-accent' : 'hover:bg-side-2 hover:text-white')}
              >
                <item.icon className="size-[18px] shrink-0" aria-hidden />
                {item.label}
                {item.badge ? <span className="ml-auto rounded-full bg-bad px-1.5 text-[11px] leading-[18px] font-semibold text-white">{item.badge}</span> : null}
              </NavLink>
            ),
          )}
        </nav>
        <div className="mt-auto border-t border-white/10 pt-3.5">
          <button
            className={cn(linkBase, 'w-full hover:bg-side-2 hover:text-white')}
            onClick={() => {
              void signOut()
              navigate('/login')
            }}
          >
            <LogOut className="size-[18px]" aria-hidden /> Log out
          </button>
        </div>
      </aside>
      {open && <div className="fixed inset-0 z-40 bg-black/55 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

      <div className="min-w-0">
        <header className="print:hidden sticky top-0 z-30 flex min-h-16 items-center gap-2.5 border-b border-line bg-surface px-4 py-2.5 lg:px-7">
          <button className="grid size-10 place-items-center rounded-full border border-line lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <MenuIcon className="size-[18px]" />
          </button>
          <div>
            <div className="text-xs text-text-3">{surface === 'staff' ? 'Staff Console' : 'Institution Portal'}</div>
            <h1 className="text-base leading-[22px] font-semibold">{title}</h1>
          </div>
          <span className="flex-1" />
          <button
            className="grid size-10 place-items-center rounded-full border border-line text-text-2 hover:bg-surface-2"
            aria-label="Change theme"
            onClick={cycleTheme}
          >
            <SunMoon className="size-[18px]" />
          </button>
          <Menu.Root>
            <Menu.Trigger className="flex items-center gap-2.5 rounded-full border border-transparent p-[3px] pr-2.5 hover:border-line hover:bg-surface-2" aria-label="Account menu">
              <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent-strong">{initials}</span>
              <span className="hidden text-left sm:block">
                <strong className="block text-[13px] leading-4">{session.name}</strong>
                <small className="block text-[11.5px] leading-3.5 text-text-3">{session.title}</small>
              </span>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Content align="end" sideOffset={8} className="z-50 min-w-56 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <div className="border-b border-line px-4 py-3">
                  <b>{session.name}</b>
                  <div className="text-[12.5px] text-text-3">{session.username}</div>
                </div>
                <Menu.Item
                  className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 outline-none data-[highlighted]:bg-surface-2"
                  onSelect={() => navigate('/change-password')}
                >
                  <KeyRound className="size-4" aria-hidden /> Change password
                </Menu.Item>
                <Menu.Item
                  className="flex cursor-pointer items-center gap-2.5 px-4 py-2.5 outline-none data-[highlighted]:bg-surface-2"
                  onSelect={() => {
                    void signOut()
                    navigate('/login')
                  }}
                >
                  <LogOut className="size-4" aria-hidden /> Log out
                </Menu.Item>
              </Menu.Content>
            </Menu.Portal>
          </Menu.Root>
        </header>
        <main className="max-w-[1360px] p-4 lg:p-7 print:max-w-none print:px-[16mm] print:pt-[14mm] print:pb-[26mm]">{children}</main>
      </div>
    </div>
  )
}
