import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FakeBackend } from '../../test/fake-backend'
import { renderApp } from '../../test/providers'
import { UsageTable } from './usage-table'

const names = (id: string) => `Name of ${id}`
const range = { from: '2026-09-01', to: '2026-09-30' }
const staff = { kind: 'staff' } as const

let backend: FakeBackend

beforeEach(async () => {
  backend = await new FakeBackend().install()
})
afterEach(() => backend.reset())

describe('usage table billing reasons', () => {
  it('shows "Not billed" with its reason, and opens the full explanation', async () => {
    const user = userEvent.setup()
    backend.billing.addUsage('inst-1', 'VALIDATION', '2026-09-10T04:00:00+00:00', { billable: false, verdict: 'REQUEST_STALE' })
    renderApp(<UsageTable scope={staff} range={range} />)

    await screen.findByText('Protocol rejection')
    const row = screen.getAllByRole('row')[1]
    expect(within(row).getByText('Not billed')).toBeInTheDocument()
    expect(within(row).getByText('Protocol rejection')).toBeInTheDocument()

    await user.click(row)
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText(/timestamp was outside the allowed window/)).toBeInTheDocument()
    expect(within(panel).getByText('REQUEST_STALE')).toBeInTheDocument()
    expect(within(panel).queryByText('Paying institution')).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('explains why a rejection is still billed and points to an adjustment', async () => {
    const user = userEvent.setup()
    const event = backend.billing.addUsage('inst-1', 'VALIDATION', '2026-09-10T04:00:00+00:00', { verdict: 'KEY_NOT_FOUND' })
    renderApp(<UsageTable scope={staff} range={range} />)

    await user.click(await screen.findByRole('button', { name: event.usageEventId }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Billed', { selector: 'b' })).toBeInTheDocument()
    expect(within(panel).getByText(/ask Finance for an adjustment/)).toBeInTheDocument()
  })

  it('shows the paying institution in the staff view', async () => {
    const user = userEvent.setup()
    const event = backend.billing.addUsage('inst-2', 'GENERATION_STATIC', '2026-09-10T04:00:00+00:00')
    renderApp(<UsageTable scope={staff} range={range} institutionName={names} />)

    await user.click(await screen.findByRole('button', { name: event.usageEventId }))
    expect(within(await screen.findByRole('dialog')).getByText('Name of inst-2')).toBeInTheDocument()
  })
})

describe('usage table reads the API', () => {
  it('lists newest first and only the institution asked for', async () => {
    backend.billing.addUsage('inst-1', 'GENERATION_STATIC', '2026-09-10T04:00:00+00:00', { ref: 'OLD' })
    backend.billing.addUsage('inst-1', 'GENERATION_STATIC', '2026-09-20T04:00:00+00:00', { ref: 'NEW' })
    backend.billing.addUsage('inst-2', 'GENERATION_STATIC', '2026-09-25T04:00:00+00:00', { ref: 'OTHER' })
    renderApp(<UsageTable scope={{ kind: 'staff', institutionId: 'inst-1' }} range={range} />)

    await screen.findByText('NEW')
    const refs = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[2].textContent)
    expect(refs).toEqual(['NEW', 'OLD'])
    expect(screen.queryByText('OTHER')).not.toBeInTheDocument()
  })

  it('sends the meter and billing filters to the server', async () => {
    const user = userEvent.setup()
    backend.billing.addUsage('inst-1', 'GENERATION_STATIC', '2026-09-10T04:00:00+00:00', { ref: 'GEN' })
    backend.billing.addUsage('inst-1', 'VALIDATION', '2026-09-11T04:00:00+00:00', { ref: 'VAL' })
    renderApp(<UsageTable scope={staff} range={range} />)
    await screen.findByText('GEN')

    await user.selectOptions(screen.getByLabelText('Meter'), 'VALIDATION')

    await waitFor(() => expect(screen.queryByText('GEN')).not.toBeInTheDocument())
    expect(screen.getByText('VAL')).toBeInTheDocument()
    expect(backend.callsTo('GET', '/usage?').some((c) => c.path.includes('meter=VALIDATION'))).toBe(true)

    await user.selectOptions(screen.getByLabelText('Billing'), 'free')
    expect(await screen.findByText('No events match')).toBeInTheDocument()
    expect(backend.callsTo('GET', '/usage?').some((c) => c.path.includes('billable=false'))).toBe(true)
  })

  it('pages with a cursor: Load more appends the next page', async () => {
    const user = userEvent.setup()
    for (let i = 0; i < 55; i++) backend.billing.addUsage('inst-1', 'GENERATION_STATIC', `2026-09-10T04:${String(i).padStart(2, '0')}:00+00:00`, { ref: `R-${i}` })
    renderApp(<UsageTable scope={staff} range={range} />)

    await screen.findByText('R-54')
    expect(screen.getAllByRole('row')).toHaveLength(1 + 50)
    await user.click(screen.getByRole('button', { name: 'Load more' }))

    await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(1 + 55))
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
    expect(screen.getByText('R-0')).toBeInTheDocument()
  })

  it('says so when the API refuses', async () => {
    backend.failNext('GET', '/v1/admin/billing/usage', 500)
    renderApp(<UsageTable scope={staff} range={range} />)

    expect(await screen.findByText('Could not load usage events')).toBeInTheDocument()
  })
})
