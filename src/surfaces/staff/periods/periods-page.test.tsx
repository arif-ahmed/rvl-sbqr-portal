import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Session } from '../../../shared/auth/session'
import { FakeBackend } from '../../../test/fake-backend'
import { renderApp } from '../../../test/providers'
import { seedOctober2026, SEPTEMBER } from '../../../test/scenario'
import { PeriodsPage } from './periods-page'

const session: Session = { userId: 'platform-admin', name: 'RVL Staff', title: 'Platform Admin', role: 'admin', surface: 'staff' }
const renderPage = () => renderApp(<PeriodsPage session={session} />)

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install()
  seedOctober2026(backend)
})
afterEach(() => backend.reset())

/** The page has loaded once its heading shows. */
const loaded = (name = 'September 2026') => screen.findByRole('heading', { name })

const retypeTotal = async (user: ReturnType<typeof userEvent.setup>, drawer: HTMLElement, total: string) => {
  const field = within(drawer).getByLabelText('Confirm expected total (৳)')
  await user.clear(field)
  await user.type(field, total)
}

describe('billing periods page', () => {
  it('shows the draft month, its statements and what blocks the close', async () => {
    renderPage()
    await loaded()
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Usage not complete')).toBeInTheDocument()
    expect(screen.getByText(/2 usage events have not been recorded yet \(1 dead-lettered, 1 still being delivered\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Requeue dead-lettered (1)' })).toBeInTheDocument()
    // Every number on the page ties back to a statement row. Shapla has no adjustment this month,
    // so its subtotal and total are the same figure.
    expect(screen.getAllByText('৳ 9,658.13')).toHaveLength(2)
    expect(screen.getAllByText('−৳ 250').length).toBeGreaterThan(0)
    expect(screen.getAllByText('৳ 629.60').length).toBeGreaterThan(0)
    // The KPI tile and the table footer agree on the period total.
    expect(screen.getAllByText('৳ 11,037.73')).toHaveLength(2)
    expect(screen.getByText('3 institutions · BDT')).toBeInTheDocument()
    expect(screen.getByText(/Finalizing locks the month for every institution at once/)).toBeInTheDocument()
    expect(screen.getByText(/Statements are billing records, not tax invoices/)).toBeInTheDocument()
  })

  it('names each institution and the month its rate card started', async () => {
    renderPage()
    await loaded()
    expect(screen.getByRole('button', { name: /Shapla Commercial Bank/ })).toHaveTextContent('Rate card from January 2026')
    expect(screen.getByRole('button', { name: /Teesta Digital Wallet/ })).toHaveTextContent('Rate card from July 2026')
    // Chandra has usage but no card: no statement, so it is not on the page.
    expect(screen.queryByText(/Chandra Settlement Services/)).not.toBeInTheDocument()
  })

  it('opens the line items behind a row', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: /Shapla Commercial Bank/ }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText(/Shapla Commercial Bank · September 2026/)).toBeInTheDocument()
    expect(within(drawer).getByText('Static generation')).toBeInTheDocument()
    expect(within(drawer).getByText('Draft · September 2026')).toBeInTheDocument()
    expect(within(drawer).getByText(/not a tax invoice/)).toBeInTheDocument()
  })

  it('downloads statements.csv from the API and usage.csv for the opened institution', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: /statements\.csv/ }))
    await waitFor(() => expect(backend.callsTo('GET', '/periods/2026-09/statements.csv')).toHaveLength(1))

    await user.click(screen.getByRole('button', { name: /Teesta Digital Wallet/ }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /usage\.csv/ }))
    await waitFor(() => expect(backend.callsTo('GET', '/usage.csv?tenantId=inst-3&all=true')).toHaveLength(1))
  })

  it('keeps Finalize disabled until the reviewed total is retyped, then explains the 409 while usage is outstanding', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Finalize period' }))
    const drawer = await screen.findByRole('dialog')
    expect(within(drawer).getByText(/The month locks for all 3 institutions at once/)).toBeInTheDocument()
    const confirm = within(drawer).getByRole('button', { name: 'Finalize period' })
    expect(confirm).toBeDisabled()
    await retypeTotal(user, drawer, '999')
    expect(within(drawer).getByText('Does not match the period total.')).toBeInTheDocument()
    expect(confirm).toBeDisabled()
    await retypeTotal(user, drawer, String(SEPTEMBER.total))
    expect(confirm).toBeEnabled()
    await user.click(confirm)

    expect(await within(drawer).findByText('Usage not complete')).toBeInTheDocument()
    expect(within(drawer).getByText(/requeue any dead-lettered events from the banner/)).toBeInTheDocument()
    expect(backend.callsTo('POST', '/finalize')[0].body).toEqual({ finalizedBy: 'platform-admin', expectedTotal: SEPTEMBER.total })
  })

  it('requeues only the dead-lettered usage from the banner; what is still being delivered stays', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Requeue dead-lettered (1)' }))

    await waitFor(() => expect(screen.getByText(/1 usage event has not been recorded yet \(0 dead-lettered, 1 still being delivered\)/)).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: /Requeue dead-lettered/ })).not.toBeInTheDocument()
    expect(backend.callsTo('POST', '/requeue')).toHaveLength(1)
  })

  it('finalizes once usage is recorded, and settles the pending adjustments', async () => {
    const user = userEvent.setup()
    backend.billing.outbox = []
    renderPage()
    await loaded()
    expect(screen.queryByText('Usage not complete')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finalize period' }))
    const drawer = await screen.findByRole('dialog')
    await retypeTotal(user, drawer, String(SEPTEMBER.total))
    await user.click(within(drawer).getByRole('button', { name: 'Finalize period' }))

    expect(await screen.findByText(/Finalized by platform-admin on/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument()
    expect(backend.billing.adjustments.every((a) => a.appliedStatementId !== null)).toBe(true)
    expect(backend.billing.periods.get('2026-09')?.status).toBe('FINALIZED')
  })

  it('refreshes the draft when the totals changed since review, and does not finalize', async () => {
    const user = userEvent.setup()
    backend.billing.outbox = []
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Finalize period' }))
    const drawer = await screen.findByRole('dialog')
    await retypeTotal(user, drawer, String(SEPTEMBER.total))
    // A late usage row lands while the reviewer is typing: 100 validations at ৳ 0.125 more for Shapla.
    backend.billing.addUsageCounts('inst-1', '2026-09', { validations: 100 })
    await user.click(within(drawer).getByRole('button', { name: 'Finalize period' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(backend.billing.periods.get('2026-09')?.status).toBe('DRAFT')
    // The rebuilt draft is on screen: the new total, ready to be reviewed again.
    expect((await screen.findAllByText('৳ 11,050.23')).length).toBeGreaterThan(0)
  })

  it('creates the draft for a month that has none, then offers Recalculate and Finalize', async () => {
    const user = userEvent.setup()
    backend.billing.outbox = []
    backend.billing.periods.delete('2026-09')
    renderPage()
    await loaded('October 2026')
    // The oldest open month is September: provisional until drafted.
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-09')
    expect(await screen.findByText('Provisional')).toBeInTheDocument()
    expect(screen.getByText(/No draft exists for this month yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalize period' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create draft' }))

    expect(await screen.findByRole('button', { name: 'Finalize period' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Recalculate' })).toBeInTheDocument()
    expect(backend.billing.periods.get('2026-09')?.status).toBe('DRAFT')
  })

  it('opens on the draft month when one exists, and lists the open month after it', async () => {
    renderPage()
    await loaded()
    expect(screen.getByRole('group', { name: '2026' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'September · Draft' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'April · Finalized' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'October · Provisional' })).toBeInTheDocument()
  })

  it('steps between months with the arrows and disables them at the ends', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.click(screen.getByRole('button', { name: 'Next period' }))
    expect(screen.getByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next period' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous period' }))
    await user.click(screen.getByRole('button', { name: 'Previous period' }))
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-04')
    expect(screen.getByRole('button', { name: 'Previous period' })).toBeDisabled()
  })

  it('shows a finalized month as locked, without the close actions', async () => {
    const user = userEvent.setup()
    renderPage()
    await loaded()
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-04')
    expect(screen.getByRole('heading', { name: 'April 2026' })).toBeInTheDocument()
    expect(screen.getByText(/Finalized by platform:admin on 2026-05-03 12:00. This month is locked/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finalize period' })).not.toBeInTheDocument()
    expect(screen.queryByText('Usage not complete')).not.toBeInTheDocument()
  })

  it('says so when the billing data cannot be loaded', async () => {
    backend.failNext('GET', '/v1/admin/billing/periods', 500)
    renderPage()
    expect(await screen.findByText('Could not load billing data')).toBeInTheDocument()
  })
})
