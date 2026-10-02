import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Role } from '../../../shared/auth/session'
import { InstitutionDetail } from './institution-detail'
import { getInstitutions, resetInstitutions } from './store'

function open(name: string, role: Role = 'admin') {
  const id = name ? getInstitutions().find((i) => i.name.startsWith(name))?.id : 'missing'
  render(
    <MemoryRouter initialEntries={[`/staff/institutions/${id}`]}>
      <Routes>
        <Route path="/staff/institutions" element={<p>list</p>} />
        <Route path="/staff/institutions/:id" element={<InstitutionDetail role={role} />} />
      </Routes>
    </MemoryRouter>,
  )
  return userEvent.setup()
}

describe('institution detail', () => {
  afterEach(resetInstitutions)

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

  it('returns to the list for an unknown institution', () => {
    open('')
    expect(screen.getByText('list')).toBeInTheDocument()
  })
})
