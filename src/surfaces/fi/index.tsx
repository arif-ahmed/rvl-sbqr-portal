import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { AppShell } from '../../shared/layout/app-shell'
import { ComingSoon } from '../../shared/layout/coming-soon'
import { fiNav } from './nav'

// Financial-institution screens. Reference: design/portal-prototype.html.
// To build a screen: create it in this folder and swap it in for <ComingSoon /> below.
export default function FiSurface({ session }: { session: Session }) {
  const pages = fiNav.flatMap((n) => ('to' in n ? [n] : []))
  return (
    <Routes>
      {pages.map((p) => (
        <Route
          key={p.to}
          path={p.to.replace('/fi/', '')}
          element={
            <AppShell surface="fi" session={session} nav={fiNav} title={p.label}>
              <ComingSoon title={p.label} />
            </AppShell>
          }
        />
      ))}
      <Route path="*" element={<Navigate to="/fi/overview" replace />} />
    </Routes>
  )
}
