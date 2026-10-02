import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Role } from '../../../shared/auth/session'
import { InstitutionDetail } from './institution-detail'
import { currentMonth } from '../rates/rates'
import { addRateCard, resetRateCards } from '../rates/store'
import { getInstitutions, resetInstitutions } from './store'

function open(name: string, role: Role = 'admin', tab: 'overview' | 'usage' = 'overview') {
  const id = name ? getInstitutions().find((i) => i.name.startsWith(name))?.id : 'missing'
  render(
    <MemoryRouter initialEntries={[`/staff/institutions/${id}${tab === 'usage' ? '/usage' : ''}`]}>
      <Routes>
        <Route path="/staff/institutions" element={<p>list</p>} />
        <Route path="/staff/institutions/:id" element={<InstitutionDetail role={role} />} />
        <Route path="/staff/institutions/:id/usage" element={<InstitutionDetail role={role} tab="usage" />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('institution detail', () => {
  afterEach(() => {
    resetInstitutions()
    resetRateCards()
  })

  it('shows setup progress and Continue setup for a pending institution with gaps', () => {
    open('Surma')
    expect(screen.getByText('2 of 4 done')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue setup' })).toBeInTheDocument()
    expect(screen.getByText('No certificate registered yet.')).toBeInTheDocument()
  })

  it('says the signing key is not needed for a validate-only institution', () => {
    open('Teesta')
    expect(screen.getByText(/Not needed/)).toBeInTheDocument()
  })

  it('warns about a certificate that is about to expire', () => {
    open('Karnaphuli')
    expect(screen.getByText(/Certificate expires in/)).toBeInTheDocument()
  })

  it('has no actions once terminated', () => {
    open('Doyel')
    expect(screen.getByText('Closed permanently')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /actions|Reactivate|Suspend/ })).not.toBeInTheDocument()
  })

  it('suspends from the detail page', async () => {
    const user = open('Shapla')
    await user.click(screen.getByRole('button', { name: /More actions/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Suspend' }))
    await user.click(await screen.findByRole('button', { name: 'Suspend' }))
    expect(await screen.findByText('Suspended', { selector: 'span' })).toBeInTheDocument()
  })

  it('is read-only for Finance', () => {
    open('Surma', 'finance')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('switches between Overview and Usage for an active institution', async () => {
    const user = open('Shapla')
    await user.click(screen.getByRole('link', { name: 'Usage' }))
    expect(screen.getByText('Billable', { selector: 'dt' })).toBeInTheDocument()
    expect(screen.getByLabelText('Search usage')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Institution' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Overview' }))
    expect(screen.getByText('API credentials')).toBeInTheDocument()
  })

  it('shows Finance the Usage tab', () => {
    open('Karnaphuli', 'finance', 'usage')
    expect(screen.getByLabelText('Search usage')).toBeInTheDocument()
  })

  it('explains when an institution has no rate card', () => {
    open('Teesta', 'admin', 'usage')
    expect(screen.getByText('No rate card')).toBeInTheDocument()
    expect(screen.getByText(/no statement is produced/)).toBeInTheDocument()
  })

  it('warns on the Usage tab when an allowed operation is free this month', () => {
    addRateCard({ institutionId: 'inst-2', effectiveFrom: `${currentMonth()}-01`, generationRate: 0.5, validationRate: 0 })
    open('Karnaphuli', 'admin', 'usage')
    expect(screen.getByText('Priced at ৳0 this month')).toBeInTheDocument()
    expect(screen.getByText(/validation is allowed/)).toBeInTheDocument()
  })

  it('tells the admin when activating an institution that has no rate card', async () => {
    const user = open('Surma')
    await user.click(screen.getByRole('button', { name: /More actions/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }))
    expect(await screen.findByText(/no rate card yet/)).toBeInTheDocument()
  })

  it('does not mention pricing when activating an institution that has a rate card', async () => {
    addRateCard({ institutionId: 'inst-4', effectiveFrom: `${currentMonth()}-01`, generationRate: 0.5, validationRate: 0.1 })
    const user = open('Surma')
    await user.click(screen.getByRole('button', { name: /More actions/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Activate' }))
    await screen.findByText(/will go live/)
    expect(screen.queryByText(/no rate card yet/)).not.toBeInTheDocument()
  })

  it('has no rate card notice for an institution that has one', () => {
    open('Shapla', 'admin', 'usage')
    expect(screen.queryByText('No rate card')).not.toBeInTheDocument()
  })

  it('has no Usage tab for a pending institution, even by URL', () => {
    open('Surma', 'admin', 'usage')
    expect(screen.queryByRole('link', { name: 'Usage' })).not.toBeInTheDocument()
    expect(screen.getByText('Setup progress')).toBeInTheDocument()
  })

  it('returns to the list for an unknown institution', () => {
    open('')
    expect(screen.getByText('list')).toBeInTheDocument()
  })
})
