import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { Session } from '../../../shared/auth/session'
import { periodTotals } from '../../../shared/billing/billing'
import { getBilling, requeueAll, resetBilling } from '../../../shared/billing/store'
import { PeriodsPage } from './periods-page'

const session: Session = { userId: 'finance@rvl.example', name: 'Nadia Brian', title: 'Finance', role: 'finance', surface: 'staff' }
const renderPage = () =>
  render(
    <MemoryRouter>
      <PeriodsPage session={session} />
    </MemoryRouter>,
  )

describe('billing periods page', () => {
  afterEach(resetBilling)

  it('shows the draft month, its statements and what blocks the close', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Usage not complete')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Requeue all' })).toBeInTheDocument()
    // Every number on the page ties back to a statement row. Shapla has no adjustment this
    // month, so its subtotal and total are the same figure.
    expect(screen.getAllByText('৳ 9,658.13')).toHaveLength(2)
    expect(screen.getByText('−৳ 500')).toBeInTheDocument()
    expect(screen.getByText('৳ 3,363')).toBeInTheDocument()
    // The KPI tile and the table footer agree on the period total.
    expect(screen.getAllByText('৳ 13,900.73')).toHaveLength(2)
    expect(screen.getByText('3 institutions · BDT')).toBeInTheDocument()
    expect(screen.getByText('2 queued')).toBeInTheDocument()
    expect(screen.getByText(/Finalizing locks the month for every institution at once/)).toBeInTheDocument()
    expect(screen.getByText(/Statements are billing records, not tax invoices/)).toBeInTheDocument()
  })

  it('opens the line items behind a row', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: /Shapla Commercial Bank/ }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText(/Shapla Commercial Bank · September 2026/)).toBeInTheDocument()
    expect(within(drawer).getByText('Static generation')).toBeInTheDocument()
    expect(within(drawer).getByText('Draft · September 2026')).toBeInTheDocument()
    expect(within(drawer).getByText(/not a tax invoice/)).toBeInTheDocument()
  })

  it('keeps Finalize disabled until the reviewed total is retyped, then reports the 409', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Finalize period' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText(/The month locks for all 3 institutions at once/)).toBeInTheDocument()
    const confirm = within(drawer).getByRole('button', { name: 'Finalize period' })
    expect(confirm).toBeDisabled()
    await user.type(within(drawer).getByLabelText('Confirm expected total (৳)'), '999')
    expect(within(drawer).getByText('Does not match the period total.')).toBeInTheDocument()
    expect(confirm).toBeDisabled()
    const expected = String(periodTotals(getBilling(), '2026-09').total)
    await user.clear(within(drawer).getByLabelText('Confirm expected total (৳)'))
    await user.type(within(drawer).getByLabelText('Confirm expected total (৳)'), expected)
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(within(drawer).getByText('409 · USAGE_NOT_COMPLETE')).toBeInTheDocument()
    expect(within(drawer).getByText(/requeue them from the banner/)).toBeInTheDocument()
  })

  it('requeues the late usage from the banner and unblocks the close', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('button', { name: 'Requeue all' }))
    expect(screen.queryByText('Usage not complete')).not.toBeInTheDocument()
    expect(getBilling().outbox.every((e) => e.status === 'Delivered')).toBe(true)
  })

  it('finalizes once usage is delivered, and settles the pending adjustments', async () => {
    const user = userEvent.setup()
    requeueAll()
    renderPage()
    expect(screen.queryByText('Usage not complete')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finalize period' }))
    const drawer = await screen.findByRole('dialog')
    const expected = String(periodTotals(getBilling(), '2026-09').total)
    await user.type(within(drawer).getByLabelText('Confirm expected total (৳)'), expected)
    await user.click(within(drawer).getByRole('button', { name: 'Finalize period' }))
    expect(await screen.findByText(/Finalized by finance@rvl\.example on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument()
    expect(getBilling().adjustments.filter((a) => a.period === '2026-09').every((a) => a.status === 'Applied')).toBe(true)
  })

  it('groups the period list by year so it stays scannable as months accumulate', () => {
    renderPage()
    expect(screen.getByRole('group', { name: '2026' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'September · Draft' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'April · Finalized' })).toBeInTheDocument()
  })

  it('steps between months with the arrows and disables them at the ends', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous period' }))
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-04')
    expect(screen.getByRole('button', { name: 'Previous period' })).toBeDisabled()
  })

  it('shows a finalized month as locked, without the close actions', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-04')
    expect(screen.getByRole('heading', { name: 'April 2026' })).toBeInTheDocument()
    expect(screen.getByText(/This month is locked: usage and statements cannot change/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalize period' })).not.toBeInTheDocument()
  })
})
