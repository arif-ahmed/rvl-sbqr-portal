import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('lands on the institution surface by default', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Institution Portal' })).toBeInTheDocument()
  })
})
