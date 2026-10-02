import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { addInstitution, resetInstitutions } from '../institutions/store'
import OnboardingPage from './onboarding-page'

type User = ReturnType<typeof userEvent.setup>

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

function setup() {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  )
  return user
}

describe('institution onboarding', () => {
  afterEach(resetInstitutions)

  it('validates the institution step', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Register institution' }))
    expect(await screen.findByText('Choose an institution from the list.')).toBeInTheDocument()
    expect(screen.getByText('Enter a contact name.')).toBeInTheDocument()
  })

  it('fills type and code from the chosen institution', async () => {
    const user = setup()
    await pickInstitution(user, 'bkash', /bKash/)
    expect(screen.getByText(/MFS provider/)).toBeInTheDocument()
    expect(screen.getByText('022002')).toBeInTheDocument()
  })

  it('does not allow an institution that is already onboarded', async () => {
    addInstitution({
      id: 'taken', name: 'Taken', type: '00', code: '000010', status: 'Active', contactName: '', email: '', phone: '', address: '',
      access: null, certificate: null, keyMode: null,
    })
    const user = setup()
    await user.type(screen.getByRole('combobox'), 'agrani')
    const option = await screen.findByRole('option', { name: /Agrani Bank/ })
    expect(option).toHaveAttribute('aria-disabled', 'true')
    expect(option).toHaveTextContent('Already onboarded')
    await user.click(option)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('rejects a manually entered code that is already registered', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: 'Not listed? Enter details manually' }))
    await user.type(screen.getByLabelText('Institution name'), 'Shapla Commercial Bank')
    await user.selectOptions(screen.getByLabelText('Institution type'), '00')
    await user.type(screen.getByLabelText('Institution ID'), '0901')
    await fillContact(user)
    expect(await screen.findByText('This institution code is already registered.')).toBeInTheDocument()
  })

  it('needs at least one capability and holds the secret dialog until it is stored', async () => {
    const user = setup()
    await fillInstitution(user)
    const generation = await screen.findByRole('switch', { name: 'QR generation' })
    const validation = screen.getByRole('switch', { name: 'QR validation' })
    expect(generation).toBeChecked()
    expect(validation).toBeChecked()

    await user.click(generation)
    await user.click(validation)
    expect(screen.getByText('Turn on at least one capability.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue credentials' })).toBeDisabled()

    await user.click(validation)
    await user.click(screen.getByRole('button', { name: 'Issue credentials' }))
    const next = await screen.findByRole('button', { name: 'Continue' })
    expect(next).toBeDisabled()
    await user.click(screen.getByLabelText('I have stored the secret'))
    await user.click(next)
    expect(await screen.findByRole('heading', { name: 'Client certificate' })).toBeInTheDocument()
  })

  it('drops the signing key step for a validation-only institution and can finish pending', async () => {
    const user = setup()
    await fillInstitution(user)
    await user.click(await screen.findByRole('switch', { name: 'QR generation' }))
    await user.click(screen.getByRole('button', { name: 'Issue credentials' }))
    await user.click(await screen.findByLabelText('I have stored the secret'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByText('Signing key')).not.toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByRole('heading', { name: 'Review and activate' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish later' }))
    expect(await screen.findByRole('heading', { name: 'Saved as pending' })).toBeInTheDocument()
  })

  it('resumes a pending institution at its first missing step', () => {
    render(
      <MemoryRouter initialEntries={['/staff/institutions/new?resume=inst-4']}>
        <OnboardingPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Continue setup: Surma Payments Ltd' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Client certificate' })).toBeInTheDocument()
  })
})
