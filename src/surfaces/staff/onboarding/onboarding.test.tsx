import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { addInstitution, getInstitutions, resetInstitutions } from '../institutions/store'
import { currentMonth } from '../rates/rates'
import { getRateCards, resetRateCards } from '../rates/store'
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

/** Walk the Configuration step's Continue into the Rate card step, fill both prices and save. */
async function fillRateCard(user: User) {
  await user.click(await screen.findByRole('button', { name: 'Continue' }))
  await user.type(await screen.findByLabelText('Generation price per call (BDT)'), '0.5')
  await user.type(screen.getByLabelText('Validation price per call (BDT)'), '0.125')
  await user.click(screen.getByRole('button', { name: 'Save rate card' }))
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
  afterEach(() => {
    resetInstitutions()
    resetRateCards()
  })

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
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await user.click(generation)
    await user.click(validation)
    await fillRateCard(user)
    await user.click(await screen.findByRole('button', { name: 'Skip for now' })) // certificate
    await user.click(await screen.findByRole('button', { name: 'Skip for now' })) // signing key
    await user.click(screen.getByRole('button', { name: 'Issue credentials' }))
    const next = await screen.findByRole('button', { name: 'Continue' })
    expect(next).toBeDisabled()
    await user.click(screen.getByLabelText('I have stored the secret'))
    await user.click(next)
    await user.click(screen.getByRole('button', { name: 'Continue' })) // past the issued credentials step
    expect(await screen.findByRole('heading', { name: 'Review and activate' })).toBeInTheDocument()
    expect(screen.getByText('generation and validation')).toBeInTheDocument()
    expect(screen.getByText(/Client ID \d/)).toBeInTheDocument()
    expect(screen.getByText(/৳ 0.50 per generation/)).toBeInTheDocument()
    expect(screen.getByText(/since (January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/)).toBeInTheDocument()
  })

  it('drops the signing key step for a validation-only institution and can finish pending', async () => {
    const user = setup()
    await fillInstitution(user)
    await user.click(await screen.findByRole('switch', { name: 'QR generation' }))
    await fillRateCard(user)
    await user.click(await screen.findByRole('button', { name: 'Skip for now' })) // certificate, no signing key
    expect(screen.getByText('Scoped to QR validation')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Issue credentials' }))
    await user.click(await screen.findByLabelText('I have stored the secret'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.queryByText('Signing key')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Finish later' }))
    expect(await screen.findByRole('heading', { name: 'Saved as pending' })).toBeInTheDocument()
  })

  it('applies capability changes made after issuance to the issued credentials', async () => {
    addInstitution({
      id: 'resumable', name: 'Resumable Bank', type: '00', code: '000908', status: 'Pending',
      contactName: 'Ops Desk', email: 'ops@resumable.example', phone: '', address: '',
      access: { generation: true, validation: true, clientId: '000908-ab12cd34' }, certificate: null, keyMode: null,
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/staff/institutions/new?resume=resumable']}>
        <OnboardingPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Rate card' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByText('Credentials already issued')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: 'QR generation' }))
    expect(getInstitutions().find((i) => i.id === 'resumable')?.access).toMatchObject({
      generation: false,
      validation: true,
      clientId: '000908-ab12cd34',
    })
  })

  it('resumes a pending institution at its first missing step', () => {
    render(
      <MemoryRouter initialEntries={['/staff/institutions/new?resume=inst-4']}>
        <OnboardingPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { name: 'Continue setup: Surma Payments Ltd' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rate card' })).toBeInTheDocument()
  })

  it('requires both prices before saving the rate card', async () => {
    const user = setup()
    await fillInstitution(user)
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Save rate card' }))
    expect(screen.getAllByText('Enter a price in BDT with up to 4 decimals.')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Rate card' })).toBeInTheDocument()
    expect(getRateCards()).toHaveLength(3) // only the seeds — nothing was saved
  })

  it('saves the rate card effective from the current month', async () => {
    const user = setup()
    await fillInstitution(user)
    await fillRateCard(user)
    expect(await screen.findByRole('heading', { name: 'Client certificate' })).toBeInTheDocument()
    const created = getInstitutions().find((i) => i.name.startsWith('Dutch-Bangla'))
    const card = getRateCards().find((c) => c.institutionId === created?.id)
    expect(card).toMatchObject({ effectiveFrom: `${currentMonth()}-01`, generationRate: 0.5, validationRate: 0.125 })
  })
})
