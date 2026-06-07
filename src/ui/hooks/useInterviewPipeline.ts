import { useState, useRef, useEffect, useCallback } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { startInterviewPipeline, getPipelineStatusAction } from '@/actions/startPipeline'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'

export type InterviewProgressStep = 'UPLOADING' | 'EXTRACTING' | 'POOLING' | 'SAMPLING' | 'GENERATING' | 'COMPILING' | 'DONE' | 'ERROR'

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

const POLL_INTERVAL_MS = 2000

export function useInterviewPipeline(onSuccess?: (personas: Persona[]) => void) {
  const [files, setFiles] = useState<InterviewFile[]>([])
  const [personas, setPersonas] = useState<Persona[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [progress, setProgress] = useState<InterviewProgress | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const addFile = (name: string, content: string) => {
    const id = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setFiles(prev => [...prev, { id, name, content }])
  }

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const clearFiles = () => setFiles([])

  const handleCancel = () => {
    cancelledRef.current = true
    stopPolling()
    jobIdRef.current = null
    setProgress(null)
    setError('Pipeline cancelled')
    setIsPending(false)
  }

  const handleSubmit = () => {
    if (files.length === 0) return

    cancelledRef.current = false
    setError(null)
    setPersonas(null)
    setIsPending(true)
    setProgress({ step: 'UPLOADING' })

    const formData = new FormData()
    for (const file of files) {
      const blob = new Blob([file.content], { type: 'text/plain' })
      formData.append('files', blob, file.name)
    }

    startInterviewPipeline(formData).then((result) => {
      if (cancelledRef.current) return

      if ('error' in result) {
        setError(result.error!)
        setProgress(null)
        setIsPending(false)
        return
      }

      const jobId = result.jobId
      jobIdRef.current = jobId

      // Start polling for results
      pollRef.current = setInterval(async () => {
        if (cancelledRef.current) {
          stopPolling()
          return
        }

        try {
          const status = await getPipelineStatusAction(jobId)

          if (!status.found) {
            setProgress({ step: 'UPLOADING', message: 'Starting pipeline...' })
            return
          }

          const state = status.state

          if (state.status === 'failed') {
            stopPolling()
            jobIdRef.current = null
            setError(state.error ?? 'Pipeline failed')
            setProgress(null)
            setIsPending(false)
            return
          }

          if (state.status === 'completed') {
            stopPolling()
            jobIdRef.current = null

            const outputPersonas: Persona[] = status.output ?? []
            if (outputPersonas.length === 0) {
              setError('Pipeline completed but no personas were generated')
              setProgress(null)
              setIsPending(false)
              return
            }

            const batch: PersonaBatch = {
              id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label: `${files.length} Interview${files.length !== 1 ? 's' : ''} (${files[0].name}${files.length > 1 ? ` +${files.length - 1}` : ''})`,
              source: 'interviews',
              transcriptCount: files.length,
              createdAt: new Date().toISOString(),
              personas: outputPersonas,
            }
            usePersonaStore.getState().addBatch(batch)
            setPersonas(outputPersonas)
            setProgress(null)
            setIsPending(false)
            if (onSuccess) onSuccess(outputPersonas)
            return
          }

          // Map background function statuses to UI step
          const stepMap: Record<string, InterviewProgressStep> = {
            queued: 'UPLOADING',
            extracting: 'EXTRACTING',
            pooling: 'POOLING',
            sampling: 'SAMPLING',
            generating: 'GENERATING',
            compiling: 'COMPILING',
          }
          setProgress({
            step: stepMap[state.status] ?? 'EXTRACTING',
            current: state.progress,
            total: state.total,
            message: state.message,
          })
        } catch (err) {
          console.error('[InterviewPipeline] Poll error:', err)
        }
      }, POLL_INTERVAL_MS)
    }).catch((err) => {
      if (!cancelledRef.current) {
        setError((err as Error).message)
        setProgress(null)
        setIsPending(false)
      }
    })
  }

  useEffect(() => {
    return () => {
      stopPolling()
      cancelledRef.current = true
    }
  }, [stopPolling])

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
