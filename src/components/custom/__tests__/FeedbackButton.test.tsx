import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'

const { submitFeedback } = vi.hoisted(() => ({
  submitFeedback: vi.fn(async () => ({ opened: true })),
}))

vi.mock('@/lib/feedback', () => ({ submitFeedback }))

import { FeedbackButton } from '../FeedbackButton'

afterEach(() => {
  cleanup()
  submitFeedback.mockClear()
})

function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: /feedback/i }))
  return screen.findByRole('dialog')
}

describe('FeedbackButton', () => {
  it('opens the dialog from its trigger and closes on Escape', async () => {
    render(<FeedbackButton />)
    expect(screen.queryByRole('dialog')).toBeNull()

    await openDialog()
    expect(screen.getByText('Send feedback')).toBeTruthy()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('submitting an empty message sends nothing and keeps the dialog open', async () => {
    render(<FeedbackButton />)
    await openDialog()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send report/i }))
    })

    expect(submitFeedback).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeTruthy()
  })

  it('submitting a filled message reaches submitFeedback and closes the dialog', async () => {
    render(<FeedbackButton />)
    await openDialog()

    fireEvent.change(screen.getByLabelText(/what happened/i), {
      target: { value: 'The analysis never finished' },
    })
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'me@example.com' },
    })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send report/i }))
    })

    expect(submitFeedback).toHaveBeenCalledTimes(1)
    expect(submitFeedback).toHaveBeenCalledWith({
      kind: 'general',
      message: 'The analysis never finished',
      email: 'me@example.com',
      context: undefined,
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('pre-fills the error message and reports it as an error report', async () => {
    render(
      <FeedbackButton
        label="Report this error"
        defaultMessage="Generation failed: upstream timeout"
        context={{ error: 'Generation failed: upstream timeout', runId: 'run-7' }}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /report this error/i }))
    await screen.findByRole('dialog')

    expect(screen.getByLabelText(/what happened/i)).toHaveProperty(
      'value',
      'Generation failed: upstream timeout',
    )

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /send report/i }))
    })

    expect(submitFeedback).toHaveBeenCalledWith({
      kind: 'error',
      message: 'Generation failed: upstream timeout',
      email: undefined,
      context: { error: 'Generation failed: upstream timeout', runId: 'run-7' },
    })
  })
})
