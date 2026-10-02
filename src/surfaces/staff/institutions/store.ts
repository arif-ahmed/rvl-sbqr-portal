import { useSyncExternalStore } from 'react'
import type { Institution } from './types'

// UI-only stand-in for the API: a tiny in-memory store so the list and the onboarding
// flow see the same institutions. Fictional data. Replace with TanStack Query once the API exists.

const isoDate = (daysFromNow: number) => new Date(Date.now() + daysFromNow * 86_400_000).toISOString().slice(0, 10)
const cert = (subject: string, days: number) => ({ thumbprint: 'a1'.repeat(32), subject, expiresAt: isoDate(days) })
const person = { contactName: 'Operations Desk', phone: '', address: '' }

function seed(): Institution[] {
  return [
    {
      id: 'inst-1', name: 'Shapla Commercial Bank', type: '00', code: '000901', status: 'Active',
      ...person, contactName: 'Rafiq Ahmed', email: 'rafiq.ahmed@shaplabank.example',
      access: { generation: true, validation: true, clientId: '000901-7c1d9e02' },
      certificate: cert('CN=gateway.shaplabank.example', 300), keyMode: 'Generate',
    },
    {
      id: 'inst-2', name: 'Karnaphuli Trust Bank', type: '00', code: '000902', status: 'Active',
      ...person, contactName: 'Sabina Yasmin', email: 'sabina@karnaphulitrust.example',
      access: { generation: true, validation: true, clientId: '000902-b40e5a11' },
      certificate: cert('CN=gateway.karnaphulitrust.example', 12), keyMode: 'Generate',
    },
    {
      id: 'inst-3', name: 'Teesta Digital Wallet', type: '02', code: '022901', status: 'Active',
      ...person, contactName: 'Nusrat Jahan', email: 'nusrat@teestawallet.example',
      access: { generation: false, validation: true, clientId: '022901-e93b6f48' },
      certificate: cert('CN=gateway.teestawallet.example', 210), keyMode: null,
    },
    {
      id: 'inst-4', name: 'Surma Payments Ltd', type: '03', code: '032901', status: 'Pending',
      ...person, contactName: 'Jahid Hasan', email: 'jahid.hasan@surmapayments.example',
      access: { generation: true, validation: true, clientId: '032901-3f9a1c20' },
      certificate: null, keyMode: null,
    },
    {
      id: 'inst-5', name: 'Nilgiri Mercantile Bank', type: '00', code: '000903', status: 'Pending',
      ...person, contactName: 'Kamal Uddin', email: 'kamal.uddin@nilgirimercantile.example',
      access: null, certificate: null, keyMode: null,
    },
    {
      id: 'inst-6', name: 'Chandra Settlement Services', type: '04', code: '042901', status: 'Suspended',
      ...person, contactName: 'Mizanur Rahman', email: 'mizan@chandrasettlement.example',
      access: { generation: true, validation: true, clientId: '042901-52d7c0aa' },
      certificate: cert('CN=gateway.chandrasettlement.example', 150), keyMode: 'Adopt',
    },
    {
      id: 'inst-7', name: 'Doyel Co-operative Finance', type: '01', code: '012901', status: 'Terminated',
      ...person, contactName: 'Farzana Akter', email: 'farzana@doyelfinance.example',
      access: { generation: true, validation: true, clientId: '012901-9a08be37' },
      certificate: cert('CN=gateway.doyelfinance.example', -40), keyMode: 'Generate',
    },
  ]
}

let items = seed()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

export const getInstitutions = () => items
export const useInstitutions = () => useSyncExternalStore(subscribe, getInstitutions)

export function addInstitution(i: Institution) {
  items = [i, ...items]
  emit()
}

export function patchInstitution(id: string, patch: Partial<Institution>) {
  items = items.map((i) => (i.id === id ? { ...i, ...patch } : i))
  emit()
}

/** For tests: back to the seed data. */
export function resetInstitutions() {
  items = seed()
  emit()
}

export const takenCodes = () => items.map((i) => i.code)
