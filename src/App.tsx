import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from './shared/ui'

// Each surface is its own lazy chunk, loaded only after login for that role,
// so an FI user's browser never downloads staff screens. See DESIGN.md and README.md.
const StaffSurface = lazy(() => import('./surfaces/staff'))
const FiSurface = lazy(() => import('./surfaces/fi'))

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/staff/*" element={<StaffSurface />} />
          <Route path="/fi/*" element={<FiSurface />} />
          <Route path="*" element={<Navigate to="/fi" replace />} />
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  )
}
