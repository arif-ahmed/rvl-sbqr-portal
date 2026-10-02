import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { UsagePage } from './usage-page'

describe('FI usage page', () => {
  it('pages through events and resets the page when a filter changes', async () => {
    const user = userEvent.setup()
    render(<UsagePage />)
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(screen.getByText(/Page 2 of/)).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Meter'), 'VALIDATION')
    expect(screen.getByText(/Page 1 of/)).toBeInTheDocument()
  })

  it('shows an empty state and Reset when nothing matches', async () => {
    const user = userEvent.setup()
    render(<UsagePage />)
    await user.type(screen.getByLabelText('Search usage'), 'no-such-reference')
    expect(screen.getByText('No events match')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Reset' }))
    expect(screen.queryByText('No events match')).not.toBeInTheDocument()
  })
})
