import { useState, useTransition, useMemo, useEffect, useRef } from 'react'
import { Persona } from '@/domain/entities/Persona'
import { PricingAnalysis } from '@/domain/entities/PricingAnalysis'
import { analyzePricingPageAction } from '@/actions/analyzePricingPage'
import { predictGazeAction } from '@/actions/predictGaze'
import { cancelRequestAction } from '@/actions/cancelRequest'
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
      setAbortController(null)
    }
    setCurrentRequestId(null)
    setAnalysisProgress(null)
    setError('Analysis cancelled by user')
  }

  const handleAnalyzePricing = (personas: Persona[]) => {
    if (!pricingUrl.trim() && !pricingImageBase64) {
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
    console.log(`[TRACE] [useAnalysisFlow] url=${pricingUrl}, imageBase64=${pricingImageBase64 ? 'present (' + pricingImageBase64.length + ' chars)' : 'none'}`)
    console.log(`[TRACE] [useAnalysisFlow] personas=${personas.length}: [${personas.map(p => p.name).join(', ')}]`)

    setError(null)
    const controller = new AbortController()
    abortControllerRef.current = controller
    setAbortController(controller)
    setAnalysisProgress({ step: 'STARTING' })

    const simulationId = `sim-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    console.log(`[TRACE] [useAnalysisFlow] Creating simulation: id=${simulationId}, url=${pricingUrl}`)

    useSimulationStore.getState().addSimulation({
      id: simulationId,
      name: generateSimulationName(pricingUrl),
      url: pricingUrl,
      status: 'IN_PROGRESS',
      personaCount: personas.length,
      personaNames: personas.map((p) => p.name),
      createdAt: new Date().toISOString(),
      currentStep: 'STARTING',
      completedAnalyses: 0,
      totalAnalyses: personas.length,
    })

    startTransition(async () => {
      // Declare screenshot polling vars outside try block so catch can access them
      let screenshotPollInterval: ReturnType<typeof setInterval> | null = null;
      const clearScreenshotPoll = () => {
        if (screenshotPollInterval) {
          clearInterval(screenshotPollInterval);
          screenshotPollInterval = null;
        }
      };

      try {
        const urlToUse = pricingImageBase64 ? "Manual Upload" : pricingUrl;
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

        let lastUpdate = 0;
        let lastStoreUpdate = 0;
        const THROTTLE_MS = 350;
        const accumulatedTexts: Record<string, string> = {};
        let updateCount = 0;

        for await (const update of readStreamableValue(streamData)) {
          updateCount++;
          if (controller.signal.aborted) {
            // Component unmounted or user cancelled. The server either finishes
            // (DONE) or was explicitly cancelled (CANCELLED through the stream).
            // Detach React state updates but keep processing the stream for
            // Zustand store updates so markComplete can still be called.
            console.log(`[TRACE] [useAnalysisFlow] Controller aborted. requestId=${requestId}, updatesProcessed=${updateCount}`)
            // Don't return — keep reading stream for CANCELLED/DONE events
          }

          if (update) {
            if (update.step === 'CANCELLED') {
              console.log(`[TRACE] [useAnalysisFlow] Received CANCELLED step. requestId=${requestId}, updatesProcessed=${updateCount}`)
              clearScreenshotPoll()
              useSimulationStore.getState().markCancelled(simulationId)
              if (mountedRef.current) {
                setAnalysisProgress(null)
                setAbortController(null)
                setCurrentRequestId(null)
                setError('Analysis was cancelled')
              }
              return
            }

            if (update.step === 'ERROR') {
              console.log(`[TRACE] [useAnalysisFlow] Received ERROR step. requestId=${requestId}, error=${update.error}, updatesProcessed=${updateCount}`)
              clearScreenshotPoll()
              useSimulationStore.getState().markError(simulationId, update.error ?? 'Analysis failed')
              if (mountedRef.current) {
                setError(update.error)
                setAnalysisProgress(null)
                setAbortController(null)
                setCurrentRequestId(null)
              }
              return
            }

            if (update.step === 'DONE') {
              console.log(`[TRACE] [useAnalysisFlow] ========================================`)
              console.log(`[TRACE] [useAnalysisFlow] RECEIVED DONE STEP`)
              console.log(`[TRACE] [useAnalysisFlow] ========================================`)
              console.log(`[TRACE] [useAnalysisFlow] analyses=${update.analyses?.length}, requestId=${requestId}, updatesProcessed=${updateCount}`)

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
                setAbortController(null)
                setCurrentRequestId(null)
              }
              if (onSuccess) onSuccess(update.analyses)
              return
            }

            if (update.step) {
              console.log(`[TRACE] [useAnalysisFlow] Step [${updateCount}]: ${update.step} (completedCount=${update.completedCount ?? '?'}, totalCount=${update.totalCount ?? '?'}, personaName=${update.personaName ?? 'none'}, hasToken=${!!update.analysisToken})`);
            }

            if (update.personaName && update.analysisToken) {
              const currentLength = (accumulatedTexts[update.personaName] || "").length;
              if (currentLength < 150000) {
                accumulatedTexts[update.personaName] = (accumulatedTexts[update.personaName] || "") + update.analysisToken;
              } else if (currentLength === 150000) {
                accumulatedTexts[update.personaName] += "\n\n[...Token limit reached for preview...]";
              }
            }

            const now = Date.now();

            if (update.completedCount !== undefined) {
              console.log(`[TRACE] [useAnalysisFlow] Progress: step=${update.step}, completedCount=${update.completedCount}/${update.totalCount}, persona=${update.personaName}`);
            }

            // Low-frequency state changes (step, count, screenshot) update the store
            // immediately so the UI reflects progress. These happen a few times per run
            // (step transitions, persona completions) and don't flood the reconciler.
            const hasNontextUpdate = update.step || update.completedCount !== undefined || update.screenshot;
            if (hasNontextUpdate) {
              if (update.screenshot) {
                console.log(`[TRACE] [useAnalysisFlow] Screenshot received: step=${update.step}, screenshotLength=${update.screenshot.length}`);
              }
              useSimulationStore.getState().updateSimulation(simulationId, {
                currentStep: update.step as any,
                completedAnalyses: update.completedCount,
                ...(update.screenshot ? { screenshot: update.screenshot } : {}),
              });
            }

            // High-frequency streaming text is throttled to prevent reconciler flood.
            // Token-level events arrive 100+/sec per persona; we batch them at ~3/sec.
            if (now - lastStoreUpdate > THROTTLE_MS) {
              useSimulationStore.getState().updateSimulation(simulationId, {
                currentStep: update.step as any,
                completedAnalyses: update.completedCount,
                ...(update.screenshot ? { screenshot: update.screenshot } : {}),
                streamingTexts: { ...accumulatedTexts },
              });

              if (mountedRef.current) {
                setAnalysisProgress((prev) => {
                  return {
                    ...update,
                    screenshot: update.screenshot || prev?.screenshot,
                    streamingTexts: { ...accumulatedTexts }
                  } as AnalysisProgress;
                });
              }
              lastStoreUpdate = now;
            }
          }
        }
        clearScreenshotPoll()
        console.log(`[TRACE] [useAnalysisFlow] Stream iteration ended. requestId=${requestId}, totalUpdates=${updateCount}`)
      } catch (err) {
        clearScreenshotPoll()
        console.log(`[TRACE] [useAnalysisFlow] CAUGHT ERROR:`, (err as Error).message)
        if (mountedRef.current) {
          if (!controller.signal.aborted) {
            setError((err as Error).message)
          }
          setAnalysisProgress(null)
          setAbortController(null)
          setCurrentRequestId(null)
        }
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
          setError(result.error || "Failed to predict gaze")
        }
      } catch (err) {
        setError((err as Error).message)
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

  // The stream continues processing after navigation so the server can
  // send the DONE event and call markComplete on the Zustand store.

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
