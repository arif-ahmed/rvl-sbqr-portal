import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Session } from '../../../shared/auth/session'
import { getBilling, resetBilling } from '../../../shared/billing/store'
import { AdjustmentsPage } from './adjustments-page'

const session: Session = { userId: 'finance@rvl.example', name: 'Nadia Brian', title: 'Finance', role: 'finance', surface: 'staff' }
const renderPage = () =>
  render(
    <MemoryRouter>
      <AdjustmentsPage session={session} />
    </MemoryRouter>,
  )

describe('adjustments page', () => {
  afterEach(resetBilling)

  it('lists credits and charges with their status and settle rule', () => {
    renderPage()
    expect(screen.getByText('−৳ 500')).toBeInTheDocument()
    expect(screen.getByText('+৳ 250')).toBeInTheDocument()
    // Status chips only; the status filter's <option> elements share the words.
    expect(screen.getAllByText('Pending', { selector: 'span' })).toHaveLength(2)
    expect(screen.getAllByText('Applied', { selector: 'span' })).toHaveLength(2)
    // Applied adjustments are part of a locked month.
    expect(screen.getAllByText('Locked')).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: /Remove adjustment/ })).toHaveLength(2)
  })

  it('filters by status', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByLabelText('Status filter'), 'Pending')
    expect(screen.getByText('2 adjustments · 2 pending')).toBeInTheDocument()
    expect(screen.queryByText('+৳ 300')).not.toBeInTheDocument()
  })

  it('records a pending adjustment against the open period', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Record adjustment/ }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText('Institution'), 'Teesta Digital Wallet')
    // The open period is preselected; only draft periods are offered.
    expect(within(drawer).getByLabelText('Period')).toHaveValue('2026-09')
    expect(within(drawer).getAllByRole('option').some((o) => o.textContent?.includes('Finalized'))).toBe(false)
    await user.type(within(drawer).getByLabelText('Amount (৳)'), '150')
    await user.type(within(drawer).getByLabelText('Reason'), 'Goodwill credit per ticket INC-2302')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))
    expect(await screen.findByText('+৳ 150')).toBeInTheDocument()
    const added = getBilling().adjustments.find((a) => a.amount === 150)
    expect(added).toMatchObject({ institutionId: 'inst-3', period: '2026-09', status: 'Pending', createdBy: 'finance@rvl.example' })
  })

  it('rejects an empty form, a zero amount and a thin reason', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Record adjustment/ }))
    const drawer = await screen.findByRole('dialog')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))
    expect(await within(drawer).findByText('Choose an institution.')).toBeInTheDocument()
    await user.type(within(drawer).getByLabelText('Amount (৳)'), '0')
    await user.type(within(drawer).getByLabelText('Reason'), 'because')
    await user.click(within(drawer).getByRole('button', { name: 'Record adjustment' }))
    expect(within(drawer).getByText('The amount must be non-zero.')).toBeInTheDocument()
    expect(within(drawer).getByText('Give a reason of at least 8 characters.')).toBeInTheDocument()
  })

  it('removes a pending adjustment after confirming, and never offers an applied one', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getAllByRole('button', { name: /Remove adjustment/ })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: /Remove adjustment/ })[0])
    await user.click(await screen.findByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('3 adjustments · 1 pending')).toBeInTheDocument()
    expect(getBilling().adjustments).toHaveLength(3)
  })
})
