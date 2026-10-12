import { Building2, CreditCard, FileText, Flag, Home, KeyRound, PlusCircle, QrCode } from 'lucide-react'
import type { NavItem } from '../../shared/layout/app-shell'

// One list drives both the sidebar and the routes, so they cannot drift apart.
const base: NavItem[] = [
  { to: '/staff/overview', label: 'Overview', icon: Home },
  { to: '/staff/institutions', label: 'Institutions', icon: Building2 },
]

const billing: NavItem[] = [
  { heading: 'Billing' },
  { to: '/staff/rates', label: 'Rate cards', icon: CreditCard },
  { to: '/staff/periods', label: 'Billing periods', icon: FileText },
  { to: '/staff/adjustments', label: 'Adjustments', icon: PlusCircle },
  { to: '/staff/reports', label: 'Reports', icon: Flag },
]

const platform: NavItem[] = [
  { heading: 'Platform' },
  { to: '/staff/keys', label: 'Crypto keys', icon: KeyRound },
  { to: '/staff/inspector', label: 'QR inspector', icon: QrCode },
]

export const staffNav = (): NavItem[] => [...base, ...billing, ...platform]
