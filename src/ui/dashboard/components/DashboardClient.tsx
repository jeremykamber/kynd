'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { usePersonaFlow } from '@/ui/hooks/usePersonaFlow'

import { SetupView } from './views/SetupView'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { PersonaProfilePanel } from '@/components/custom/PersonaProfilePanel'
import { PersonaSkeletonCard } from '@/components/custom/PersonaSkeletonCard'
import { PersonaDetailSheet } from '@/components/custom/PersonaDetailSheet'
import type { VariationFormData } from '@/components/custom/SimilarPersonaDialog'
import { LayersIcon, SparklesIcon, PlayIcon, PlusIcon, ChevronDownIcon, FileTextIcon, PenIcon, ClockIcon, XIcon, ArrowLeftIcon, AlertTriangleIcon } from 'lucide-react'
import Link from 'next/link'
import { FlowDialog } from '@/components/custom/FlowDialog'
import { InlineRenamable } from '@/components/custom/InlineRenamable'
import { Progress } from '@/components/ui/progress'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Persona } from '@/domain/entities/Persona'
import { readStreamableValue } from '@ai-sdk/rsc'
import { generateSimilarPersonasAction } from '@/actions/generateSimilarPersonas'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { summarizeError } from '@/lib/errorSummary'
import { FeedbackButton } from '@/components/custom/FeedbackButton'
import { DESTRUCTIVE_CARD_CONTROL_CLASS } from '@/lib/utils'

