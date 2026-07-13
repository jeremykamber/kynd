'use client'

import { SimulationToaster } from './SimulationToaster'
import { PersonaProgressToaster } from './PersonaProgressToaster'

export function ToasterProvider() {
  return (
    <>
      <SimulationToaster />
      <PersonaProgressToaster />
    </>
  )
}
