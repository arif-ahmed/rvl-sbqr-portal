import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { AppShell } from '../../shared/layout/app-shell'
import { ComingSoon } from '../../shared/layout/coming-soon'
import { fiNav } from './nav'
import { StatementDetailPage } from './statement-detail-page'
import { StatementsPage } from './statements-page'
import { UsagePage } from './usage-page'

// Financial-institution screens. Reference: design/portal-prototype.html.
// To build a screen: create it in this folder and swap it in for <ComingSoon /> below.
export default function FiSurface({ session }: { session: Session }) {
  const pages = fiNav.flatMap((n) => ('to' in n ? [n] : []))
  const shell = (title: string, page: ReactNode) => (
    <AppShell surface="fi" session={session} nav={fiNav} title={title}>
      {page}
    </AppShell>
  )
  return (
    <Routes>
      {pages.map((p) => (
        <Route
          key={p.to}
          path={p.to.replace('/fi/', '')}
          element={shell(
            p.label,
            p.to === '/fi/usage' ? <UsagePage /> : p.to === '/fi/statements' ? <StatementsPage /> : <ComingSoon title={p.label} />,
          )}
        />
      ))}
      <Route path="statements/:period" element={shell('Statements', <StatementDetailPage />)} />
      <Route path="*" element={<Navigate to="/fi/overview" replace />} />
    </Routes>
  )
}
