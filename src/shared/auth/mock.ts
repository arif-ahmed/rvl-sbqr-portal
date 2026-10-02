import type { Session, Surface } from './session'

// Demo accounts for the prototype phase only. Loaded when VITE_MOCK_AUTH=true.
export const DEMO_PASSWORD = 'Demo@1234'

export const demoAccounts: (Session & { label: string })[] = [
  { userId: 'admin@rvl.example', name: 'Tanvir Hasan', title: 'Platform Admin', role: 'admin', surface: 'staff', label: 'Admin' },
  { userId: 'finance@rvl.example', name: 'Nadia Brian', title: 'Finance', role: 'finance', surface: 'staff', label: 'Finance' },
  { userId: 'ops@shaplabank.example', name: 'Rafiq Ahmed', title: 'Shapla Commercial Bank', role: 'fi', surface: 'fi', label: 'Institution' },
]

export async function mockSignIn(userId: string, password: string, surface: Surface): Promise<Session> {
  const account = demoAccounts.find((a) => a.userId.toLowerCase() === userId.trim().toLowerCase() && a.surface === surface)
  if (!account || password !== DEMO_PASSWORD) throw new Error('Invalid user ID or password.')
  const { label: _label, ...session } = account
  return session
}
