import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { homePath, useSession, type Surface } from './shared/auth/session'
import { Toaster } from './shared/ui'

// Each surface is its own lazy chunk, loaded only after login for that role,
// so an FI user's browser never downloads staff screens. See DESIGN.md and README.md.
const LoginPage = lazy(() => import('./pages/login'))
const StaffSurface = lazy(() => import('./surfaces/staff'))
const FiSurface = lazy(() => import('./surfaces/fi'))

/** UI guard only: the API scopes are the real security boundary. */
function Guard({ surface, children }: { surface: Surface; children: (s: NonNullable<ReturnType<typeof useSession>>) => ReactNode }) {
  const session = useSession()
  if (!session) return <Navigate to="/login" replace />
  if (session.surface !== surface) return <Navigate to={homePath(session)} replace />
  return <>{children(session)}</>
}

function Fallback() {
  const session = useSession()
  return <Navigate to={session ? homePath(session) : '/login'} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/staff/*" element={<Guard surface="staff">{(s) => <StaffSurface session={s} />}</Guard>} />
          <Route path="/fi/*" element={<Guard surface="fi">{(s) => <FiSurface session={s} />}</Guard>} />
          <Route path="*" element={<Fallback />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
