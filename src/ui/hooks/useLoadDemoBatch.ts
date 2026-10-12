/**
 * Loads the demo batch and puts the user in front of it.
 *
 * The demo is how a new user or a reviewer gets a populated workspace, so it has
 * to be reachable once the workspace already has data: the empty-state setup
 * view disappears then, and the batch list keeps the same action behind its "New
 * Batch" menu. Both entry points (`SetupView`'s empty state and
 * `DashboardClient`'s menu) call this one handler, so the batch is added once
 * and the navigation to the personas route behaves the same either way.
 */

import { useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { DEMO_PERSONA_BATCH } from '@/domain/entities/MockPersonas'
import { usePersonaStore } from '@/ui/stores/personaStore'

export function useLoadDemoBatch(): () => void {
  const router = useRouter()
  const pathname = usePathname()

  return useCallback(() => {
    const store = usePersonaStore.getState()
    if (!store.batches.some((b) => b.id === DEMO_PERSONA_BATCH.id)) {
      store.addBatch(DEMO_PERSONA_BATCH)
    }
    store.setActiveBatch(DEMO_PERSONA_BATCH.id)
    if (pathname !== '/dashboard') router.push('/dashboard')
  }, [pathname, router])
}
