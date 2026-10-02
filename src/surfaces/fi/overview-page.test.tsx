import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Session } from '../../shared/auth/session'
import { fiNav } from './nav'
import { OverviewPage } from './overview-page'

const session = { userId: 'ops@shapla.example', name: 'Farhana Rahman', title: 'Operations', surface: 'fi', role: 'fi' } as unknown as Session

describe('FI overview', () => {
  it('summarises the open month, the bills and the dispute window', () => {
    render(
      <MemoryRouter>
        <OverviewPage session={session} />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Farhana/)).toBeInTheDocument()
    expect(screen.getByText(/September 2026 is still open/)).toBeInTheDocument()
    expect(screen.getByText('30,822')).toBeInTheDocument()
    expect(screen.getByText('Dispute window')).toBeInTheDocument()
    expect(screen.getByText(/August 2026 bill · (until|ended) 2026-10-03/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /September 2026/ })).toHaveAttribute('href', '/fi/statements/2026-09')
    expect(screen.getByRole('link', { name: 'All usage' })).toHaveAttribute('href', '/fi/usage')
  })

  it('has only Overview, Usage and Statements in the menu', () => {
    expect(fiNav.map((n) => ('label' in n ? n.label : n.heading))).toEqual(['Overview', 'Usage', 'Statements'])
  })
})
