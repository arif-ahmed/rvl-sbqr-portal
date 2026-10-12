import { useEffect, useState } from 'react'
import { apiGet } from '../../../shared/api/client'
import { institutionRegistry, type RegistryEntry } from './institution-registry'

/** Wire shape of GET /v1/admin/institutions (camelCase JSON). Note the API
 *  spells the type field `instituteType` (single "t"). */
export type DirectoryEntry = {
  institutionCode: string
  instituteType: string
  institutionName: string
  status: string
  source: string
  syncedAt: string
}

/** Collapse the 6-digit directory code back into the picker's type + 4-digit ID. */
export function toRegistryEntry(e: DirectoryEntry): RegistryEntry {
  return {
    name: e.institutionName,
    type: e.institutionCode.slice(0, 2),
    id: e.institutionCode.slice(2),
  }
}

/** The trust directory only lists institutions that already published a key, so on its own it
 *  can never offer a new institution. Start from the full Annex A registry and let live rows
 *  win on name and trust status; institutions the directory has but Annex A lacks are added. */
export function mergeDirectory(rows: DirectoryEntry[]): RegistryEntry[] {
  const byCode = new Map(institutionRegistry.map((e) => [`${e.type}${e.id}`, e]))
  for (const r of rows) byCode.set(r.institutionCode, toRegistryEntry(r))
  return [...byCode.values()]
}

export type DirectoryState = {
  /** Annex A registry overlaid with live rows from the API, or the registry alone when unreachable. */
  entries: RegistryEntry[]
  /** True when entries came from the API. */
  live: boolean
  /** Directory codes whose trust status is not ACTIVE — shown but not selectable. */
  frozen: string[]
}

/** Trust directory for the onboarding picker. Falls back to the static Annex A
 *  registry when the API is unreachable or nobody is signed in, so onboarding
 *  never hard-blocks on the network. */
export function useInstitutionDirectory(): DirectoryState {
  const [state, setState] = useState<DirectoryState>({
    entries: institutionRegistry,
    live: false,
    frozen: [],
  })

  useEffect(() => {
    let cancelled = false
    apiGet<DirectoryEntry[]>('/v1/admin/institutions')
      .then((rows) => {
        if (cancelled) return
        setState({
          entries: mergeDirectory(rows),
          live: true,
          frozen: rows.filter((r) => r.status !== 'ACTIVE').map((r) => r.institutionCode),
        })
      })
      .catch(() => {
        if (cancelled) return
        setState({ entries: institutionRegistry, live: false, frozen: [] })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}
