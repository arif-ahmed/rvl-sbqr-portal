import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { sampleEvents } from './sample'
import { UsageTable } from './usage-table'

const names = (id: string) => `Name of ${id}`

describe('usage table billing reasons', () => {
  it('shows "Not billed" with its reason, and opens the full explanation', async () => {
    const user = userEvent.setup()
    render(<UsageTable events={sampleEvents.filter((e) => e.verdict === 'REQUEST_STALE')} />)
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
    const event = sampleEvents.find((e) => e.verdict === 'KEY_NOT_FOUND')!
    render(<UsageTable events={[event]} />)
    await user.click(screen.getByRole('button', { name: event.id }))
    const panel = await screen.findByRole('dialog')
    expect(within(panel).getByText('Billed', { selector: 'b' })).toBeInTheDocument()
    expect(within(panel).getByText(/ask Finance for an adjustment/)).toBeInTheDocument()
  })

  it('shows the paying institution in the staff view', async () => {
    const user = userEvent.setup()
    const event = sampleEvents[0]
    render(<UsageTable events={[event]} institutionName={names} />)
    await user.click(screen.getByRole('button', { name: event.id }))
    expect(within(await screen.findByRole('dialog')).getByText(`Name of ${event.institutionId}`)).toBeInTheDocument()
  })
})
