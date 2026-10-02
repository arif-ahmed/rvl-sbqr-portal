import { describe, expect, it } from 'vitest'
import { actionsFor, isSetupComplete } from './actions'
import { getInstitutions } from './store'
import type { Institution } from './types'

const byName = (name: string): Institution => getInstitutions().find((i) => i.name.startsWith(name))!

describe('actionsFor', () => {
  it('lets an Active institution be suspended, terminated or get a new certificate', () => {
    expect(actionsFor(byName('Shapla'))).toEqual({ primary: null, menu: ['certificate', 'suspend', 'terminate'] })
  })

  it('points a Pending institution with gaps at Continue setup', () => {
    const surma = byName('Surma')
    expect(isSetupComplete(surma)).toBe(false)
    expect(actionsFor(surma)).toEqual({ primary: 'continue', menu: ['activate', 'suspend', 'terminate'] })
  })

  it('offers Activate as the main action once setup is complete', () => {
    const done = { ...byName('Shapla'), status: 'Pending' as const }
    expect(actionsFor(done).primary).toBe('activate')
  })

  it('does not require a signing key from a validate-only institution', () => {
    expect(isSetupComplete(byName('Teesta'))).toBe(true)
  })

  it('offers Reactivate for Suspended and nothing for Terminated', () => {
    expect(actionsFor(byName('Chandra'))).toEqual({ primary: 'reactivate', menu: ['terminate'] })
    expect(actionsFor(byName('Doyel'))).toEqual({ primary: null, menu: [] })
  })
})
