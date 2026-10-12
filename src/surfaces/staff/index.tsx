import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '../../shared/auth/session'
import { AppShell } from '../../shared/layout/app-shell'
import { ComingSoon } from '../../shared/layout/coming-soon'
import { AdjustmentsPage } from './adjustments/adjustments-page'
import { InstitutionDetail } from './institutions/institution-detail'
import { InstitutionsPage } from './institutions-page'
import { staffNav } from './nav'
import OnboardingPage from './onboarding/onboarding-page'
import { OverviewPage } from './overview-page'
import { PeriodsPage } from './periods/periods-page'
import { StatementPage } from './periods/statement-page'
import { RatesPage } from './rates/rates-page'
import { ReportsPage } from './reports/reports-page'

// RVL staff screens (the platform admin). Reference: design/portal-prototype.html.
// To build a screen: create it in this folder and swap it in for <ComingSoon /> below.
export default function StaffSurface({ session }: { session: Session }) {
  const nav = staffNav()
  const pages = nav.flatMap((n) => ('to' in n ? [n] : []))
  const shell = (title: string, children: React.ReactNode) => (
    <AppShell surface="staff" session={session} nav={nav} title={title}>
      {children}
    </AppShell>
  )
  const page = (to: string, label: string) => {
    if (to === '/staff/overview') return <OverviewPage session={session} />
    if (to === '/staff/institutions') return <InstitutionsPage />
    if (to === '/staff/rates') return <RatesPage />
    if (to === '/staff/periods') return <PeriodsPage session={session} />
    if (to === '/staff/adjustments') return <AdjustmentsPage session={session} />
    if (to === '/staff/reports') return <ReportsPage />
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
      <Route path="institutions/new" element={shell('New institution', <OnboardingPage />)} />
      <Route path="periods/:period/statements/:institutionId" element={shell('Statement', <StatementPage />)} />
      <Route path="reports/institution" element={shell('Reports', <ReportsPage view="institution" />)} />
      <Route path="reports/trend" element={shell('Reports', <ReportsPage view="trend" />)} />
      <Route path="institutions/:id" element={shell('Institution', <InstitutionDetail />)} />
      <Route path="institutions/:id/usage" element={shell('Institution', <InstitutionDetail tab="usage" />)} />
      <Route path="institutions/:id/billing" element={shell('Institution', <InstitutionDetail tab="billing" />)} />
      <Route path="*" element={<Navigate to="/staff/overview" replace />} />
    </Routes>
  )
}
