import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { InstitutionDetail } from './institutions/institution-detail'
import { InstitutionsPage } from './institutions-page'
import { resetInstitutions } from './institutions/store'

function setup(role: 'admin' | 'finance' = 'admin') {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={['/staff/institutions']}>
      <Routes>
        <Route path="/staff/institutions" element={<InstitutionsPage role={role} />} />
        <Route path="/staff/institutions/new" element={<p>onboarding</p>} />
        <Route path="/staff/institutions/:id" element={<InstitutionDetail role={role} />} />
      </Routes>
    </MemoryRouter>,
  )
  return user
}

const row = (name: string) => screen.getByRole('row', { name: new RegExp(name) })

describe('institutions list', () => {
  afterEach(resetInstitutions)

  it('shows the dummy institutions with status and setup hints', () => {
    setup()
    expect(screen.getAllByRole('row')).toHaveLength(8)
    expect(within(row('Karnaphuli')).getByText(/Certificate expires in/)).toBeInTheDocument()
    expect(within(row('Surma')).getByText(/of 5 setup items done/)).toBeInTheDocument()
  })

  it('filters by search and status', async () => {
    const user = setup()
    await user.type(screen.getByLabelText('Search institutions'), 'shapla')
    expect(screen.getAllByRole('row')).toHaveLength(2)
    await user.clear(screen.getByLabelText('Search institutions'))
    await user.selectOptions(screen.getByLabelText('Status'), 'Suspended')
    expect(screen.getByText('Chandra Settlement Services')).toBeInTheDocument()
    expect(screen.queryByText('Shapla Commercial Bank')).not.toBeInTheDocument()
  })

  it('suspends and reactivates an institution after confirmation', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'More actions for Shapla Commercial Bank' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(within(row('Shapla')).getByText('Suspended')).toBeInTheDocument()
    await user.click(within(row('Shapla')).getByRole('button', { name: 'Reactivate' }))
    await user.click(await screen.findByRole('button', { name: 'Reactivate' }))
    expect(within(row('Shapla')).getByText('Active')).toBeInTheDocument()
  })

  it('leaves a terminated institution with no actions', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'More actions for Nilgiri Mercantile Bank' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Terminate' }))
    await user.click(await screen.findByRole('button', { name: 'Terminate' }))
    const nilgiri = row('Nilgiri')
    expect(within(nilgiri).getByText('Terminated')).toBeInTheDocument()
    expect(within(nilgiri).queryByRole('button')).not.toBeInTheDocument()
  })

  it('sends Continue setup to the onboarding flow', async () => {
    const user = setup()
    await user.click(within(row('Surma')).getByRole('button', { name: 'Continue setup' }))
    expect(await screen.findByText('onboarding')).toBeInTheDocument()
  })

  it('gives Finance a read-only list', () => {
    setup('finance')
    expect(screen.queryByRole('button', { name: /actions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add institution' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument()
  })

  it('opens the detail page from a row click or the name link, but not from an action', async () => {
    const user = setup()
    await user.click(within(row('Shapla')).getByText('000901'))
    expect(await screen.findByRole('heading', { name: 'Shapla Commercial Bank' })).toBeInTheDocument()
    expect(screen.getByText('000901-7c1d9e02')).toBeInTheDocument()
  })

  it('does not navigate when an action is used', async () => {
    const user = setup()
    await user.click(within(row('Surma')).getByRole('button', { name: 'Continue setup' }))
    expect(await screen.findByText('onboarding')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Surma Payments Ltd' })).not.toBeInTheDocument()
  })
})
