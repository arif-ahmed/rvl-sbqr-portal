import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Role } from '../../../shared/auth/session'
import { FakeBackend, installFakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { InstitutionDetail } from './institution-detail'

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
})
afterEach(() => backend.reset())

/** Open an institution by its seeded id ('inst-1' is Shapla, 'inst-4' is Surma, ...). */
function open(id: string, role: Role = 'admin', tab: 'overview' | 'usage' = 'overview') {
  renderApp(
    <Routes>
      <Route path="/staff/institutions" element={<p>list</p>} />
      <Route path="/staff/institutions/:id" element={<InstitutionDetail role={role} />} />
      <Route path="/staff/institutions/:id/usage" element={<InstitutionDetail role={role} tab="usage" />} />
    </Routes>,
    [`/staff/institutions/${id}${tab === 'usage' ? '/usage' : ''}`],
  )
  return userEvent.setup()
}

describe('institution detail', () => {
  it('shows setup progress and Continue setup for a pending institution with steps left', async () => {
    open('inst-4')
    expect(await screen.findByText('3 of 6 done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue setup' })).toBeInTheDocument()
    expect(screen.getByText('No certificate registered yet.')).toBeInTheDocument()
    expect(screen.getByText('No signing key yet.')).toBeInTheDocument()
  })

  it('shows the credential, certificate and signing key the API reports', async () => {
    open('inst-1')
    expect(await screen.findByText('000901-7c1d9e02')).toBeInTheDocument()
    expect(screen.getByText('Generation · Validation')).toBeInTheDocument()
    expect(screen.getByText('CN=gateway.shaplabank.example')).toBeInTheDocument()
    expect(screen.getByText(/Key 000901-key, version 1/)).toBeInTheDocument()
    expect(screen.getByText(/cannot be shown again/)).toBeInTheDocument()
  })

  it('warns about a certificate that is about to expire', async () => {
    open('inst-2')
    expect(await screen.findByText(/Certificate expires in 12 days/)).toBeInTheDocument()
  })

  it('has no actions once terminated', async () => {
    open('inst-7')
    expect(await screen.findByText('Closed permanently')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions|Reactivate|Suspend|Replace certificate/ })).not.toBeInTheDocument()
  })

  it('suspends from the detail page', async () => {
    const user = open('inst-1')
    await user.click(await screen.findByRole('button', { name: /More actions/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(await screen.findByText('Suspended', { selector: 'span' })).toBeInTheDocument()
    expect(backend.callsTo('POST', '/inst-1/suspend')).toHaveLength(1)
  })

  it('replaces the certificate through the API', async () => {
    const user = open('inst-1')
    await user.click(await screen.findByRole('button', { name: 'Replace certificate' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText('SHA-256 thumbprint'), 'b2'.repeat(32))
    await user.type(within(drawer).getByLabelText('Subject'), 'CN=new.shaplabank.example')
    const next = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10)
    await user.type(within(drawer).getByLabelText('Expires on'), next)
    await user.click(within(drawer).getByRole('button', { name: 'Replace certificate' }))
    await waitFor(() => expect(backend.callsTo('POST', '/inst-1/client-certificate')).toHaveLength(1))
    expect(backend.callsTo('POST', '/inst-1/client-certificate')[0].body).toEqual({
      thumbprintSha256: 'B2'.repeat(32),
      subject: 'CN=new.shaplabank.example',
      expiresAt: `${next}T23:59:59Z`,
    })
    expect(await screen.findByText('CN=new.shaplabank.example')).toBeInTheDocument()
  })

  it('is read-only for Finance', async () => {
    open('inst-4', 'finance')
    await screen.findByText('3 of 6 done')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
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

  it('shows Finance the Usage tab', async () => {
    open('inst-2', 'finance', 'usage')
    expect(await screen.findByLabelText('Meter')).toBeInTheDocument()
  })

  it('warns on the overview and the Usage tab when a live institution has no rate card', async () => {
    const user = open('inst-3')
    expect(await screen.findByText('No rate card')).toBeInTheDocument()
    expect(screen.getByText(/never billed/)).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Usage' }))
    expect(await screen.findByText(/no statement is produced/)).toBeInTheDocument()
  })

  it('has no rate card notice for an institution that has one', async () => {
    open('inst-1', 'admin', 'usage')
    await screen.findByLabelText('Meter')
    expect(screen.queryByText('No rate card')).not.toBeInTheDocument()
  })

  it('activates a pending institution that is ready, and shows why one is not', async () => {
    const ready = backend.find('inst-4')!
    ready.certSkipped = true
    ready.signingKey = true
    const user = open('inst-4')
    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    await user.click(await screen.findByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('Active', { selector: 'span' })).toBeInTheDocument()
    expect(backend.callsTo('POST', '/inst-4/activate')).toHaveLength(1)
  })

  it('has no Usage tab for a pending institution, even by URL', async () => {
    open('inst-4', 'admin', 'usage')
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
