import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { AppShell } from '../../shared/layout/app-shell'
import { ComingSoon } from '../../shared/layout/coming-soon'
import { InstitutionDetail } from './institutions/institution-detail'
import { InstitutionsPage } from './institutions-page'
import { staffNav } from './nav'
import OnboardingPage from './onboarding/onboarding-page'
import { RatesPage } from './rates/rates-page'

// RVL Admin and Finance screens. Reference: design/portal-prototype.html.
// To build a screen: create it in this folder and swap it in for <ComingSoon /> below.
export default function StaffSurface({ session }: { session: Session }) {
  const nav = staffNav(session.role)
  const pages = nav.flatMap((n) => ('to' in n ? [n] : []))
  const shell = (title: string, children: React.ReactNode) => (
    <AppShell surface="staff" session={session} nav={nav} title={title}>
      {children}
    </AppShell>
  )
  const page = (to: string, label: string) => {
    if (to === '/staff/institutions') return <InstitutionsPage role={session.role} />
    if (to === '/staff/rates') return <RatesPage />
    return <ComingSoon title={label} />
  }
  return (
    <Routes>
      {pages.map((p) => (
        <Route
          key={p.to}
          path={p.to.replace('/staff/', '')}
          element={shell(p.label, page(p.to, p.label))}
        />
      ))}
      {/* Admin only; Finance falls through to the redirect below. The API enforces this too. */}
      {session.role === 'admin' && <Route path="institutions/new" element={shell('New institution', <OnboardingPage />)} />}
      <Route path="institutions/:id" element={shell('Institution', <InstitutionDetail role={session.role} />)} />
      <Route path="institutions/:id/usage" element={shell('Institution', <InstitutionDetail role={session.role} tab="usage" />)} />
      <Route path="*" element={<Navigate to="/staff/overview" replace />} />
    </Routes>
  )
}
