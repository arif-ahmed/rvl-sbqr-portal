import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Role } from '../../../shared/auth/session'
import { InstitutionDetail } from './institution-detail'
import { getInstitutions, resetInstitutions } from './store'

// Credential management is reached from the API credentials card, so these tests render the
// whole detail page rather than the drawer alone.

function open(name: string, role: Role = 'admin') {
  const id = getInstitutions().find((i) => i.name.startsWith(name))?.id ?? 'missing'
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

const accessOf = (id: string) => getInstitutions().find((i) => i.id === id)?.access

async function openDrawer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Manage credentials' }))
}

async function finishSecretDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText('I have stored the secret'))
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('credential management', () => {
  afterEach(resetInstitutions)

  it('changes what issued credentials allow', async () => {
    const user = open('Shapla')
    await openDrawer(user)
    await user.click(screen.getByRole('switch', { name: 'QR generation' }))
    expect(accessOf('inst-1')).toMatchObject({ generation: false, validation: true, clientId: '000901-7c1d9e02' })
    expect(screen.getByRole('switch', { name: 'QR generation' })).not.toBeChecked()
  })

  it('keeps at least one capability on', async () => {
    const user = open('Teesta') // validate-only
    await openDrawer(user)
    await user.click(screen.getByRole('switch', { name: 'QR validation' }))
    expect(accessOf('inst-3')).toMatchObject({ generation: false, validation: true })
    expect(screen.getByRole('switch', { name: 'QR validation' })).toBeChecked()
  })

  it('flags a missing signing key when generation is enabled', async () => {
    const user = open('Teesta')
    await openDrawer(user)
    await user.click(screen.getByRole('switch', { name: 'QR generation' }))
    expect(await screen.findByText('Signing key needed')).toBeInTheDocument()
  })

  it('rotates the secret without changing the client ID', async () => {
    const user = open('Shapla')
    await openDrawer(user)
    await user.click(screen.getByRole('button', { name: 'Rotate client secret' }))
    await user.click(await screen.findByRole('button', { name: 'Rotate secret' }))
    expect(await screen.findByText('Copy the client secret now')).toBeInTheDocument()
    expect(screen.getByLabelText('Client ID')).toHaveValue('000901-7c1d9e02')
    await finishSecretDialog(user)
    expect(accessOf('inst-1')?.clientId).toBe('000901-7c1d9e02')
  })

  it('regenerates both client ID and secret', async () => {
    const user = open('Shapla')
    await openDrawer(user)
    await user.click(screen.getByRole('button', { name: 'Regenerate client ID and secret' }))
    await user.click(await screen.findByRole('button', { name: 'Regenerate' }))
    const clientId = (await screen.findByLabelText('Client ID')) as HTMLInputElement
    expect(clientId.value).toMatch(/^000901-[0-9a-f]{8}$/)
    expect(clientId.value).not.toBe('000901-7c1d9e02')
    await finishSecretDialog(user)
    expect(accessOf('inst-1')?.clientId).toMatch(/^000901-[0-9a-f]{8}$/)
    expect(screen.queryByText('000901-7c1d9e02')).not.toBeInTheDocument()
  })
})
