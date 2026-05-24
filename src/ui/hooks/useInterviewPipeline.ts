import { useState, useTransition, useRef, useEffect } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { generatePersonasFromInterviewsAction } from '@/actions/generatePersonasFromInterviews'
import { readStreamableValue } from '@ai-sdk/rsc'

export type InterviewProgressStep = 'UPLOADING' | 'EXTRACTING' | 'POOLING' | 'SAMPLING' | 'GENERATING' | 'INGESTING' | 'DONE' | 'ERROR'

export interface InterviewProgress {
  step: InterviewProgressStep
  current?: number
  total?: number
  message?: string
  personas?: Persona[]
  error?: string
}

export interface InterviewFile {
  id: string
  name: string
  content: string
}

export function useInterviewPipeline(onSuccess?: (personas: Persona[]) => void) {
  const [files, setFiles] = useState<InterviewFile[]>([])
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [progress, setProgress] = useState<InterviewProgress | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const addFile = (name: string, content: string) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFiles(prev => [...prev, { id, name, content }])
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearFiles = () => setFiles([])

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    setProgress(null)
    setError('Pipeline cancelled')
  }

  const handleSubmit = () => {
    if (files.length === 0) return

    setError(null)
    setPersonas(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setProgress({ step: 'UPLOADING' })

    startTransition(async () => {
      try {
        const formData = new FormData()
        for (const file of files) {
          const blob = new Blob([file.content], { type: 'text/plain' })
          formData.append('files', blob, file.name)
        }

        const { streamData } = await generatePersonasFromInterviewsAction(formData)

        for await (const update of readStreamableValue(streamData)) {
          if (controller.signal.aborted) {
            setProgress(null)
            abortControllerRef.current = null
            return
          }

          if (update) {
            if (update.step === 'ERROR') {
              setError(update.error)
              setProgress(null)
              abortControllerRef.current = null
              return
            }

            if (update.step === 'DONE') {
              setPersonas(update.personas)
              setProgress(null)
              abortControllerRef.current = null
              if (onSuccess) onSuccess(update.personas)
              return
            }

            setProgress(update as InterviewProgress)
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError((err as Error).message)
        }
        setProgress(null)
        abortControllerRef.current = null
      }
    })
  }

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
    }
  }, [])

  return {
    files, addFile, removeFile, clearFiles,
    personas, setPersonas,
    error, setError,
    isPending,
    progress,
    handleSubmit,
    handleCancel,
  }
}
