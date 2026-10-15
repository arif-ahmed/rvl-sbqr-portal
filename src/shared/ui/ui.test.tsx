import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BarChart, Button, ConfirmDialog, ExpiryChip, Field, Input, StatusChip, toneFor } from '.'

describe('shared ui', () => {
  it('maps statuses to tones', () => {
    expect(toneFor('Finalized')).toBe('ok')
    expect(toneFor('Draft')).toBe('warn')
    expect(toneFor('Terminated')).toBe('bad')
    expect(toneFor('Pending')).toBe('info')
    render(<StatusChip status="Queued" label="2 queued" />)
    expect(screen.getByText('2 queued')).toBeInTheDocument()
  })

  it('shows a field error with an alert role', () => {
    render(
      <Field label="Amount" htmlFor="a" error="Enter a non-zero amount.">
        <Input id="a" />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a non-zero amount.')
  })

  it('confirm dialog calls onConfirm', async () => {
    const onConfirm = vi.fn()
    render(
      <ConfirmDialog open onOpenChange={() => {}} title="Terminate?" description="Permanent." confirmLabel="Terminate" danger onConfirm={onConfirm} />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Terminate' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })

  it('renders a chart with compact axis labels and a button', () => {
    render(
      <>
        <BarChart label="Calls" data={[{ label: 'Sep', a: 150000, b: 90000 }]} />
        <Button>Save</Button>
      </>,
    )
    expect(screen.getByRole('img', { name: 'Calls' })).toBeInTheDocument()
    expect(screen.getByText('240k')).toBeInTheDocument()
  })

  // 2026-10-15 (cert-expiry workstream): ExpiryChip auto-pick rule
  // (bad: past or null · warn: <= 30d · ok: further out) and the data-*
  // hooks it exposes for tests / e2e.
  it('picks tone automatically based on the deadline', () => {
    const today = new Date()
    const inDays = (n: number) => new Date(today.getTime() + n * 86_400_000).toISOString()
    const { rerender } = render(<ExpiryChip validUntil={null} />)
    expect(screen.getByTestId('expiry-chip')).toHaveAttribute('data-tone', 'bad')

    rerender(<ExpiryChip validUntil={inDays(-1)} />) // yesterday
    expect(screen.getByTestId('expiry-chip')).toHaveAttribute('data-tone', 'bad')

    rerender(<ExpiryChip validUntil={inDays(7)} />) // within 30d
    expect(screen.getByTestId('expiry-chip')).toHaveAttribute('data-tone', 'warn')

    rerender(<ExpiryChip validUntil={inDays(200)} />) // comfortably future
    expect(screen.getByTestId('expiry-chip')).toHaveAttribute('data-tone', 'ok')
  })
})
