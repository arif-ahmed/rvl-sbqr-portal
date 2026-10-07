import { QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { queryClient } from './shared/api/query'
import { homePath, landingPath, useSession, useSessionStatus, type Surface } from './shared/auth/session'
import { Toaster } from './shared/ui'

// Each surface is its own lazy chunk, loaded only after login for that role,
// so an FI user's browser never downloads staff screens. See DESIGN.md and README.md.
const LoginPage = lazy(() => import('./pages/login'))
const ChangePasswordPage = lazy(() => import('./pages/change-password'))
const StaffSurface = lazy(() => import('./surfaces/staff'))
const FiSurface = lazy(() => import('./surfaces/fi'))

/** Shown while a reload trades the refresh cookie for a session, so a signed-in user never flashes the login page. */
function Restoring() {
  return <div role="status" aria-label="Restoring your session" className="grid min-h-svh place-items-center text-text-3" />
}

/** UI guard only: the API scopes are the real security boundary. */
function Guard({ surface, children }: { surface: Surface; children: (s: NonNullable<ReturnType<typeof useSession>>) => ReactNode }) {
  const session = useSession()
  const status = useSessionStatus()
  const location = useLocation()
  if (status === 'restoring') return <Restoring />
  // Remember where the user was heading so signing back in (or a reload after expiry) returns there.
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (session.mustChangePassword) return <Navigate to={landingPath(session)} replace />
  if (session.surface !== surface) return <Navigate to={homePath(session)} replace />
  return <>{children(session)}</>
}

function Fallback() {
  const session = useSession()
  const status = useSessionStatus()
  if (status === 'restoring') return <Restoring />
  return <Navigate to={session ? landingPath(session) : '/login'} replace />
}

function Public({ children }: { children: ReactNode }) {
  return useSessionStatus() === 'restoring' ? <Restoring /> : <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={null}>
          <Routes>
            <Route path="/login" element={<Public><LoginPage /></Public>} />
            <Route path="/change-password" element={<Public><ChangePasswordPage /></Public>} />
            <Route path="/staff/*" element={<Guard surface="staff">{(s) => <StaffSurface session={s} />}</Guard>} />
            <Route path="/fi/*" element={<Guard surface="fi">{(s) => <FiSurface session={s} />}</Guard>} />
            <Route path="*" element={<Fallback />} />
          </Routes>
        </Suspense>
        <Toaster />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
