import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeBackend } from '../../test/fake-backend'
import { fiSession } from '../../test/fi-session'
import { renderApp } from '../../test/providers'
import { SHAPLA, TEESTA, seedOctober2026 } from '../../test/scenario'
import { StatementDetailPage } from './statement-detail-page'
import { StatementsPage } from './statements-page'

const open = (path: string, tenantId = SHAPLA) => {
  const session = fiSession(tenantId)
  return renderApp(
    <Routes>
      <Route path="/fi/statements" element={<StatementsPage session={session} />} />
      <Route path="/fi/statements/:period" element={<StatementDetailPage session={session} />} />
      <Route path="/fi/usage" element={<p>usage page</p>} />
    </Routes>,
    [path],
  )
}

let backend: FakeBackend
const install = async (tenantId = SHAPLA) => {
  backend = await new FakeBackend().install({ tenantId })
  seedOctober2026(backend)
}
beforeEach(() => install())
afterEach(() => {
  backend.reset()
  vi.restoreAllMocks()
})

describe('FI statements', () => {
  it('lists the institution’s own finalized statements, newest first', async () => {
    open('/fi/statements')
    await screen.findByText('August 2026')
    const rows = screen.getAllByRole('row').slice(1)
    // April to August; September is still a draft and is not shown to the institution.
    expect(rows).toHaveLength(5)
    expect(within(rows[0]).getByText('August 2026')).toBeInTheDocument()
    expect(within(rows[0]).getByText('Finalized')).toBeInTheDocument()
    expect(within(rows[0]).getByText('+৳ 300')).toBeInTheDocument()
    expect(within(rows[4]).getByText('April 2026')).toBeInTheDocument()
    expect(screen.queryByText('September 2026')).not.toBeInTheDocument()
    expect(screen.queryByText('Karnaphuli Trust Bank')).not.toBeInTheDocument()
  })

  it('lists only the months this institution was billed', async () => {
    backend.reset()
    await install(TEESTA)
    open('/fi/statements', TEESTA)
    await screen.findByText('August 2026')
    // Teesta has had a card since July.
    expect(screen.getAllByRole('row').slice(1)).toHaveLength(2)
  })

  it('opens a statement from its row', async () => {
    const user = userEvent.setup()
    open('/fi/statements')
    await screen.findByText('August 2026')
    await user.click(screen.getAllByRole('row')[1])
    expect(await screen.findByRole('article', { name: 'Statement' })).toBeInTheDocument()
    expect(screen.getByText('1 – 31 August 2026')).toBeInTheDocument()
    expect(screen.getByText(/Support hours, August \(INC-2188\)/)).toBeInTheDocument()
  })

  it('shows the bill with a way to check it against usage, and prints it as a PDF', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    open('/fi/statements/2026-08')
    expect(await screen.findByRole('link', { name: /Statements/ })).toHaveAttribute('href', '/fi/statements')
    expect(screen.getByRole('link', { name: 'Open usage for August 2026' })).toHaveAttribute('href', '/fi/usage?period=2026-08')
    await user.click(screen.getByRole('button', { name: /Download PDF/ }))
    expect(print).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /Download CSV/ })).toBeInTheDocument()
  })

  it('goes back to the list when there is no such statement, including a month that is still a draft', async () => {
    open('/fi/statements/2026-09')
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
  })
})
