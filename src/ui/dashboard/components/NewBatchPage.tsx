'use client'

import { useRouter } from 'next/navigation'
import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'
import { SetupView } from './views/SetupView'

/**
 * Route entry for `/dashboard/new`: wires the persona-generation flow into
 * SetupView and returns to the dashboard on back.
 */
export function NewBatchPage() {
  const router = useRouter()
  const personaFlow = usePersonaFlow()

  return (
    <SetupView personaFlow={personaFlow} onBack={() => router.push('/dashboard')} />
  )
}
