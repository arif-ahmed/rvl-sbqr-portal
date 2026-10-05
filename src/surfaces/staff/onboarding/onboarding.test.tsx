import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend, installFakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import OnboardingPage from './onboarding-page'

type User = ReturnType<typeof userEvent.setup>

let backend: FakeBackend
beforeEach(async () => {
  backend = await installFakeBackend()
})
afterEach(() => backend.reset())

async function fillContact(user: User) {
  await user.type(screen.getByLabelText('Contact name'), 'Rafiq Ahmed')
  await user.type(screen.getByLabelText('Contact email'), 'rafiq@shaplabank.example')
  await user.click(screen.getByRole('button', { name: 'Register institution' }))
}

async function pickInstitution(user: User, search: string, option: RegExp) {
  await user.type(screen.getByRole('combobox'), search)
  await user.click(await screen.findByRole('option', { name: option }))
}

async function fillInstitution(user: User) {
  await pickInstitution(user, 'dutch', /Dutch-Bangla Bank/i)
  await fillContact(user)
}

const heading = (name: string) => screen.findByRole('heading', { name })
const click = (user: User, name: string) => user.click(screen.getByRole('button', { name }))

function setup(url = '/staff/institutions/new') {
  const user = userEvent.setup()
  renderApp(
    <Routes>
      <Route path="/staff/institutions" element={<p>list</p>} />
      <Route path="/staff/institutions/new" element={<OnboardingPage />} />
    </Routes>,
    [url],
  )
  return user
}

