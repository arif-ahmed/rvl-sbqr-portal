import { describe, expect, it } from 'vitest'
import { actionsFor, institutionNote, setupItems } from './actions'
import type { OnboardingDto } from './api/types'
import type { Institution } from './types'

const base: Institution = {
  id: 'i', name: 'Example Bank', type: '00', code: '000901', status: 'Active', contactName: '', email: '', phone: '', address: '',
  access: { generation: true, validation: true }, hasRateCard: true, setup: null,
}
const pending = (currentStep: NonNullable<Institution['setup']>['currentStep'], completed = 3): Institution => ({
  ...base, status: 'Pending', setup: { completed, total: 5, currentStep },
})

describe('actionsFor', () => {
  it('lets an Active institution be suspended or terminated', () => {
    expect(actionsFor(base)).toEqual({ primary: null, menu: ['suspend', 'terminate'] })
  })

  it('points a Pending institution with steps left at Continue setup', () => {
    expect(actionsFor(pending('CREDENTIALS'))).toEqual({ primary: 'continue', menu: ['suspend', 'terminate'] })
  })

  it('offers Activate as the main action once only Review is left, and keeps Continue in the menu', () => {
    expect(actionsFor(pending('REVIEW', 4))).toEqual({ primary: 'activate', menu: ['continue', 'suspend', 'terminate'] })
  })

  it('offers Reactivate for Suspended and nothing for Terminated', () => {
    expect(actionsFor({ ...base, status: 'Suspended' })).toEqual({ primary: 'reactivate', menu: ['terminate'] })
    expect(actionsFor({ ...base, status: 'Terminated' })).toEqual({ primary: null, menu: [] })
  })
})

describe('institutionNote', () => {
  it('counts the setup steps of a Pending institution', () => {
    expect(institutionNote(pending('CREDENTIALS', 2))).toEqual({ text: '2 of 5 setup steps done', warn: false })
  })

  it('warns when a live institution has no rate card', () => {
    expect(institutionNote({ ...base, hasRateCard: false })).toEqual({ text: 'No rate card, usage is not billed', warn: true })
  })

  it('says nothing about a healthy institution', () => {
    expect(institutionNote(base)).toBeNull()
  })
})

describe('setupItems', () => {
  it('reports the status of each step in the order the API returns', () => {
    const onboarding = {
      steps: [
        { code: 'PROFILE', status: 'COMPLETED' },
        { code: 'SIGNING_KEY', status: 'NOT_STARTED' },
      ],
    } as OnboardingDto
    expect(setupItems(onboarding)).toEqual([
      { label: 'Institution', done: true },
      { label: 'Signing key', done: false },
    ])
  })

  it('is empty until the onboarding view has loaded', () => {
    expect(setupItems(undefined)).toEqual([])
  })
})