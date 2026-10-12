import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBackend, installFakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { TrustStorePage } from './trust-store-page'

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
  // jsdom's downloadText relies on URL.createObjectURL; stub it so the test
  // does not depend on a real Blob URL lifecycle and so the click resolves.
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:fake'), configurable: true })
  }
  if (!('revokeObjectURL' in URL)) {
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  }
})
afterEach(() => backend.reset())

function open() {
  renderApp(<TrustStorePage />, ['/staff/trust-store'])
  return userEvent.setup()
}

describe('TrustStorePage', () => {
  it('lists every institution returned by the trust store', async () => {
    open()
    expect(await screen.findByText('Agrani Bank PLC')).toBeInTheDocument()
    expect(screen.getByText('bKash')).toBeInTheDocument()
    expect(screen.getByText('Pathao Pay')).toBeInTheDocument()
    // Codes are rendered monospace in their own cell.
    expect(screen.getByText('000010')).toBeInTheDocument()
    expect(screen.getByText('022002')).toBeInTheDocument()
    // Status chip picks up the wire status.
    expect(screen.getAllByText('Active')).toHaveLength(2)
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })

  it('shows the sync banner with the count of institutions', async () => {
    open()
    // "Last synced …" + "3 institutions synced from the BB trust store"
    const banner = await screen.findByText(/3 institutions synced from the BB trust store/)
    expect(banner).toBeInTheDocument()
  })

  it('opens the drawer with the public key when a row is clicked', async () => {
    const user = open()
    await user.click(await screen.findByText('bKash'))
    // The drawer title is the institution name; the PEM is rendered in a <pre>.
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText('bKash')).toBeInTheDocument()
    expect(within(drawer).getByText(/BEGIN PUBLIC KEY/)).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(within(drawer).getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('shows a fallback banner when the API errors', async () => {
    backend.setTrustStoreFailure(503)
    open()
    expect(await screen.findByText('Could not load the trust store')).toBeInTheDocument()
    expect(screen.getByText('Trust store unavailable')).toBeInTheDocument()
  })
})
