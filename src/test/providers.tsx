import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createQueryClient } from '../shared/api/query'

/** Render under a fresh QueryClient (so one test's cache never leaks into the next) and a MemoryRouter. */
export function renderApp(ui: ReactElement, entries: string[] = ['/']) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={entries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}
