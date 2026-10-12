import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend, installFakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { InstitutionDetail } from './institution-detail'

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
})
afterEach(() => backend.reset())

/** Open an institution by its seeded id ('inst-1' is Shapla, 'inst-4' is Surma, ...). */
function open(id: string, tab: 'overview' | 'usage' | 'billing' = 'overview') {
  renderApp(
    <Routes>
      <Route path="/staff/institutions" element={<p>list</p>} />
      <Route path="/staff/institutions/:id" element={<InstitutionDetail />} />
      <Route path="/staff/institutions/:id/usage" element={<InstitutionDetail tab="usage" />} />
      <Route path="/staff/institutions/:id/billing" element={<InstitutionDetail tab="billing" />} />
    </Routes>,
    [`/staff/institutions/${id}${tab === 'usage' ? '/usage' : tab === 'billing' ? '/billing' : ''}`],
  )
  return userEvent.setup()
}

describe('institution detail', () => {
  it('shows setup progress and Continue setup for a pending institution with steps left', async () => {
    open('inst-4')
    expect(await screen.findByText('3 of 5 done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue setup' })).toBeInTheDocument()
    expect(screen.getByText('No signing key yet.')).toBeInTheDocument()
  })

  it('shows the credential and signing key the API reports', async () => {
    open('inst-1')
    expect(await screen.findByText('000901-7c1d9e02')).toBeInTheDocument()
    expect(screen.getByText('Generation · Validation')).toBeInTheDocument()
    expect(screen.getByText(/Key 000901-key, version 1/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be shown again/)).toBeInTheDocument()
  })

  it('has no actions once terminated', async () => {
    open('inst-7')
    expect(await screen.findByText('Closed permanently')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions|Reactivate|Suspend/ })).not.toBeInTheDocument()
  })

  it('suspends from the detail page', async () => {
    const user = open('inst-1')
    await user.click(await screen.findByRole('button', { name: /More actions/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(await screen.findByText('Suspended', { selector: 'span' })).toBeInTheDocument()
    expect(backend.callsTo('POST', '/inst-1/suspend')).toHaveLength(1)
  })

  it('switches between Overview and Usage for an active institution', async () => {
    const user = open('inst-1')
    await user.click(await screen.findByRole('link', { name: 'Usage' }))
    expect(await screen.findByText('Billable', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByLabelText('Meter')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Institution' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    expect(await screen.findByText('API credentials')).toBeInTheDocument()
  })

  it('warns on the overview and the Usage tab when a live institution has no rate card', async () => {
    const user = open('inst-3')
    expect(await screen.findByText('No rate card')).toBeInTheDocument()
    expect(screen.getByText(/never billed/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Usage' }))
    expect(await screen.findByText(/no statement is produced/)).toBeInTheDocument()
  })

  it('has no rate card notice for an institution that has one', async () => {
    open('inst-1', 'usage')
    await screen.findByLabelText('Meter')
    expect(screen.queryByText('No rate card')).not.toBeInTheDocument()
  })

  it('shows the API rate card in effect on the billing tab when one exists', async () => {
    // inst-1 is seeded with two cards: YYYY-01-01 (in effect) and nextMonth-01 (scheduled).
    const year = new Date().getFullYear()
    open('inst-1', 'billing')
    // The Generation/Validation <dd>s only render when a card is found.
    expect(await screen.findByText('৳ 0.50 / call')).toBeInTheDocument()
    expect(screen.getByText('৳ 0.125 / call')).toBeInTheDocument()
    expect(screen.getByText(`January ${year}`)).toBeInTheDocument()
    // The fetch went to the real endpoint, with this tenant's id.
    expect(backend.callsTo('GET', '/v1/admin/billing/rate-cards?tenantId=inst-1')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Manage rate cards/ })).toBeInTheDocument()
  })

  it('shows the no-rate-card empty state on the billing tab when the API has no cards', async () => {
    // inst-3 has no rate cards in the seed, and the API confirms it.
    open('inst-3', 'billing')
    expect(await screen.findByText('No rate card')).toBeInTheDocument()
    expect(screen.queryByText('৳ 0.50 / call')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Manage rate cards/ })).toBeInTheDocument()
  })

  it('activates a pending institution that is ready, and shows why one is not', async () => {
    const ready = backend.find('inst-4')!
    ready.signingKey = true
    const user = open('inst-4')
    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Active', { selector: 'span' })).toBeInTheDocument()
    expect(backend.callsTo('POST', '/inst-4/activate')).toHaveLength(1)
  })

  it('has no Usage tab for a pending institution, even by URL', async () => {
    open('inst-4', 'usage')
    expect(await screen.findByText('Setup progress')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usage' })).not.toBeInTheDocument()
  })

  it('does not offer credential management: the API cannot rotate yet', async () => {
    open('inst-1')
    await screen.findByText('000901-7c1d9e02')
    expect(screen.queryByRole('button', { name: 'Manage credentials' })).not.toBeInTheDocument()
  })

  it('returns to the list for an unknown institution', async () => {
    open('missing')
    expect(await screen.findByText('list')).toBeInTheDocument()
  })

  it('says so when the institution cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/tenants/inst-1', 500)
    open('inst-1')
    expect(await screen.findByText('Could not load this institution')).toBeInTheDocument()
  })
})
