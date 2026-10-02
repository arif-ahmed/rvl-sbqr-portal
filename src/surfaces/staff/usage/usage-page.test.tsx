import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { resetStuck, getStuck } from './stuck-store'
import { StaffUsagePage } from './usage-page'

describe('staff usage page', () => {
  afterEach(resetStuck)

  it('shows all institutions with an Institution column', () => {
    render(<StaffUsagePage />)
    expect(screen.getByRole('columnheader', { name: 'Institution' })).toBeInTheDocument()
  })

  it('requeues one stuck event, then all', async () => {
    const user = userEvent.setup()
    render(<StaffUsagePage />)
    const before = getStuck().length
    await user.click(screen.getByRole('tab', { name: new RegExp(`Stuck events \\(${before}\\)`) }))
    await user.click(screen.getByRole('button', { name: 'Requeue msg_7f3a21' }))
    expect(screen.queryByText('msg_7f3a21')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: `Stuck events (${before - 1})` })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Requeue all' }))
    expect(screen.getByText('Nothing outstanding')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Stuck events' })).toBeInTheDocument()
  })
})
