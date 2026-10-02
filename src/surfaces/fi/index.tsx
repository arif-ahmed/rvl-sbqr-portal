import { useEffect } from 'react'

// Financial-institution screens go here. Reference: design/portal-prototype.html
export default function FiSurface() {
  useEffect(() => {
    document.documentElement.dataset.surface = 'fi'
  }, [])
  return (
    <main className="p-8">
      <h1 className="font-head text-2xl font-bold">Institution Portal</h1>
      <p className="mt-2 text-text-2">Not built yet. See design/portal-prototype.html.</p>
    </main>
  )
}
