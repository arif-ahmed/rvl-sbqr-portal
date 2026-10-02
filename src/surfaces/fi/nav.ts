import { BarChart3, FileText, Home } from 'lucide-react'
import type { NavItem } from '../../shared/layout/app-shell'

export const fiNav: NavItem[] = [
  { to: '/fi/overview', label: 'Overview', icon: Home },
  { to: '/fi/usage', label: 'Usage', icon: BarChart3 },
  { to: '/fi/statements', label: 'Statements', icon: FileText },
]
