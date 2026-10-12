import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend } from '../../test/fake-backend'
import { fiSession } from '../../test/fi-session'
import { renderApp } from '../../test/providers'
import { SHAPLA, TEESTA, seedOctober2026 } from '../../test/scenario'
import { UsagePage } from './usage-page'

const open = (path = '/fi/usage') => renderApp(<UsagePage session={fiSession(SHAPLA)} />, [path])

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install({ tenantId: SHAPLA })
  seedOctober2026(backend)
  backend.billing.addUsageCounts(SHAPLA, '2026-10', { staticGenerations: 40, dynamicGenerations: 60, validations: 100 })
})
afterEach(() => backend.reset())

describe('FI usage page', () => {
  it('opens on the current month with its totals', async () => {
    open()
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    expect(screen.getByText('60')).toBeInTheDocument()
    expect(screen.getByText('100')).toBeInTheDocument()
    // October has no bill yet.
    expect(screen.getByText('No usage or no rate card')).toBeInTheDocument()
  })

  it('shows the totals of a finalized month with a link to its bill', async () => {
    open('/fi/usage?period=2026-08')
    expect(await screen.findByRole('heading', { name: 'August 2026' })).toBeInTheDocument()
    // April + 4 months of growth: 2,400 static, 12,000 dynamic, 15,200 validations.
    expect(screen.getByText('2,400')).toBeInTheDocument()
    expect(screen.getByText('12,000')).toBeInTheDocument()
    expect(screen.getByText('15,200')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check the bill' })).toHaveAttribute('href', '/fi/statements/2026-08')
  })

  it('has no search by client reference or event ID, and no date range inside a month', async () => {
    open()
    await screen.findByRole('heading', { name: 'October 2026' })
    expect(screen.queryByLabelText('Search usage')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument()
  })

  it('switches the whole page to another billing period', async () => {
    const user = userEvent.setup()
    open()
    await screen.findByRole('heading', { name: 'October 2026' })
    await user.selectOptions(screen.getByLabelText('Billing period'), '2026-06')
    expect(screen.getByRole('heading', { name: 'June 2026' })).toBeInTheDocument()
    expect(screen.getByText('2,200')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Check the bill' })).toHaveAttribute('href', '/fi/statements/2026-06')
  })

  it('takes the period from the link, e.g. from a statement', async () => {
    open('/fi/usage?period=2026-06')
    expect(await screen.findByRole('heading', { name: 'June 2026' })).toBeInTheDocument()
  })

  it('lists only its own events, newest first, and pages with Load more', async () => {
    const user = userEvent.setup()
    // Later than the seeded October events (all on the 10th), so these are the newest.
    backend.billing.addUsage(TEESTA, 'VALIDATION', '2026-10-12T05:00:00+00:00', { ref: 'NOT-MINE' })
    backend.billing.addUsage(SHAPLA, 'VALIDATION', '2026-10-12T04:00:00+00:00', { ref: 'MINE-LATEST' })
    open()
    await screen.findByText('MINE-LATEST')
    expect(screen.queryByText('NOT-MINE')).not.toBeInTheDocument()
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('MINE-LATEST')
    expect(backend.callsTo('GET', '/v1/billing/usage?').every((c) => !c.path.includes('tenantId'))).toBe(true)

    // 201 events in October: 50 per page.
    expect(screen.getAllByRole('row')).toHaveLength(1 + 50)
    await user.click(screen.getByRole('button', { name: 'Load more' }))
    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1 + 100))
  })

  it('filters on the server, and shows an empty state and Reset when nothing matches', async () => {
    const user = userEvent.setup()
    open('/fi/usage?period=2026-08')
    await screen.findByRole('heading', { name: 'August 2026' })
    await user.selectOptions(screen.getByLabelText('Meter'), 'VALIDATION')
    await user.selectOptions(screen.getByLabelText('Billing'), 'free')

    expect(await screen.findByText('No events match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    expect(backend.callsTo('GET', '/v1/billing/usage?').some((c) => c.path.includes('meter=VALIDATION') && c.path.includes('billable=false'))).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row').length).toBeGreaterThan(2))
  })
})
