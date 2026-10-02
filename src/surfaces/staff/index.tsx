import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { AppShell } from '../../shared/layout/app-shell'
import { ComingSoon } from '../../shared/layout/coming-soon'
import { staffNav } from './nav'

// RVL Admin and Finance screens. Reference: design/portal-prototype.html.
// To build a screen: create it in this folder and swap it in for <ComingSoon /> below.
export default function StaffSurface({ session }: { session: Session }) {
  const nav = staffNav(session.role)
  const pages = nav.flatMap((n) => ('to' in n ? [n] : []))
  return (
    <Routes>
      {pages.map((p) => (
        <Route
          key={p.to}
          path={p.to.replace('/staff/', '')}
          element={
            <AppShell surface="staff" session={session} nav={nav} title={p.label}>
              <ComingSoon title={p.label} />
            </AppShell>
          }
        />
      ))}
      <Route path="*" element={<Navigate to="/staff/overview" replace />} />
    </Routes>
  )
}
