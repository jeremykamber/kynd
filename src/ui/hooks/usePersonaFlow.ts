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

  const formatError = (error: string | Error | unknown): string => {
  if (typeof error === 'string') {
    if (error.includes('rate limit') || error.includes('Rate limit')) {
      return "Kynd hit a limit here. Let's pause and try again in a moment."
    }
    if (error.includes('aborted') || error.includes('cancelled')) {
      return 'Kynd stopped here. Ready when you are.'
    }
    return error
  }
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('rate limit') || message.includes('Rate limit')) {
    return "Kynd hit a limit here. Let's pause and try again in a moment."
  }
  if (message.includes('aborted') || message.includes('cancelled')) {
    return 'Kynd stopped here. Ready when you are.'
  }
  return "Kynd lost the trail here. Let's try that again."
}

const handleCancel = () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setPersonaProgress(null)
    setError('Kynd stopped here. Ready when you are.')
  }

  const handleGeneratePersonas = () => {
    if (!customerProfile.trim()) return

    setError(null)
    const controller = new AbortController()
    setAbortController(controller)
    setPersonaProgress({ step: 'BRAINSTORMING_PERSONAS' })

    startTransition(async () => {
      try {
        const { streamData } = await generatePersonasAction(customerProfile)

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
              setError(formatError(update.error))
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
          setError(formatError(err))
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
