import { useEffect } from 'react'

// RVL Admin + Finance screens go here. Reference: design/portal-prototype.html
export default function StaffSurface() {
  useEffect(() => {
    document.documentElement.dataset.surface = 'staff'
  }, [])
  return (
    <main className="p-8">
      <h1 className="font-head text-2xl font-bold">Staff Console</h1>
      <p className="mt-2 text-text-2">Not built yet. See design/portal-prototype.html.</p>
    </main>
  )
}