describe('institution onboarding: the first step', () => {
  it('validates the institution step', async () => {
    const user = setup()
    await click(user, 'Register institution')
    expect(await screen.findByText('Choose an institution from the list.')).toBeInTheDocument()
    expect(screen.getByText('Enter a contact name.')).toBeInTheDocument()
    expect(backend.callsTo('POST')).toHaveLength(0)
  })

  it('fills type and code from the chosen institution', async () => {
    const user = setup()
    await pickInstitution(user, 'bkash', /bKash/)
    expect(screen.getByText(/MFS provider/)).toBeInTheDocument()
    expect(screen.getByText('022002')).toBeInTheDocument()
  })

  it('does not allow an institution that is already onboarded', async () => {
    backend.addTenant('000010', 'Agrani Bank (taken)')
    const user = setup()
    await user.type(screen.getByRole('combobox'), 'agrani')
    const option = await screen.findByRole('option', { name: /Agrani Bank/ })
    await waitFor(() => expect(option).toHaveAttribute('aria-disabled', 'true'))
    expect(option).toHaveTextContent('Already onboarded')
    await user.click(option)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('keeps the list open when the mouse goes down on the list itself (scrollbar, padding)', async () => {
    const user = setup()
    const input = await screen.findByRole('combobox')
    await user.click(input)
    await user.pointer({ keys: '[MouseLeft>]', target: await screen.findByRole('listbox') })
    expect(input).toHaveFocus()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('registers the institution through the API and moves on to Configuration', async () => {
    const user = setup()
    await fillInstitution(user)
    expect(await heading('Tenant configuration')).toBeInTheDocument()
    const [register] = backend.callsTo('POST', '/v1/admin/tenants')
    expect(register.body).toEqual({
      institutionName: expect.stringMatching(/Dutch-Bangla/i),
      institutionCode: expect.stringMatching(/^00\d{4}$/),
      contactName: 'Rafiq Ahmed',
      contactEmail: 'rafiq@shaplabank.example',
    })
  })

  it('stays on the step and says why when the API fails', async () => {
    const user = setup()
    backend.failNext('POST', '/v1/admin/tenants', 500)
    await fillInstitution(user)
    expect(await screen.findByText('That didn’t work')).toBeInTheDocument()
    expect(screen.getByText('Injected 500.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Register institution' })).toBeEnabled()
    // Retrying works: nothing was created the first time.
    await click(user, 'Register institution')
    expect(await heading('Tenant configuration')).toBeInTheDocument()
  })

  it('shows a duplicate the client could not see, as the server words it', async () => {
    const user = setup()
    backend.failNext('POST', '/v1/admin/tenants', 409)
    await fillInstitution(user)
    expect(await screen.findByText('Injected 409.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Tenant configuration' })).not.toBeInTheDocument()
  })
})

describe('institution onboarding: the whole flow', () => {
  it('saves each step as it goes and activates at the end', async () => {
    const user = setup()
    await fillInstitution(user)

    // Configuration: at least one capability, and the choice is saved before credentials.
    const generation = await screen.findByRole('switch', { name: 'QR generation' })
    const validation = screen.getByRole('switch', { name: 'QR validation' })
    expect(generation).toBeChecked()
    expect(validation).toBeChecked()
    await user.click(generation)
    await user.click(validation)
    expect(screen.getByText('Turn on at least one capability.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.click(validation)
    await click(user, 'Continue')
    await waitFor(() => expect(backend.callsTo('PATCH', '/configuration')).toHaveLength(1))
    expect(backend.callsTo('PATCH', '/configuration')[0].body).toEqual({ isQrGenerationAllowed: false, isQrValidationAllowed: true })

    // Credentials: the secret is shown once and held until it is stored.
    expect(await screen.findByText('Scoped to QR validation')).toBeInTheDocument()
    await click(user, 'Issue credentials')
    expect(await screen.findByDisplayValue('fake-client-secret-0123456789')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/tenant-configuration')[0].body).toEqual({ isQrGenerationAllowed: false, isQrValidationAllowed: true })
    const next = screen.getAllByRole('button', { name: 'Continue' }).at(-1)!
    expect(next).toBeDisabled()
    await user.click(screen.getByLabelText('I have stored the secret'))
    await user.click(next)
    expect(screen.queryByDisplayValue('fake-client-secret-0123456789')).not.toBeInTheDocument()
    expect(await screen.findByText('Credentials issued')).toBeInTheDocument()
    expect(screen.getByText(/shown once and cannot be shown again/)).toBeInTheDocument()
    await click(user, 'Continue')

    // Certificate is optional: skipping is recorded on the server.
    // Signing key is required: there is no skip.
    expect(await heading('Signing key')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument()
    await click(user, 'Create key')
    await waitFor(() => expect(backend.callsTo('POST', '/v1/crypto-keys')).toHaveLength(1))
    expect(backend.callsTo('POST', '/v1/crypto-keys')[0].body).toMatchObject({ mode: 'Generate' })

    // Review reads everything back from the API and activates.
    expect(await heading('Review and activate')).toBeInTheDocument()
    expect(await screen.findByText('validation')).toBeInTheDocument()
    expect(screen.getByText(/Client ID \d{6}-ab12cd34/)).toBeInTheDocument()
    expect(screen.getByText(/Key \d{6}-key, version 1/)).toBeInTheDocument()
    expect(screen.getByText('No rate card yet')).toBeInTheDocument()
    await click(user, 'Activate institution')
    expect(await heading('Institution is live')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/activate')).toHaveLength(1)
  })

  it('validates a pasted private key, sends it once and keeps it nowhere', async () => {
    const user = setup('/staff/institutions/new?resume=inst-4')
    expect(await heading('Signing key')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Use an existing key/ }))
    await click(user, 'Use this key')
    expect(await screen.findByText('Paste a PEM private key.')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/v1/crypto-keys')).toHaveLength(0)

    const pem = '-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIKexample\n-----END PRIVATE KEY-----'
    await user.click(screen.getByLabelText('Private key (PEM)'))
    await user.paste(pem)
    await click(user, 'Use this key')
    expect(await heading('Review and activate')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/v1/crypto-keys')[0].body).toEqual({ tenantId: 'inst-4', mode: 'Adopt', privateKeyPem: pem })
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.length).toBe(0)
    expect(document.body.textContent).not.toContain('BEGIN PRIVATE KEY')
  })
})

describe('institution onboarding: resuming', () => {
  it('opens at the first step that is not done', async () => {
    setup('/staff/institutions/new?resume=inst-4')
    expect(await heading('Continue setup: Surma Payments Ltd')).toBeInTheDocument()
    expect(await heading('Signing key')).toBeInTheDocument()
  })

  it('opens at Configuration for an institution that has only been registered', async () => {
    setup('/staff/institutions/new?resume=inst-5')
    expect(await heading('Tenant configuration')).toBeInTheDocument()
  })

  it('shows the credentials as issued, and locks the capabilities, after they were issued earlier', async () => {
    const user = setup('/staff/institutions/new?resume=inst-4')
    await heading('Signing key')
    await click(user, 'Back')
    expect(await screen.findByText('Credentials issued')).toBeInTheDocument()
    expect(screen.getByText('032901-3f9a1c20')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Issue credentials' })).not.toBeInTheDocument()
    await click(user, 'Back')
    expect(await screen.findByText('Credentials already issued')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'QR generation' })).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'QR validation' })).toBeDisabled()
    // Continue does not call the API again: the credentials already fix the capabilities.
    await click(user, 'Continue')
    expect(backend.callsTo('PATCH')).toHaveLength(0)
  })

  it('opens at Review when only activation is left, and activates', async () => {
    const surma = backend.find('inst-4')!
    surma.signingKey = true
    const user = setup('/staff/institutions/new?resume=inst-4')
    expect(await heading('Review and activate')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate institution' })).toBeEnabled())
    await click(user, 'Activate institution')
    expect(await heading('Institution is live')).toBeInTheDocument()
  })

  it('does not bounce to the list once the institution it resumed is activated', async () => {
    const surma = backend.find('inst-4')!
    surma.signingKey = true
    const user = setup('/staff/institutions/new?resume=inst-4')
    await heading('Review and activate')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Activate institution' })).toBeEnabled())
    await click(user, 'Activate institution')
    await heading('Institution is live')
    expect(screen.queryByText('list')).not.toBeInTheDocument()
  })

  it('holds Activate back and explains what is missing', async () => {
    const surma = backend.find('inst-4')!
    surma.signingKey = true
    surma.trust = false
    setup('/staff/institutions/new?resume=inst-4')
    expect(await heading('Review and activate')).toBeInTheDocument()
    expect(await screen.findByText('Not ready to activate yet')).toBeInTheDocument()
    expect(screen.getByText(/not in the trust directory/)).toBeInTheDocument()
    expect(screen.getByText(/published in the Bangladesh Bank trust directory/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate institution' })).toBeDisabled()
  })

  it('can be left and resumed: Finish later keeps the progress on the server', async () => {
    const surma = backend.find('inst-4')!
    surma.signingKey = true
    const user = setup('/staff/institutions/new?resume=inst-4')
    await heading('Review and activate')
    await click(user, 'Finish later')
    expect(await heading('Saved as pending')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/activate')).toHaveLength(0)
    expect(backend.find('inst-4')!.tenant.status).toBe('PENDING')
  })

  it('treats a credential issued elsewhere meanwhile as done, without showing a secret', async () => {
    const user = setup('/staff/institutions/new?resume=inst-5')
    await heading('Tenant configuration')
    await click(user, 'Continue')
    await screen.findByText('Scoped to QR generation and QR validation')
    // Another admin (or a dropped connection on a first attempt) already issued them.
    backend.find('inst-5')!.credential = { clientId: '000903-ee11ff22' }
    await click(user, 'Issue credentials')
    expect(await screen.findByText('Credentials issued')).toBeInTheDocument()
    expect(screen.getByText('000903-ee11ff22')).toBeInTheDocument()
    expect(screen.queryByLabelText('I have stored the secret')).not.toBeInTheDocument()
    expect(screen.queryByText('That didn’t work')).not.toBeInTheDocument()
  })

  it('sends an institution that is already live back to the list', async () => {
    setup('/staff/institutions/new?resume=inst-1')
    expect(await screen.findByText('list')).toBeInTheDocument()
  })

  it('sends an unknown institution back to the list', async () => {
    setup('/staff/institutions/new?resume=missing')
    expect(await screen.findByText('list')).toBeInTheDocument()
  })

  it('says so when the institution cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/tenants/inst-4', 500)
    setup('/staff/institutions/new?resume=inst-4')
    expect(await screen.findByText('Could not load this institution')).toBeInTheDocument()
  })
})