/** One timestamp format for both the ready and the failed batch card. */
function batchTimestamp(createdAt: string): string {
    return new Date(createdAt).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

/**
 * Persona dashboard shell: routes between the setup form and the active
 * batch's persona grid. Owns the variant-generation flow (placeholders → server
 * stream → toast) and the persona detail sheet. Reads/writes the persona store
 * and `usePersonaFlow`; reads analysis counts from the analysis store.
 */
export function DashboardClient() {
    const router = useRouter()
    const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null)
    const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false)
    const [sheetDefaultTab, setSheetDefaultTab] = useState<"profile" | "chat" | "variant">("profile")
    const [pendingPersonaIds, setPendingPersonaIds] = useState<Set<string>>(new Set())
    const [showSetup, setShowSetup] = useState(false)
    const [showExpandedFlow, setShowExpandedFlow] = useState(false)
    const batches = usePersonaStore((s) => s.batches)
    const activeRunIds = usePersonaStore((s) => s.activeGenerationRunIds)
    const activeBatchId = usePersonaStore((s) => s.activeBatchId)
    const setActiveBatch = usePersonaStore((s) => s.setActiveBatch)
    const insertPersonasAfter = usePersonaStore((s) => s.insertPersonasAfter)
    const updatePersona = usePersonaStore((s) => s.updatePersona)
    const removePersona = usePersonaStore((s) => s.removePersona)
    const removeBatch = usePersonaStore((s) => s.removeBatch)
    const updateBatchLabel = usePersonaStore((s) => s.updateBatchLabel)
    const personaFlow = usePersonaFlow()

    // True when a generation is actively running (not completed or errored).
    // Used to auto-exit the setup view and to gate the "New Batch" flow.
    const isGenerating = activeRunIds.length > 0 ||
        // Loose != catches both null and undefined — step is absent before/after clear
        (personaFlow.personaProgress?.step != null &&
         personaFlow.personaProgress.step !== 'DONE' &&
         personaFlow.personaProgress.step !== 'ERROR')

    // Auto-exit setup view when generation starts — the batch list view
    // handles active-visibility via skeleton cards + toast.
    useEffect(() => {
        if (!showSetup) return
        if (isGenerating) setShowSetup(false)
    }, [showSetup, isGenerating])

    const toastIdRef = useRef<string | number | null>(null)

    const activeBatch = activeBatchId
        ? batches.find((b) => b.id === activeBatchId)
        : null

    const analyses = useAnalysisStore((s) => s.analyses)
    const batchAnalysisCount = activeBatchId
        ? analyses.filter((s) => s.batchId === activeBatchId).length
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

            insertPersonasAfter(batchId, referencePersona.id, placeholders)
            console.log("[DashboardClient] Variation flow started - reference:", referencePersona.name, "count:", formData.count, "placeholders:", placeholderIds.length);
            setPendingPersonaIds((prev) => {
                const next = new Set(prev)
                placeholderIds.forEach((id) => next.add(id))
                return next
            })

            const count = formData.count
            toastIdRef.current = toast.loading(
                `Generating ${count} variation${count > 1 ? 's' : ''} of ${referencePersona.name}`,
                {
                    description: 'Creating personas with adjusted traits...',
                    icon: <SparklesIcon className="h-4 w-4 text-primary animate-pulse" />,
                },
            )

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

                        setPendingPersonaIds((prev) => {
                            const next = new Set(prev)
                            placeholderIds.forEach((id) => next.delete(id))
                            return next
                        })

                        setIsDetailSheetOpen(false)
                        setSelectedPersonaId(null)
                        return
                    }

                    if (update.step === 'ERROR') {
                        console.log("[DashboardClient] Stream returned error:", update.error);
                        if (toastIdRef.current) {
                            toast.error('Failed to generate variations', {
                                id: toastIdRef.current,
                                description: summarizeError(update.error ?? 'Unknown error'),
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
                        description: summarizeError(err instanceof Error ? err.message : String(err)),
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

    // Skip setup view when generation is active — batch list shows skeleton cards instead
    const showSetupView = (batches.length === 0 || showSetup) && !isGenerating && !activeBatchId

    const progressPercent = personaFlow.personaProgress
        ? personaFlow.personaProgress.step === 'BRAINSTORMING_PERSONAS'
            ? 10
            : personaFlow.personaProgress.step === 'GENERATING_BACKSTORIES'
                ? personaFlow.personaProgress.totalCount && personaFlow.personaProgress.totalCount > 0
                    ? 20 + ((personaFlow.personaProgress.completedCount ?? 0) / personaFlow.personaProgress.totalCount) * 30
                    : 20
                : personaFlow.personaProgress.step === 'ADDING_BEHAVIORAL_DEPTH'
                    ? 50
                    : personaFlow.personaProgress.step === 'DONE'
                        ? 100
                        : 0
        : 0

    return (
        <>
            {showSetupView ? (
                <div className="animate-in fade-in duration-500">
                    <SetupView personaFlow={personaFlow} onBack={batches.length > 0 ? () => setShowSetup(false) : undefined} />
                </div>
            ) : (
                <div className="flex flex-col gap-8 animate-in fade-in duration-500">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <h1 className="text-2xl font-semibold tracking-tight">Personas</h1>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <button className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
                                    <PlusIcon className="h-3.5 w-3.5" />
                                    New Batch
                                    <ChevronDownIcon className="h-3 w-3 opacity-60" />
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                                <DropdownMenuItem asChild>
                                    <Link href="/dashboard/new">
                                        <PenIcon className="h-4 w-4 mr-2" />
                                        From ICP description
                                    </Link>
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
                            {activeRunIds.map((runId) => (
                                <Link
                                    key={runId}
                                    href={`/dashboard/generating/${runId}`}
                                    className="flex items-center gap-4 rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-border/80 animate-pulse"
                                >
                                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                        <ClockIcon className="h-5 w-5 text-primary animate-spin" />
                                    </div>
                                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                        <span className="font-semibold truncate">Generating personas...</span>
                                        <span className="text-sm text-muted-foreground">In progress</span>
                                    </div>
                                </Link>
                            ))}
                            {batches.map((batch) => (
                                <div
                                    key={batch.id}
                                    className="group relative"
                                >
                                    {batch.error ? (
                                        <div className="flex items-start gap-4 w-full rounded-lg border border-destructive/30 bg-card p-5 text-left">
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-destructive/10">
                                                <AlertTriangleIcon className="h-5 w-5 text-destructive" />
                                            </div>
                                            <div className="flex flex-col gap-1 min-w-0 flex-1">
                                                <InlineRenamable
                                                    value={batch.label}
                                                    onRename={(label) => updateBatchLabel(batch.id, label)}
                                                    className="min-w-0"
                                                />
                                                <span className="text-sm text-destructive">
                                                    Generation failed · {summarizeError(batch.error)}
                                                </span>
                                                <FeedbackButton
                                                    label="Report this error"
                                                    defaultMessage={batch.error}
                                                    context={{ error: batch.error }}
                                                    variant="outline"
                                                    size="sm"
                                                    className="mt-1 w-fit"
                                                />
                                            </div>
                                            <span className="text-xs text-muted-foreground shrink-0 font-mono tabular-nums">
                                                {batchTimestamp(batch.createdAt)}
                                            </span>
                                        </div>
                                    ) : (
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => setActiveBatch(batch.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault()
                                                    setActiveBatch(batch.id)
                                                }
                                            }}
                                            className="flex items-center gap-4 w-full rounded-lg border border-border bg-card p-5 text-left transition-colors hover:border-border/80 cursor-pointer"
                                        >
                                            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                                                <LayersIcon className="h-5 w-5 text-primary" />
                                            </div>
                                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                                                <InlineRenamable
                                                    value={batch.label}
                                                    onRename={(label) => updateBatchLabel(batch.id, label)}
                                                    className="min-w-0"
                                                />
                                                <span className="text-sm text-muted-foreground">
                                                    {batch.personas.length} personas ·{' '}
                                                    {batch.source === 'interviews'
                                                        ? 'from interviews'
                                                        : 'from description'}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground shrink-0 font-mono tabular-nums">
                                                {batchTimestamp(batch.createdAt)}
                                            </span>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation()
                                            removeBatch(batch.id)
                                        }}
                                        className={DESTRUCTIVE_CARD_CONTROL_CLASS}
                                        aria-label="Delete batch"
                                    >
                                        <XIcon className="size-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6">
                            <button
                                onClick={() => setActiveBatch(null)}
                                className="flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                            >
                                <ArrowLeftIcon className="h-4 w-4" />
                                All personas
                            </button>
                            <div className="flex flex-col gap-1 min-w-0 border-b border-border/40 pb-4">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h2 className="text-lg font-semibold tracking-tight min-w-0">
                                        <InlineRenamable
                                            value={activeBatch.label}
                                            onRename={(label) => updateBatchLabel(activeBatch.id, label)}
                                        />
                                    </h2>
                                    {batchAnalysisCount > 0 && (
                                        <Link
                                            href="/dashboard/analyses"
                                            className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-sm font-medium tabular-nums text-primary transition-colors hover:bg-primary/20"
                                        >
                                            <PlayIcon className="h-3 w-3" />
                                            {batchAnalysisCount} analysis{batchAnalysisCount !== 1 ? 's' : ''}
                                        </Link>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {activeBatch.personas.length} personas ·{' '}
                                    {activeBatch.source === 'interviews'
                                        ? 'from interviews'
                                        : 'Generated from description'}
                                    {' · '}
                                    {new Date(activeBatch.createdAt).toLocaleString()}
                                </p>
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

            {showSetupView && personaFlow.personaProgress && !showExpandedFlow && (
              <button
                onClick={() => setShowExpandedFlow(true)}
                className="fixed bottom-6 right-6 z-50 inline-flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium shadow-lg transition-colors hover:bg-accent"
              >
                <LayersIcon className="h-3.5 w-3.5" />
                Show Progress
              </button>
            )}

            {showSetupView && (
                <FlowDialog
                    open={showExpandedFlow && !!personaFlow.personaProgress}
                    onOpenChange={(open) => {
                        if (!open) setShowExpandedFlow(false)
                    }}
                    transparentOverlay
                    title="Synthesizing Audience"
                    description="Kynd is generating realistic personas based on your target profile."
                    currentStep={
                        personaFlow.personaProgress?.step === 'BRAINSTORMING_PERSONAS'
                            ? 0
                            : personaFlow.personaProgress?.step === 'GENERATING_BACKSTORIES'
                                ? 1
                                : personaFlow.personaProgress?.step === 'ADDING_BEHAVIORAL_DEPTH'
                                    ? 2
                                    : 3
                    }
                    steps={[
                        { title: 'Analyzing Market', description: 'Mapping demographics and psychographics', cyclingTexts: ['Analyzing your target profile...', 'Mapping demographics and psychographics...', 'Identifying key behavioral segments...'] },
                        { title: 'Generating Personas', description: 'Creating detailed backstories and traits', cyclingTexts: ['Crafting backstories...', 'Defining motivations...', 'Building psychographic foundations...'] },
                        { title: 'Rationalizing Behavior', description: 'Anchoring psychographics to personality traits', cyclingTexts: ['Generating behavioral insights...', 'Mapping personality traits...', 'Creating decision frameworks...'] },
                        { title: 'Finalizing', description: 'Preparing avatars, insights, and profiles' },
                    ]}
                    progressPercent={progressPercent}
                    streamingText={personaFlow.personaProgress?.streamingText}
                    personaName={personaFlow.personaProgress?.personaName}
                    completedCount={personaFlow.personaProgress?.completedCount}
                    totalCount={personaFlow.personaProgress?.totalCount}
                >
                    {personaFlow.personaProgress && personaFlow.personaProgress.step === 'DONE' ? (
                        <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6">
                            <div className="h-14 w-14 rounded-full bg-primary flex items-center justify-center animate-in zoom-in-95 fade-in duration-300">
                                <svg
                                    className="h-7 w-7 text-primary-foreground"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>

                            <h3 className="text-lg font-semibold tracking-tight">Generation Complete</h3>

                            <p className="text-sm text-muted-foreground text-center text-balance">
                                {personaFlow.personaProgress.personas?.length ?? 0} personas created from your target profile.
                            </p>

                            <div className="flex flex-col sm:flex-row gap-3 w-full pt-2">
                                <button
                                    onClick={() => {
                                        if (personaFlow.lastCompletedBatchId) {
                                            setActiveBatch(personaFlow.lastCompletedBatchId)
                                        }
                                        personaFlow.handleClearProgress()
                                        setShowSetup(false)
                                    }}
                                    className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
                                >
                                    <LayersIcon className="h-4 w-4" />
                                    See Personas
                                </button>
                                <button
                                    onClick={() => {
                                        if (personaFlow.lastCompletedBatchId) {
                                            const id = personaFlow.lastCompletedBatchId
                                            personaFlow.handleClearProgress()
                                            router.push(`/dashboard/analyses?batchId=${id}`)
                                        }
                                    }}
                                    className="flex-1 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-5 text-sm font-semibold transition-colors hover:bg-accent"
                                >
                                    <PlayIcon className="h-4 w-4" />
                                    Run Analysis
                                </button>
                            </div>
                        </div>
                    ) : personaFlow.personaProgress ? (
                        <div className="flex flex-col items-center justify-center w-full max-w-sm mx-auto space-y-6">
                            <Progress
                                value={progressPercent}
                                className="h-2 w-full"
                                indicatorClassName="animate-pulse"
                            />

                            {personaFlow.personaProgress.personas && personaFlow.personaProgress.personas.length > 0 && (
                                <div className="flex flex-wrap gap-3 justify-center">
                                    {personaFlow.personaProgress.personas.map((p) => {
                                        const isCompletePhase =
                                            personaFlow.personaProgress?.step === 'DONE'
                                        const isCurrentPersona =
                                            personaFlow.personaProgress?.personaName === p.name
                                        return (
                                            <div key={p.id} className="flex flex-col items-center gap-1.5">
                                                <div
                                                    className={`h-8 w-8 rounded-full border transition-all duration-300 ${isCompletePhase
                                                            ? 'bg-primary border-primary'
                                                            : isCurrentPersona
                                                                ? 'border-primary bg-primary/10'
                                                                : 'border-border bg-transparent'
                                                        }`}
                                                >
                                                    {isCompletePhase && (
                                                        <svg
                                                            className="h-full w-full p-1.5 text-primary-foreground"
                                                            fill="none"
                                                            viewBox="0 0 24 24"
                                                            stroke="currentColor"
                                                            strokeWidth={3}
                                                        >
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    )}
                                                </div>
                                                <span
                                                    className={`text-xs max-w-18 truncate text-center ${isCompletePhase ? 'text-foreground' : 'text-muted-foreground'
                                                        }`}
                                                >
                                                    {p.name.split(' ')[0]}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}

                        </div>
                    ) : null}
                </FlowDialog>
            )}


            <PersonaDetailSheet
                persona={selectedPersona}
                isOpen={isDetailSheetOpen}
                onClose={handleCloseSheet}
                defaultTab={sheetDefaultTab}
                onCreateVariant={selectedPersona ? () => handleOpenVariant(selectedPersona) : undefined}
                onGenerateVariation={handleGenerateVariation}
                onEdit={activeBatchId ? (personaId, updates) => updatePersona(activeBatchId, personaId, updates) : undefined}
            />
        </>
    )
}
