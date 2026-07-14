import { useState, useEffect, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { PricingAnalysis } from '@/domain/entities/PricingAnalysis'
import { analyzePricingPageAction } from '@/actions/analyzePricingPage'
import { predictGazeAction } from '@/actions/predictGaze'
import { cancelRequestAction } from '@/actions/cancelRequest'
import { getSimulationResultAction } from '@/actions/getSimulationResult'
import { getProgressAction } from '@/actions/getProgress'
import { getScreenshotAction } from '@/actions/getScreenshot'
import { readStreamableValue } from '@ai-sdk/rsc'
import { PricingAnalysisProgressStep } from '@/application/usecases/ParsePricingPageUseCase'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { generateSimulationName } from '@/domain/entities/Simulation'

export interface AnalysisProgress {
  step: PricingAnalysisProgressStep | 'DONE' | 'ERROR' | 'CANCELLED'
  screenshot?: string
  personaName?: string
  completedCount?: number
  totalCount?: number
  error?: string
  analyses?: PricingAnalysis[]
}

export function useAnalysisFlow(onSuccess?: (analyses: PricingAnalysis[]) => void) {
  const [pricingUrl, setPricingUrl] = useState('')
  const [pricingImageBase64, setPricingImageBase64] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<PricingAnalysis[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null)
  const [predictingGazeId, setPredictingGazeId] = useState<string | null>(null)

  const [currentRequestId, setCurrentRequestId] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // Don't abort the stream controller on unmount — the server needs to
      // finish processing and send the DONE event so markComplete is called.
      // The Zustand store continues to receive updates even after navigation.
    }
  }, [])

  const handleCancel = async () => {
    console.log(`[TRACE] [useAnalysisFlow] handleCancel called. requestId=${currentRequestId}`)
    if (currentRequestId) {
      await cancelRequestAction(currentRequestId);
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setCurrentRequestId(null)
    setAnalysisProgress(null)
    setError('Analysis cancelled by user')
  }

  const handleAnalyzePricing = (personas: Persona[], overrideUrl?: string) => {
    // Use overrideUrl when provided, so callers can pass the URL directly
    // without relying on pricingUrl state (which may not have committed yet).
    const activeUrl = overrideUrl?.trim() || pricingUrl.trim()
    if (!activeUrl && !pricingImageBase64) {
      console.log(`[TRACE] [useAnalysisFlow] handleAnalyzePricing: no URL or image, skipping`)
      return
    }
    if (!personas) {
      console.log(`[TRACE] [useAnalysisFlow] handleAnalyzePricing: no personas, skipping`)
      return
    }

    console.log(`[TRACE] [useAnalysisFlow] ========================================`)
    console.log(`[TRACE] [useAnalysisFlow] STARTING PRICING ANALYSIS FLOW`)
    console.log(`[TRACE] [useAnalysisFlow] ========================================`)
    console.log(`[TRACE] [useAnalysisFlow] url=${activeUrl}, imageBase64=${pricingImageBase64 ? 'present (' + pricingImageBase64.length + ' chars)' : 'none'}`)
    console.log(`[TRACE] [useAnalysisFlow] personas=${personas.length}: [${personas.map(p => p.name).join(', ')}]`)

    setError(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setAnalysisProgress({ step: 'STARTING' })

    const simulationId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    console.log(`[TRACE] [useAnalysisFlow] Creating simulation: id=${simulationId}, url=${activeUrl}`)

    useSimulationStore.getState().addSimulation({
      id: simulationId,
      name: generateSimulationName(activeUrl),
      url: activeUrl,
      status: 'IN_PROGRESS',
      personaCount: personas.length,
      personaNames: personas.map((p) => p.name),
      createdAt: new Date().toISOString(),
      currentStep: 'STARTING',
      completedAnalyses: 0,
      totalAnalyses: personas.length,
    })

    setIsPending(true)
    ;(async () => {
      // Declare screenshot polling vars outside try block so catch can access them
      let screenshotPollInterval: ReturnType<typeof setInterval> | null = null;
      const clearScreenshotPoll = () => {
        if (screenshotPollInterval) {
          clearInterval(screenshotPollInterval);
          screenshotPollInterval = null;
        }
      };

      try {
        const urlToUse = pricingImageBase64 ? "Manual Upload" : activeUrl;
        console.log(`[TRACE] [useAnalysisFlow] Calling analyzePricingPageAction with url="${urlToUse}", ${personas.length} personas...`)
        const actionStartTime = Date.now();
        const { streamData, requestId } = await analyzePricingPageAction(urlToUse, personas, simulationId, pricingImageBase64 || undefined)
        const actionCallDuration = Date.now() - actionStartTime;
        setCurrentRequestId(requestId)
        console.log(`[TRACE] [useAnalysisFlow] analyzePricingPageAction returned in ${actionCallDuration}ms. requestId=${requestId}`)

        // Start polling for screenshots via server-side store (bypasses RSC stream size limits)
        if (requestId) {
          screenshotPollInterval = setInterval(async () => {
              try {
                const result = await getScreenshotAction(requestId);
              if (result.found && result.base64) {
                useSimulationStore.getState().updateSimulation(simulationId, {
                  screenshot: result.base64,
                });
              }
            } catch (e) {
              // Silently fail — screenshot is non-critical
            }
          }, 2000);
        }

        if (streamData) {
          // ── Local dev: read streaming updates ─────────────────────────────
          for await (const update of readStreamableValue(streamData)) {
            if (controller.signal.aborted) {
              console.log(`[TRACE] [useAnalysisFlow] Controller aborted, stopping stream processing. requestId=${requestId}`)
              clearScreenshotPoll()
              return
            }

            if (!update) continue

            if (update.step === 'CANCELLED') {
              console.log(`[TRACE] [useAnalysisFlow] Received CANCELLED step. requestId=${requestId}`)
              clearScreenshotPoll()
              useSimulationStore.getState().markCancelled(simulationId)
              if (mountedRef.current) {
                setAnalysisProgress(null)
                setCurrentRequestId(null)
                setError('Analysis was cancelled')
              }
              return
            }

            if (update.step === 'ERROR') {
              console.log(`[TRACE] [useAnalysisFlow] Received ERROR step. requestId=${requestId}, error=${update.error}`)
              clearScreenshotPoll()
              useSimulationStore.getState().markError(simulationId, update.error ?? 'Analysis failed')
              if (mountedRef.current) {
                setError(update.error)
                setAnalysisProgress(null)
                setCurrentRequestId(null)
              }
              return
            }

            if (update.step === 'DONE') {
              console.log(`[TRACE] [useAnalysisFlow] RECEIVED DONE STEP — ${update.analyses?.length} analyses, requestId=${requestId}`)
              if (update.analyses) {
                update.analyses.forEach((a: PricingAnalysis, i: number) => {
                  console.log(`[TRACE] [useAnalysisFlow] Analysis[${i}]: id=${a.id}, gutReaction="${a.gutReaction?.slice(0, 100)}", scores={clarity:${a.scores?.clarity}, value:${a.scores?.valuePerception}, trust:${a.scores?.trust}, buy:${a.scores?.buyIntent}}, risks=${a.risks?.length}, recs=${a.recommendations?.length}`)
                })
              }
              clearScreenshotPoll()
              useSimulationStore.getState().markComplete(simulationId, update.analyses ?? [])
              if (mountedRef.current) {
                setAnalyses(update.analyses)
                setAnalysisProgress(null)
                setCurrentRequestId(null)
              }
              if (onSuccess) onSuccess(update.analyses)
              return
            }

            // Progress update: step, completedCount, screenshot
            if (update.completedCount !== undefined) {
              console.log(`[TRACE] [useAnalysisFlow] Progress: step=${update.step}, completedCount=${update.completedCount}/${update.totalCount}, persona=${update.personaName}`);
            }

            useSimulationStore.getState().updateSimulation(simulationId, {
              currentStep: update.step as any,
              completedAnalyses: update.completedCount,
              ...(update.screenshot ? { screenshot: update.screenshot } : {}),
            });

            if (mountedRef.current) {
              setAnalysisProgress(update as AnalysisProgress);
            }
          }
          clearScreenshotPoll()
          console.log(`[TRACE] [useAnalysisFlow] Stream ended without terminal step. Falling back to polling. requestId=${requestId}`)
          // Stream disconnected (HMR/dev-mode glitch, navigation, etc). Fall back to
          // polling the server-side result store, same as the simulation detail page.
        }

        // ── Remote/VPS or stream-disconnected: poll result store ────────────
        console.log(`[TRACE] [useAnalysisFlow] Polling result store. simulationId=${simulationId}, requestId=${requestId}`)
        for (let attempt = 0; attempt < 600; attempt++) {
          if (!mountedRef.current || controller.signal.aborted) break
          await new Promise((r) => setTimeout(r, 1000))

          // Poll progress every 3 seconds for step/completedCount visibility
          if (attempt % 3 === 0) {
            try {
              const progressResult = await getProgressAction(simulationId)
              if (progressResult.found && progressResult.progress) {
                const p = progressResult.progress
                useSimulationStore.getState().updateSimulation(simulationId, {
                  currentStep: (p.step as any) ?? undefined,
                  completedAnalyses: p.completedCount ?? p.completedAnalyses,
                })
              }
            } catch { /* non-critical */ }
          }

          try {
            const result = await getSimulationResultAction(simulationId)
            if (!result.found) continue
            clearScreenshotPoll()
            if (result.error) {
              useSimulationStore.getState().markError(simulationId, result.error)
            } else if (result.analyses && result.analyses.length > 0) {
              useSimulationStore.getState().markComplete(simulationId, result.analyses)
            }
            if (mountedRef.current) {
              setAnalyses(result.analyses ?? null)
              setAnalysisProgress(null)
              setCurrentRequestId(null)
            }
            if (result.analyses && onSuccess) onSuccess(result.analyses)
            return
          } catch { /* retry */ }
        }

        // Exhausted 600 polling attempts (~10 min) without a result
        clearScreenshotPoll()
        if (mountedRef.current && !controller.signal.aborted) {
          setError('Simulation analysis timed out. Please try again.')
          useSimulationStore.getState().markError(simulationId, 'Timed out after 600 polling attempts')
          setAnalysisProgress(null)
          setCurrentRequestId(null)
        }
      } catch (err) {
        clearScreenshotPoll()
        console.log(`[TRACE] [useAnalysisFlow] CAUGHT ERROR:`, (err as Error).message)
        useSimulationStore.getState().markError(simulationId, (err as Error).message)
        if (mountedRef.current) {
          if (!controller.signal.aborted) {
            setError((err as Error).message)
          }
          setAnalysisProgress(null)
          setCurrentRequestId(null)
        }
      } finally {
        setIsPending(false)
      }
    })()
  }

  const handlePredictGaze = (analysis: PricingAnalysis, persona: Persona) => {
    if (predictingGazeId) return

    setPredictingGazeId(analysis.id)
    ;(async () => {
      try {
        const result = await predictGazeAction(persona, analysis.screenshotBase64)
        if (result.success && result.data) {
          setAnalyses((prev) =>
            prev ? prev.map(a => a.id === analysis.id ? { ...a, gazePoints: result.data } : a) : null
          )
        } else {
          setError(result.error || "Failed to predict gaze")
        }
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setPredictingGazeId(null)
      }
    })()
  }

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
  }
}
