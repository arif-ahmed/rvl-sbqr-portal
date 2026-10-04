import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend, installFakeBackend } from '../../test/fake-backend'
import { renderApp } from '../../test/providers'
import { InstitutionDetail } from './institutions/institution-detail'
import { InstitutionsPage } from './institutions-page'

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
})
afterEach(() => backend.reset())

async function setup(role: 'admin' | 'finance' = 'admin') {
  const user = userEvent.setup()
  renderApp(
    <Routes>
      <Route path="/staff/institutions" element={<InstitutionsPage role={role} />} />
      <Route path="/staff/institutions/new" element={<p>onboarding</p>} />
      <Route path="/staff/institutions/:id" element={<InstitutionDetail role={role} />} />
    </Routes>,
    ['/staff/institutions'],
  )
  await screen.findByText('Shapla Commercial Bank')
  return user
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

describe('institutions list', () => {
  it('shows the institutions from the API with status and setup hints', async () => {
    await setup()
    expect(screen.getAllByRole('row')).toHaveLength(8)
    expect(within(row('Surma')).getByText('3 of 5 setup steps done')).toBeInTheDocument()
    expect(within(row('Teesta')).getByText('No rate card, usage is not billed')).toBeInTheDocument()
    expect(within(row('Shapla')).queryByText(/setup steps|No rate card/)).not.toBeInTheDocument()
    expect(within(row('Nilgiri')).getByText('Not set up')).toBeInTheDocument()
  })

  it('filters by search and status', async () => {
    const user = await setup()
    await user.type(screen.getByLabelText('Search institutions'), 'shapla')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.clear(screen.getByLabelText('Search institutions'))
    await user.selectOptions(screen.getByLabelText('Status'), 'Suspended')
    expect(screen.getByText('Chandra Settlement Services')).toBeInTheDocument()
    expect(screen.queryByText('Shapla Commercial Bank')).not.toBeInTheDocument()
  })

  it('suspends and reactivates an institution through the API after confirmation', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'More actions for Shapla Commercial Bank' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    await user.type(await screen.findByLabelText('Reason (optional)'), 'KYC review')
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    await waitFor(() => expect(within(row('Shapla')).getByText('Suspended')).toBeInTheDocument())
    expect(backend.callsTo('POST', '/inst-1/suspend')[0].body).toEqual({ reason: 'KYC review' })

    await user.click(within(row('Shapla')).getByRole('button', { name: 'Reactivate' }))
    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))
    await waitFor(() => expect(within(row('Shapla')).getByText('Active')).toBeInTheDocument())
    expect(backend.callsTo('POST', '/inst-1/reactivate')).toHaveLength(1)
  })

  it('leaves a terminated institution with no actions', async () => {
    const user = await setup()
    await user.click(screen.getByRole('button', { name: 'More actions for Nilgiri Mercantile Bank' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Terminate' }))
    await user.click(await screen.findByRole('button', { name: 'Terminate' }))
    await waitFor(() => expect(within(row('Nilgiri')).getByText('Terminated')).toBeInTheDocument())
    expect(within(row('Nilgiri')).queryByRole('button')).not.toBeInTheDocument()
  })

  it('keeps the institution unchanged when the API refuses the action', async () => {
    const user = await setup()
    backend.failNext('POST', '/v1/admin/tenants/inst-1/suspend', 409)
    await user.click(screen.getByRole('button', { name: 'More actions for Shapla Commercial Bank' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Suspend' })).not.toBeInTheDocument())
    expect(within(row('Shapla')).getByText('Active')).toBeInTheDocument()
  })

  it('sends Continue setup to the onboarding flow', async () => {
    const user = await setup()
    await user.click(within(row('Surma')).getByRole('button', { name: 'Continue setup' }))
    expect(await screen.findByText('onboarding')).toBeInTheDocument()
  })

  it('gives Finance a read-only list', async () => {
    await setup('finance')
    expect(screen.queryByRole('button', { name: /actions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add institution' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('opens the detail page from a row click, but not from an action', async () => {
    const user = await setup()
    await user.click(within(row('Shapla')).getByText('000901'))
    expect(await screen.findByRole('heading', { name: 'Shapla Commercial Bank' })).toBeInTheDocument()
    expect(await screen.findByText('000901-7c1d9e02')).toBeInTheDocument()
  })

  it('does not navigate when an action is used', async () => {
    const user = await setup()
    await user.click(within(row('Surma')).getByRole('button', { name: 'Continue setup' }))
    expect(await screen.findByText('onboarding')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Surma Payments Ltd' })).not.toBeInTheDocument()
  })
})

describe('institutions list when the API fails', () => {
  it('says so and recovers on retry', async () => {
    const user = userEvent.setup()
    backend.failNext('GET', '/v1/admin/tenants', 500)
    renderApp(<InstitutionsPage role="admin" />)
    expect(await screen.findByText('Could not load institutions')).toBeInTheDocument()
    expect(screen.queryByText('No institutions match')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Shapla Commercial Bank')).toBeInTheDocument()
    expect(screen.queryByText('Could not load institutions')).not.toBeInTheDocument()
  })
})
