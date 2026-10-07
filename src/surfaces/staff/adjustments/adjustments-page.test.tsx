import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../../../shared/auth/session'
import { FakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { AUGUST_CHARGE, seedOctober2026 } from '../../../test/scenario'
import { AdjustmentsPage } from './adjustments-page'

const session: Session = { userId: 'id-platform-admin', username: 'platform-admin', name: 'RVL Staff', title: 'Platform Admin', role: 'MASTER_ADMIN', surface: 'staff', mustChangePassword: false }
const renderPage = () => renderApp(<AdjustmentsPage session={session} />)

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install()
  seedOctober2026(backend)
})
afterEach(() => backend.reset())

const loaded = () => screen.findByText('−৳ 250')

describe('adjustments page', () => {
  it('lists credits and charges with their status, month and reason', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('+৳ 300')).toBeInTheDocument()
    expect(screen.getByText(AUGUST_CHARGE.reason)).toBeInTheDocument()
    expect(screen.getByText('Credit: duplicate burst, 14 Sep (INC-2291)')).toBeInTheDocument()
    // Status chips only; the status filter's <option> elements share the words.
    expect(screen.getAllByText('Pending', { selector: 'span' })).toHaveLength(1)
    expect(screen.getAllByText('Applied', { selector: 'span' })).toHaveLength(1)
    // The applied one is part of the month that settled it; the pending one waits for the open month.
    expect(screen.getByText('August 2026')).toBeInTheDocument()
    expect(screen.getByText('September 2026')).toBeInTheDocument()
    expect(screen.getByText('when finalized')).toBeInTheDocument()
    expect(screen.getByText('2 adjustments · 1 pending')).toBeInTheDocument()
  })

  it('is append-only: there is nothing to edit or remove', async () => {
    renderPage()
    await loaded()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
    expect(screen.getByText(/cannot be edited or removed/)).toBeInTheDocument()
  })

  it('names who recorded each one and shows institutions by name', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('Karnaphuli Trust Bank')).toBeInTheDocument()
    expect(screen.getByText('Shapla Commercial Bank')).toBeInTheDocument()
    expect(screen.getAllByText('platform-admin')).toHaveLength(2)
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.selectOptions(screen.getByLabelText('Status filter'), 'Pending')
    expect(screen.getByText('1 adjustment · 1 pending')).toBeInTheDocument()
    expect(screen.queryByText('+৳ 300')).not.toBeInTheDocument()
  })

  it('records a pending adjustment, which lands on the open month', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: /Record adjustment/ }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText(/It settles onto the statement when September 2026 is finalized/)).toBeInTheDocument()
    // Any institution can be chosen; the API settles it onto its statement when the month closes.
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    await user.type(within(drawer).getByLabelText('Amount (৳)'), '150')
    await user.type(within(drawer).getByLabelText('Reason'), 'Goodwill credit per ticket INC-2302')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))

    expect(await screen.findByText('+৳ 150')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/adjustments')[0].body).toEqual({
      tenantId: 'inst-3',
      amount: 150,
      reason: 'Goodwill credit per ticket INC-2302',
      createdBy: 'platform-admin',
    })
    expect(screen.getByText('3 adjustments · 2 pending')).toBeInTheDocument()
  })

  it('rejects an empty form, a zero amount and a thin reason, without calling the API', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: /Record adjustment/ }))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))
    expect(await within(drawer).findByText('Choose an institution.')).toBeInTheDocument()
    await user.type(within(drawer).getByLabelText('Amount (৳)'), '0')
    await user.type(within(drawer).getByLabelText('Reason'), 'because')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))
    expect(within(drawer).getByText('The amount must be non-zero.')).toBeInTheDocument()
    expect(within(drawer).getByText('Give a reason of at least 8 characters.')).toBeInTheDocument()
    expect(backend.callsTo('POST', '/adjustments')).toHaveLength(0)
  })

  it('keeps the drawer open when the API refuses', async () => {
    const user = userEvent.setup()
    backend.failNext('POST', '/v1/admin/billing/adjustments', 400)
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: /Record adjustment/ }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    await user.type(within(drawer).getByLabelText('Amount (৳)'), '150')
    await user.type(within(drawer).getByLabelText('Reason'), 'Goodwill credit per ticket INC-2302')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))

    await waitFor(() => expect(backend.callsTo('POST', '/adjustments')).toHaveLength(1))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByText('+৳ 150')).not.toBeInTheDocument()
  })

  it('says so when the adjustments cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/billing/adjustments', 500)
    renderPage()
    expect(await screen.findByText('Could not load billing data')).toBeInTheDocument()
  })
})
