import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend } from '../../test/fake-backend'
import { fiSession } from '../../test/fi-session'
import { renderApp } from '../../test/providers'
import { SHAPLA, TEESTA, seedOctober2026 } from '../../test/scenario'
import { fiNav } from './nav'
import { OverviewPage } from './overview-page'

let backend: FakeBackend
beforeEach(async () => {
  backend = await new FakeBackend().install({ tenantId: SHAPLA, clientId: 'shapla-ops' })
  seedOctober2026(backend)
  // October is the open month; Shapla has used 200 billed calls so far.
  backend.billing.addUsageCounts(SHAPLA, '2026-10', { staticGenerations: 40, dynamicGenerations: 60, validations: 100 })
})
afterEach(() => backend.reset())

describe('FI overview', () => {
  it('summarises the open month, the bills and the dispute window', async () => {
    renderApp(<OverviewPage session={fiSession(SHAPLA)} />)
    expect(await screen.findByText(/October 2026 is still open/)).toBeInTheDocument()
    expect(screen.getByText(/shapla-ops/)).toBeInTheDocument()
    expect(screen.getAllByText('200').length).toBeGreaterThan(0)
    expect(screen.getByText('Dispute window')).toBeInTheDocument()
    expect(screen.getByText(/August 2026 bill · (until|ended) 2026-10-03/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /August 2026/ })).toHaveAttribute('href', '/fi/statements/2026-08')
    expect(screen.getByRole('link', { name: 'All usage' })).toHaveAttribute('href', '/fi/usage')
  })

  it('shows only the institution’s own finalized statements: never a draft, never another institution', async () => {
    renderApp(<OverviewPage session={fiSession(SHAPLA)} />)
    await screen.findByText(/October 2026 is still open/)
    // September is still a draft on the staff side: the institution does not see it as a bill.
    expect(screen.queryByRole('link', { name: /September 2026/ })).not.toBeInTheDocument()
    expect(backend.callsTo('GET', '/v1/billing/statements')).toHaveLength(1)
    expect(backend.callsTo('GET', '/v1/admin')).toHaveLength(0)
  })

  it('lists the latest activity from its own usage', async () => {
    // Later than the seeded October events (all on the 10th), so these are the newest.
    backend.billing.addUsage(SHAPLA, 'VALIDATION', '2026-10-12T04:00:00+00:00', { verdict: 'REQUEST_STALE', billable: false })
    backend.billing.addUsage(TEESTA, 'VALIDATION', '2026-10-12T05:00:00+00:00', { verdict: 'INVALID_SIGNATURE' })
    renderApp(<OverviewPage session={fiSession(SHAPLA)} />)

    expect(await screen.findByText('Stale request')).toBeInTheDocument()
    expect(screen.queryByText('Invalid signature')).not.toBeInTheDocument()
  })

  it('says so when the data cannot be loaded', async () => {
    backend.failNext('GET', '/v1/billing/statements', 500)
    renderApp(<OverviewPage session={fiSession(SHAPLA)} />)
    expect(await screen.findByText('Could not load your billing data')).toBeInTheDocument()
  })

  it('has only Overview, Usage and Statements in the menu', () => {
    expect(fiNav.map((n) => ('label' in n ? n.label : n.heading))).toEqual(['Overview', 'Usage', 'Statements'])
  })
})
