'use client'

import { AnalysisToaster } from './AnalysisToaster'
import { PersonaProgressToaster } from './PersonaProgressToaster'

/**
 * Mounts the app-wide toast listeners — artifact analyses and persona
 * generation — in the root layout. Both render nothing themselves.
 */
export function ToasterProvider() {
  return (
    <>
      <AnalysisToaster />
      <PersonaProgressToaster />
    </>
  )
}
