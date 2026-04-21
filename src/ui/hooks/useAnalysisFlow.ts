import { useState, useTransition, useMemo } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { PricingAnalysis } from '@/domain/entities/PricingAnalysis'
import { analyzePricingPageAction } from '@/actions/analyzePricingPage'
import { predictGazeAction } from '@/actions/predictGaze'
import { cancelRequestAction } from '@/actions/cancelRequest'
import { readStreamableValue } from '@ai-sdk/rsc'
import { PricingAnalysisProgressStep } from '@/application/usecases/ParsePricingPageUseCase'

export interface AnalysisProgress {
  step: PricingAnalysisProgressStep | 'DONE' | 'ERROR' | 'CANCELLED'
  screenshot?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  analysisToken?: string
  streamingTexts?: Record<string, string>
  error?: string
  analyses?: PricingAnalysis[]
}

export function useAnalysisFlow(onSuccess?: (analyses: PricingAnalysis[]) => void) {
  const [pricingUrl, setPricingUrl] = useState('')
  const [pricingImageBase64, setPricingImageBase64] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<PricingAnalysis[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const [predictingGazeId, setPredictingGazeId] = useState<string | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null)

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

const handleCancel = async () => {
    if (currentRequestId) {
      await cancelRequestAction(currentRequestId);
    }
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setCurrentRequestId(null)
    setAnalysisProgress(null)
    setError('Kynd stopped here. Ready when you are.')
  }

  const handleAnalyzePricing = (personas: Persona[]) => {
    if (!pricingUrl.trim() && !pricingImageBase64) return
    if (!personas) return

    setError(null)
    const controller = new AbortController()
    setAbortController(controller)
    setAnalysisProgress({ step: 'STARTING' })

    startTransition(async () => {
      try {
        const urlToUse = pricingImageBase64 ? "Manual Upload" : pricingUrl;
        const { streamData, requestId } = await analyzePricingPageAction(urlToUse, personas, undefined, pricingImageBase64 || undefined)
        setCurrentRequestId(requestId)

        let lastUpdate = 0;
        const THROTTLE_MS = 150;
        const accumulatedTexts: Record<string, string> = {};

        for await (const update of readStreamableValue(streamData)) {
          if (controller.signal.aborted) {
            setAnalysisProgress(null)
            setAbortController(null)
            setCurrentRequestId(null)
            return
          }

          if (update) {
            if (update.step === 'CANCELLED') {
              setAnalysisProgress(null)
              setAbortController(null)
              setCurrentRequestId(null)
              setError('Kynd stopped here. Ready when you are.')
              return
            }

            if (update.step === 'ERROR') {
              setError(formatError(update.error))
              setAnalysisProgress(null)
              setAbortController(null)
              setCurrentRequestId(null)
              return
            }

            if (update.step === 'DONE') {
              setAnalyses(update.analyses)
              setAnalysisProgress(null)
              setAbortController(null)
              setCurrentRequestId(null)
              if (onSuccess) onSuccess(update.analyses)
              return
            }

            // Accumulate tokens with safety limit for browser stability
            if (update.personaName && update.analysisToken) {
              const currentLength = (accumulatedTexts[update.personaName] || "").length;
              // Safety check to prevent excessively large strings (tripled to 150k)
              if (currentLength < 150000) {
                accumulatedTexts[update.personaName] = (accumulatedTexts[update.personaName] || "") + update.analysisToken;
              } else if (currentLength === 150000) {
                accumulatedTexts[update.personaName] += "\n\n[...Token limit reached for preview...]";
              }
            }

            const now = Date.now();
            if (now - lastUpdate > THROTTLE_MS) {
              setAnalysisProgress((prev) => {
                return {
                  ...update,
                  screenshot: update.screenshot || prev?.screenshot,
                  streamingTexts: { ...accumulatedTexts }
                } as AnalysisProgress;
              });
              lastUpdate = now;
            }
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(formatError(err))
        }
        setAnalysisProgress(null)
        setAbortController(null)
        setCurrentRequestId(null)
      }
    })
  }

  const handlePredictGaze = (analysis: PricingAnalysis, persona: Persona) => {
    if (predictingGazeId) return

    setPredictingGazeId(analysis.id)
    startTransition(async () => {
      try {
        const result = await predictGazeAction(persona, analysis.screenshotBase64)
        if (result.success && result.data) {
          setAnalyses((prev) =>
            prev ? prev.map(a => a.id === analysis.id ? { ...a, gazePoints: result.data } : a) : null
          )
        } else {
          setError(formatError(result.error || 'Something went wrong'))
        }
      } catch (err) {
        setError(formatError(err))
      } finally {
        setPredictingGazeId(null)
      }
    })
  }

  const combinedAnalysisStream = useMemo(() => {
    if (!analysisProgress?.streamingTexts) return undefined;
    return Object.entries(analysisProgress.streamingTexts)
      .map(([name, text]) => `### Thinking: ${name}\n${text}`)
      .join('\n\n---\n\n');
  }, [analysisProgress?.streamingTexts]);

  return {
    pricingUrl,
    setPricingUrl,
    pricingImageBase64,
    setPricingImageBase64,
    analyses,
    setAnalyses,
    error,
    setError,
    isPending,
    analysisProgress,
    predictingGazeId,
    handleAnalyzePricing,
    handlePredictGaze,
    handleCancel,
    combinedAnalysisStream
  }
}
