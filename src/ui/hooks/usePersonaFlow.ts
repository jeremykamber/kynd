import { useState, useTransition } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasAction } from '@/actions/generatePersonas'
import { readStreamableValue } from '@ai-sdk/rsc'

export type PersonaProgressStep = 'BRAINSTORMING_PERSONAS' | 'GENERATING_BACKSTORIES' | 'DONE' | 'ERROR'

export interface PersonaProgress {
  step: PersonaProgressStep
  personaName?: string
  completedCount?: number
  totalCount?: number
  completedSubSteps?: number
  totalSubSteps?: number
  streamingTexts?: Record<string, string>
  personas?: Persona[]
  error?: string
}

export function usePersonaFlow(onSuccess?: (personas: Persona[]) => void) {
  const [customerProfile, setCustomerProfile] = useState('')
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [personaProgress, setPersonaProgress] = useState<PersonaProgress | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  const handleCancel = () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setPersonaProgress(null)
    setError('Persona generation cancelled')
  }

  const handleGeneratePersonas = () => {
    if (!customerProfile.trim()) return

    setError(null)
    const controller = new AbortController()
    setAbortController(controller)
    setPersonaProgress({ step: 'BRAINSTORMING_PERSONAS' })

    startTransition(async () => {
      try {
        const { streamData } = await generatePersonasAction(customerProfile, controller.signal)

        let lastUpdate = 0;
        const THROTTLE_MS = 150;

        let lastStep: string | null = null;

        for await (const update of readStreamableValue(streamData)) {
          if (controller.signal.aborted) {
            setPersonaProgress(null)
            setAbortController(null)
            return
          }

          if (update) {
            if (update.step === 'ERROR') {
              setError(update.error)
              setPersonaProgress(null)
              setAbortController(null)
              return
            }

            if (update.step === 'DONE') {
              setPersonas(update.personas)
              setPersonaProgress(null)
              setAbortController(null)
              if (onSuccess) onSuccess(update.personas)
              return
            }

            const now = Date.now();
            const stepChanged = update.step !== lastStep;

            if (stepChanged || now - lastUpdate > THROTTLE_MS) {
              setPersonaProgress((prevProgress) => {
                const newStreams = { ...(prevProgress?.streamingTexts || {}) };
                if (update.personaName && update.streamingText) {
                  newStreams[update.personaName] = update.streamingText;
                }
                return {
                  ...update,
                  streamingTexts: newStreams
                } as PersonaProgress;
              });
              lastUpdate = now;
              lastStep = update.step;
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError((err as Error).message)
        }
        setPersonaProgress(null)
        setAbortController(null)
      }
    })
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
