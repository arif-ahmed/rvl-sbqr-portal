import { BarChart3, FileText, Home, ShieldCheck, User } from 'lucide-react'
import type { NavItem } from '../../shared/layout/app-shell'

export const fiNav: NavItem[] = [
  { to: '/fi/overview', label: 'Overview', icon: Home },
  { to: '/fi/usage', label: 'Usage', icon: BarChart3 },
  { to: '/fi/statements', label: 'Statements', icon: FileText },
  { to: '/fi/apps', label: 'Applications & certificate', icon: ShieldCheck },
  { to: '/fi/account', label: 'Account', icon: User },
]
