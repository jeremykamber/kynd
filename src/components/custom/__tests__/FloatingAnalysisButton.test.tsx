import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

const { router, personaState, pathname } = vi.hoisted(() => ({
  router: { push: vi.fn(), replace: vi.fn() },
  personaState: { batches: [] as unknown[] },
  pathname: { current: '/dashboard' },
}))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => pathname.current,
}))

vi.mock('@/ui/stores/personaStore', () => ({
  usePersonaStore: (selector: (s: { batches: unknown[] }) => unknown) => selector(personaState),
}))

import { FloatingAnalysisButton } from '../FloatingAnalysisButton'

afterEach(cleanup)

beforeEach(() => {
  router.push.mockClear()
  personaState.batches = []
  pathname.current = '/dashboard'
})

describe('FloatingAnalysisButton', () => {
  it('navigates to the analyses page with the new-analysis flag so the form opens', () => {
    personaState.batches = [{ id: 'batch-1' }]
    render(<FloatingAnalysisButton />)

    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }))

    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith('/dashboard/analyses?new=1')
  })

  it('does not navigate when the user has no persona batches', () => {
    render(<FloatingAnalysisButton />)

    fireEvent.click(screen.getByRole('button', { name: /run analysis/i }))

    expect(router.push).not.toHaveBeenCalled()
  })
})
