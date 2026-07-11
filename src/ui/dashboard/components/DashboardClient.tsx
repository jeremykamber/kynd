'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'

import { SetupView } from './views/SetupView'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { PersonaProfilePanel } from '@/components/custom/PersonaProfilePanel'
import { PersonaSkeletonCard } from '@/components/custom/PersonaSkeletonCard'
import { PersonaDetailSheet } from '@/components/custom/PersonaDetailSheet'
import type { VariationFormData } from '@/components/custom/SimilarPersonaDialog'
import { LayersIcon, SparklesIcon, PlayIcon, PlusIcon, ChevronDownIcon, FileTextIcon, PenIcon } from 'lucide-react'
import Link from 'next/link'
import { FlowDialog } from '@/components/custom/FlowDialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Persona } from '@/domain/entities/Persona'
import { readStreamableValue } from '@ai-sdk/rsc'
import { generateSimilarPersonasAction } from '@/actions/generateSimilarPersonas'
import { useSimulationStore } from '@/ui/stores/simulationStore'

export function DashboardClient() {
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
  const [sheetDefaultTab, setSheetDefaultTab] = useState<"profile" | "chat" | "variant">("profile")
  const [pendingPersonaIds, setPendingPersonaIds] = useState<Set<string>>(new Set())
  const [showSetup, setShowSetup] = useState(false)
  const batches = usePersonaStore((s) => s.batches)
  const activeBatchId = usePersonaStore((s) => s.activeBatchId)
  const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)
  const insertPersonasAfter = usePersonaStore((s) => s.insertPersonasAfter)
  const updatePersona = usePersonaStore((s) => s.updatePersona)
  const removePersona = usePersonaStore((s) => s.removePersona)
  const personaFlow = usePersonaFlow()

  // Auto-exit setup view when generation completes
  useEffect(() => {
    if (personaFlow.personas && showSetup) {
      setShowSetup(false)
    }
  }, [personaFlow.personas])

  const toastIdRef = useRef<string | number | null>(null)

  const activeBatch = activeBatchId
    ? batches.find((b) => b.id === activeBatchId)
    : null

  const simulations = useSimulationStore((s) => s.simulations)
  const batchSimulationCount = activeBatchId
    ? simulations.filter((s) => s.batchId === activeBatchId).length
    : 0

  const getPersona = (id: string) => activeBatch?.personas.find(p => p.id === id) ?? null
  const selectedPersona = selectedPersonaId ? getPersona(selectedPersonaId) : null

  const handleOpenDetail = (id: string) => {
    setSelectedPersonaId(id)
    setSheetDefaultTab("profile")
    setIsDetailSheetOpen(true)
  }

  const handleOpenChat = (persona: Persona) => {
    setSelectedPersonaId(persona.id)
    setSheetDefaultTab("chat")
    setIsDetailSheetOpen(true)
  }

  const handleOpenVariant = (persona: Persona) => {
    setSelectedPersonaId(persona.id)
    setSheetDefaultTab("variant")
    setIsDetailSheetOpen(true)
  }

  const handleDeletePersona = (personaId: string) => {
    if (activeBatchId) {
      removePersona(activeBatchId, personaId)
    }
  }

  const handleCloseSheet = () => {
    setIsDetailSheetOpen(false)
    setSelectedPersonaId(null)
  }

  const handleGenerateVariation = useCallback(
    async (referencePersona: Persona, formData: VariationFormData) => {
      const batchId = usePersonaStore.getState().activeBatchId
      if (!batchId) return

      // 1. Create placeholder personas with shimmer
      const placeholderIds: string[] = []
      const placeholders: Persona[] = []

      for (let i = 0; i < formData.count; i++) {
        const placeholderId = `placeholder-${Date.now()}-${i}`
        placeholderIds.push(placeholderId)
        placeholders.push({
          id: placeholderId,
          name: 'Generating...',
          age: 0,
          occupation: '',
          educationLevel: '',
          interests: [],
          goals: [],
          conscientiousness: 50,
          neuroticism: 50,
          openness: 50,
          extraversion: 50,
          agreeableness: 50,
          values: [],
          fears: [],
          communicationStyle: '',
          decisionStyle: '',
          pricingSensitivity: 50,
          typicalBudget: '',
          variantOf: { id: referencePersona.id, name: referencePersona.name },
        })
      }

      // 2. Insert placeholders right after the reference persona
      insertPersonasAfter(batchId, referencePersona.id, placeholders)
      console.log("[DashboardClient] Variation flow started - reference:", referencePersona.name, "count:", formData.count, "placeholders:", placeholderIds.length);
      setPendingPersonaIds((prev) => {
        const next = new Set(prev)
        placeholderIds.forEach((id) => next.add(id))
        return next
      })

      // 3. Show a toast for the generation
      const count = formData.count
      toastIdRef.current = toast.loading(
        `Generating ${count} variation${count > 1 ? 's' : ''} of ${referencePersona.name}`,
        {
          description: 'Creating personas with adjusted traits...',
          icon: <SparklesIcon className="h-4 w-4 text-primary animate-pulse" />,
        },
      )

      // 4. Call server action and stream results
      try {
        console.log("[DashboardClient] Calling generateSimilarPersonasAction with bigFive:", formData.bigFive, "variationLevel:", formData.variationLevel);
        const { streamData } = await generateSimilarPersonasAction(
          referencePersona,
          { bigFive: formData.bigFive, variationLevel: formData.variationLevel },
          formData.count,
        )

        let completedCount = 0

        for await (const update of readStreamableValue(streamData)) {
          if (!update) continue

          if (update.step === 'DONE' && update.personas) {
            console.log("[DashboardClient] Stream completed - received", update.personas.length, "personas from server");
            // Replace each placeholder with the real persona data
            update.personas.forEach((realPersona, idx) => {
              const placeholderId = placeholderIds[idx]
              if (placeholderId) {
                const { id: _unusedId, ...personaData } = realPersona
                updatePersona(batchId, placeholderId, {
                  ...personaData,
                  variantOf: { id: referencePersona.id, name: referencePersona.name },
                })
                completedCount++
              }
            })

            // Clean up any extra placeholders (if LLM returned fewer than requested)
            for (let i = update.personas.length; i < placeholderIds.length; i++) {
              const unusedId = placeholderIds[i]
              if (unusedId) {
                setPendingPersonaIds((prev) => {
                  const next = new Set(prev)
                  next.delete(unusedId)
                  return next
                })
              }
            }

            // Update toast to success
            if (toastIdRef.current) {
              toast.success(
                `${completedCount} variation${completedCount > 1 ? 's' : ''} of ${referencePersona.name} generated`,
                {
                  id: toastIdRef.current,
                  description: 'New persona cards added to the batch',
                  icon: <SparklesIcon className="h-4 w-4 text-primary" />,
                },
              )
              toastIdRef.current = null
            }

            // Mark all as done (remove from pending)
            setPendingPersonaIds((prev) => {
              const next = new Set(prev)
              placeholderIds.forEach((id) => next.delete(id))
              return next
            })
            return
          }

          if (update.step === 'ERROR') {
            console.log("[DashboardClient] Stream returned error:", update.error);
            if (toastIdRef.current) {
              toast.error('Failed to generate variations', {
                id: toastIdRef.current,
                description: update.error ?? 'Unknown error',
              })
              toastIdRef.current = null
            }
            setPendingPersonaIds((prev) => {
              const next = new Set(prev)
              placeholderIds.forEach((id) => next.delete(id))
              return next
            })
            return
          }
        }
      } catch (err) {
        console.error("[DashboardClient] Variation generation threw exception:", err);
        if (toastIdRef.current) {
          toast.error('Failed to generate variations', {
            id: toastIdRef.current,
            description: (err as Error).message,
          })
          toastIdRef.current = null
        }
        setPendingPersonaIds((prev) => {
          const next = new Set(prev)
          placeholderIds.forEach((id) => next.delete(id))
          return next
        })
      }
    },
    [insertPersonasAfter, updatePersona],
  )

  const showSetupView = batches.length === 0 || showSetup

  return (
    <>
      {/* Main content — setup view or batch view */}
      {showSetupView ? (
        <div className="animate-in fade-in duration-500">
          <SetupView personaFlow={personaFlow} onBack={batches.length > 0 ? () => setShowSetup(false) : undefined} />
        </div>
      ) : (
        <div className="flex flex-col gap-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Personas</h1>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
              <PlusIcon className="h-3.5 w-3.5" />
              New Batch
              <ChevronDownIcon className="h-3 w-3 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={() => { setActiveBatch(null); setShowSetup(true) }}>
              <PenIcon className="h-4 w-4 mr-2" />
              From ICP description
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/dashboard/interviews">
                <FileTextIcon className="h-4 w-4 mr-2" />
                From interviews
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!activeBatch ? (
        <div className="flex flex-col gap-4">
          {batches.map((batch) => (
            <button
              key={batch.id}
              onClick={() => setActiveBatch(batch.id)}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-border/80"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <LayersIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                <span className="font-semibold truncate">{batch.label}</span>
                <span className="text-sm text-muted-foreground">
                  {batch.personas.length} personas ·{' '}
                  {batch.source === 'interviews'
                    ? `${batch.transcriptCount} transcripts`
                    : 'from description'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {new Date(batch.createdAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-border/40 pb-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight">
                  {activeBatch.label}
                </h2>
                {batchSimulationCount > 0 && (
                  <Link
                    href="/dashboard/simulations"
                    className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
                  >
                    <PlayIcon className="h-3 w-3" />
                    {batchSimulationCount} simulation{batchSimulationCount !== 1 ? 's' : ''}
                  </Link>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {activeBatch.personas.length} personas ·{' '}
                {activeBatch.source === 'interviews'
                  ? `${activeBatch.transcriptCount} interview transcripts`
                  : 'Generated from description'}
                · {new Date(activeBatch.createdAt).toLocaleString()}
              </p>
            </div>
            <button
              onClick={() => setActiveBatch(null)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 transition-colors"
            >
              All Batches
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activeBatch.personas.map((persona, idx) => {
              // Use combined key to prevent collisions from duplicate persona IDs
              const key = `${persona.id}::${idx}`
              return pendingPersonaIds.has(persona.id) ? (
                <PersonaSkeletonCard key={key} />
              ) : (
                <PersonaProfilePanel
                  key={key}
                  persona={persona}
                  onClick={() => handleOpenDetail(persona.id)}
                  onChatClick={() => handleOpenChat(persona)}
                  onCreateVariant={() => handleOpenVariant(persona)}
                  onDelete={handleDeletePersona}
                />
              )
            })}
          </div>
        </div>
      )}

    </div>
      )}

      {/* Persona Generation Streaming Dialog (only in setup view) */}
      {showSetupView && (
        <FlowDialog
          open={!!personaFlow.personaProgress}
          onOpenChange={(open) => {
            if (!open && personaFlow.personaProgress) {
              personaFlow.handleCancel()
            }
          }}
          transparentOverlay
          title="Synthesizing Audience"
          description="Kynd is generating realistic personas based on your target profile."
          currentStep={
            personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS'
              ? 0
              : personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES'
                ? 1
                : personaFlow.personaProgress?.step === 'ENHANCING_WITH_PBJ'
                  ? 2
                  : 3
          }
          steps={[
            { title: 'Analyzing Market', description: 'Mapping demographics and psychographics' },
            { title: 'Generating Personas', description: 'Creating detailed backstories and traits' },
            { title: 'Rationalizing Behavior', description: 'Anchoring psychographics to personality (PB&J)' },
            { title: 'Finalizing', description: 'Preparing avatars, insights, and profiles' },
          ]}
        >
          {personaFlow.personaProgress && (
            <div className="flex flex-col items-center justify-center space-y-4">
              <p className="text-sm font-medium text-muted-foreground animate-pulse">
                {personaFlow.personaProgress.step === 'BRAINSTORMING_PERSONAS' &&
                  'Identifying key demographic segments...'}
                {personaFlow.personaProgress.step === 'GENERATING_BACKSTORIES' &&
                  `Fleshing out backstories (${personaFlow.personaProgress.completedCount || 0}/${personaFlow.personaProgress.totalCount || 3})`}
                {personaFlow.personaProgress.step === 'ENHANCING_WITH_PBJ' &&
                  'Building psychological rationales...'}
              </p>
              {personaFlow.personaProgress.personaName && (
                <p className="text-sm text-foreground/80">
                  Currently generating:{' '}
                  <span className="font-semibold">
                    {personaFlow.personaProgress.personaName}
                  </span>
                </p>
              )}
            </div>
          )}
        </FlowDialog>
      )}


      <PersonaDetailSheet
        persona={selectedPersona}
        isOpen={isDetailSheetOpen}
        onClose={handleCloseSheet}
        defaultTab={sheetDefaultTab}
        onCreateVariant={selectedPersona ? () => handleOpenVariant(selectedPersona) : undefined}
        onGenerateVariation={handleGenerateVariation}
      />
    </>
  )
}
