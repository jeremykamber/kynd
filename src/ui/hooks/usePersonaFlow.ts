import { useState, useEffect, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasAction } from '@/actions/generatePersonas'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'
import { readStreamableValue } from '@ai-sdk/rsc'

export type PersonaProgressStep = 'BRAINSTORMING_PERSONAS' | 'GENERATING_BACKSTORIES' | 'ENHANCING_WITH_PBJ' | 'DONE' | 'ERROR'

export interface PersonaProgress {
  step: PersonaProgressStep
  personaName?: string
  completedCount?: number
  totalCount?: number
  completedSubSteps?: number
  totalSubSteps?: number
  personas?: Persona[]
  error?: string
}

export function usePersonaFlow(onSuccess?: (personas: Persona[]) => void) {
  const [customerProfile, setCustomerProfile] = useState('')
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [personaProgress, setPersonaProgress] = useState<PersonaProgress | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Don't abort — server-side IIFE continues independently.
    }
  }, [])

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      setAbortController(null)
    }
    setPersonaProgress(null)
    setError('Persona generation cancelled')
  }

  const handleGeneratePersonas = () => {
    if (!customerProfile.trim()) return

    setError(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setAbortController(controller)
    setPersonaProgress({ step: 'BRAINSTORMING_PERSONAS' })
    setIsPending(true)

    ;(async () => {
      try {
        const { streamData } = await generatePersonasAction(customerProfile)

        for await (const update of readStreamableValue(streamData)) {
          if (!update) continue

          if (update.step === 'ERROR') {
            if (mountedRef.current) {
              setError(update.error)
              setPersonaProgress(null)
              setAbortController(null)
            }
            return
          }

          if (update.step === 'DONE') {
            const batch: PersonaBatch = {
              id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label: `"${customerProfile.slice(0, 40)}${customerProfile.length > 40 ? '...' : ''}"`,
              source: 'description',
              createdAt: new Date().toISOString(),
              personas: update.personas!,
            }
            usePersonaStore.getState().addBatch(batch)
            if (mountedRef.current) {
              setPersonas(update.personas)
              setPersonaProgress(null)
              setAbortController(null)
            }
            if (onSuccess) onSuccess(update.personas)
            return
          }

          // Progress update: step, count, etc.
          if (mountedRef.current) {
            setPersonaProgress(update as PersonaProgress);
          }
        }
      } catch (err) {
        if (mountedRef.current && !controller.signal.aborted) {
          setError((err as Error).message)
          setPersonaProgress(null)
          setAbortController(null)
        }
      } finally {
        if (mountedRef.current) setIsPending(false)
      }
    })()
  }

  return {
    customerProfile,
    setCustomerProfile,
    personas,
    setPersonas,
    error,
    setError,
    isPending,
    personaProgress,
    handleGeneratePersonas,
    handleCancel
  }
}
