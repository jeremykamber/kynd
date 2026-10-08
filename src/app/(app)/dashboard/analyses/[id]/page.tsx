'use client'

import { use, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { useRouter } from 'next/navigation'
import { getAnalysisResultAction } from '@/actions/getAnalysisResult'
import { getProgressAction } from '@/actions/getProgress'
import { StepIndicator } from '@/components/custom/StepIndicator'
import { FeedbackButton } from '@/components/custom/FeedbackButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ArrowLeftIcon, ClockIcon, CheckCircleIcon, XCircleIcon, AlertTriangleIcon, ChevronDownIcon, ChevronRightIcon, UsersIcon, MessageCircleIcon, DownloadIcon, Loader2Icon, FileTextIcon, HelpCircleIcon } from 'lucide-react'
import { REPORT_DISCLAIMER, REPORT_INTRO } from '@/lib/reportDisclosure'
import { toast } from 'sonner'
import { exportAnalysisAsPdf } from '@/lib/exportPdf'
import type { Persona } from '@/domain/entities/Persona'
import type { PersonaResponse } from '@/domain/entities/PersonaResponse'
import type { MajorFinding } from '@/domain/entities/MajorFinding'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import type { PersonaProfile } from '@/domain/entities/PersonaProfile'
import type { SynthesizedFinding } from '@/domain/entities/ArtifactSynthesis'
import type { StageJourney, StageOutcome } from '@/domain/entities/StageJourney'
import { cn } from '@/lib/utils'
import { fallbackSynthesis } from '@/ui/dashboard/utils/fallbackSynthesis'
import { resolveChatPersona } from '@/ui/dashboard/utils/resolveChatPersona'
import { PersonaChat } from '@/ui/dashboard/components/chat/PersonaChat'
import { PanelChat } from '@/ui/dashboard/components/chat/PanelChat'
import { InlineRenamable } from '@/components/custom/InlineRenamable'
import { CitationTooltip, type EvidenceCitation } from '@/components/custom/CitationTooltip'
import { RawThinkAloudSheet } from '@/components/custom/RawThinkAloudSheet'
/** Citations on a finding, dropping any entry that lacks the fields the UI reads. */
function citationsOf(finding: SynthesizedFinding): EvidenceCitation[] {
  if (!finding || typeof finding !== 'object' || !('citations' in finding)) return []
  const citations: unknown = finding.citations
  if (!Array.isArray(citations)) return []
  return citations.filter(
    (c): c is EvidenceCitation =>
      !!c && typeof c === 'object' && 'personaId' in c && 'personaName' in c && 'quote' in c
  )
}


const ANALYSIS_STEPS = [
  { title: 'Starting', description: 'Initializing analysis' },
  { title: 'Capturing', description: 'Loading the artifact' },
  { title: 'Analyzing', description: 'Simulating persona responses' },
]

/** Micro-label above a content group, per the design system. */
const SECTION_LABEL = 'micro-label text-muted-foreground/70'

function getCurrentStep(step?: string): number {
  if (!step || step === 'STARTING') return 0
  if (step === 'INTAKE') return 1
  if (step === 'ANALYZING') return 2
  return 0
}

// The cognitive journey is ONE axis: how far the persona got. A persona that
// is blocked or stopped never evaluates the later stages, so the path ends
// where they dropped off. Sentiment (how they felt) is deliberately not drawn
// as a second colour axis — the stop itself is the signal, and two encodings
// at every node is what made this screen unreadable.
//
// Three states, three colours: Verified Green for a stage the persona actually
// completed, Caution for the single node where the journey ended, neutral for
// the stages after it that were never reached. `blocked` and `stopped` are
// different facts — an obstacle versus the persona's own choice — but the same
// outcome for the reader, so they share Caution and differ only in the word
// (and in the tooltip that spells the difference out).
const OUTCOME_META: Record<StageOutcome, { label: string; title: string; icon: typeof CheckCircleIcon; className: string }> = {
  succeeded: {
    label: 'Reached',
    title: 'This stage was completed.',
    icon: CheckCircleIcon,
    className: 'text-success',
  },
  blocked: {
    label: 'Blocked here',
    title: 'Something outside the persona ended the journey at this stage.',
    icon: AlertTriangleIcon,
    className: 'text-warning-foreground',
  },
  stopped: {
    label: 'Stopped here',
    title: 'The persona stopped here, or an earlier stage had already ended the journey.',
    icon: XCircleIcon,
    className: 'text-warning-foreground',
  },
}

/** One-glance verdict for the collapsed persona row. */
function journeyVerdict(journey: StageJourney[]): { label: string; title: string; className: string } {
  const at = journey.findIndex((s) => s.outcome === 'blocked' || s.outcome === 'stopped')
  if (at === -1) {
    return { label: 'Reached the end', title: 'This persona completed all five stages.', className: 'text-success' }
  }
  const stage = journey[at]
  const meta = OUTCOME_META[stage.outcome]
  return { label: `${meta.label.replace(' here', '')} at ${stage.stage}`, title: meta.title, className: meta.className }
}

/**
 * The persona's path through the five stages, ending where they stopped.
 * Reached stages carry their description; the abandonment node is named; the
 * stages after it are quiet "not reached" rows, so the path visibly ends
 * instead of implying the model evaluated them.
 */
function JourneyPath({ journey }: { journey: StageJourney[] }) {
  const abandonedAt = journey.findIndex((s) => s.outcome === 'blocked' || s.outcome === 'stopped')
  const reached = abandonedAt === -1 ? journey.length : abandonedAt + 1

  return (
    <ol className="flex flex-col">
      {journey.map((stage, i) => {
        const isReached = i < reached
        const isTerminal = i === abandonedAt
        const meta = OUTCOME_META[stage.outcome]
        const Icon = meta.icon
        const isLast = i === journey.length - 1

        return (
          <li key={stage.stage} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border bg-background',
                  isTerminal
                    ? cn('border-current', meta.className)
                    : isReached
                      ? 'border-success/40 text-success'
                      : 'border-border text-muted-foreground/30',
                )}
              >
                {isTerminal ? (
                  <Icon className="size-3" />
                ) : (
                  <span className={cn('size-1.5 rounded-full bg-current', !isReached && 'opacity-50')} />
                )}
              </span>
              {!isLast && (
                <span
                  className={cn(
                    'w-px flex-1',
                    isReached && !isTerminal ? 'bg-muted-foreground/30' : 'bg-border',
                  )}
                />
              )}
            </div>
            <div className={cn('flex flex-col gap-0.5', !isLast && 'pb-4')}>
              <span className="micro-label text-foreground/80">
                {stage.stage}
              </span>
              {isTerminal && (
                <span className={cn('text-xs font-semibold', meta.className)} title={meta.title}>
                  {meta.label}
                </span>
              )}
              <span className="text-sm leading-snug text-muted-foreground">
                {isReached ? stage.description : 'Not reached'}
              </span>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * /dashboard/analyses/[id]: the full report for one analysis, read from the
 * client analysis store. While the analysis is IN_PROGRESS the page polls the
 * server result/progress stores, both to keep the view current and to recover
 * runs whose RSC stream was cut off by a reload or navigation.
 */
export default function AnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const analysis = useAnalysisStore((s) => s.getAnalysis(id))
  const updateAnalysis = useAnalysisStore((s) => s.updateAnalysis)
  const removeAnalysis = useAnalysisStore((s) => s.removeAnalysis)
  const [isHydrated, setIsHydrated] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const handleExportPdf = async () => {
    if (isExporting || !analysis) return
    setIsExporting(true)
    try {
      await exportAnalysisAsPdf(analysis)
      toast.success('PDF report downloaded')
    } catch (err) {
      console.error('Failed to export PDF:', err)
      toast.error('Failed to generate PDF report. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }
  // During SSR there's no localStorage → store is always empty → getAnalysis
  // returns undefined. Without hydration tracking, the server renders the
  // "not found" fallback while the client (after rehydration) renders the
  // full content, causing Next.js hydration mismatch.
  useEffect(() => {
    setIsHydrated(true)
  }, [])

  // Reconnection: when the page loads and the analysis is IN_PROGRESS,
  // the server-side IIFE is still running (from the original server action).
  // Poll the server-side result store to catch results that were computed
  // after the client disconnected (reload/navigate away).
  useEffect(() => {
    if (!isHydrated || !analysis || analysis.status !== 'IN_PROGRESS') return
    console.log(`[DETAIL_POLL] Starting result poll for ${analysis.id}`)

    let active = true
    let attempts = 0
    const MAX_ATTEMPTS = 600 // 10 minutes at 1s intervals (6-persona analysis takes ~15 min)

    const poll = async () => {
      while (active && attempts < MAX_ATTEMPTS) {
        attempts++
        try {
          const result = await getAnalysisResultAction(analysis.id)
          if (!active) return

          if (result.found) {
            console.log(`[DETAIL_POLL] ${analysis.id}: RESULT FOUND on attempt ${attempts}`)
            if (result.error) {
              useAnalysisStore.getState().markError(analysis.id, result.error)
            } else if (result.analyses && result.analyses.length > 0) {
              useAnalysisStore.getState().markComplete(analysis.id, result.analyses, result.synthesis)
            }
            return
          }
        } catch {
          // Poller error — retry on next interval
        }
        await new Promise((r) => setTimeout(r, 1000))
      }
      console.log(`[DETAIL_POLL] ${analysis.id}: Exhausted ${MAX_ATTEMPTS} attempts without finding result`)
    }

    poll()
    return () => { active = false }
  }, [isHydrated, analysis?.id, analysis?.status])

  // Progress polling: when the analysis is IN_PROGRESS and the RSC stream
  // may have disconnected (navigation), poll the server-side progress store
  // for intermediate updates (currentStep, completedResponses) and detection
  // of completion. This complements the result polling above.
  useEffect(() => {
    if (!isHydrated || !analysis || analysis.status !== 'IN_PROGRESS') return
    console.log(`[DETAIL_POLL] Starting progress poll for ${analysis.id}`)

    const interval = setInterval(async () => {
      try {
        const result = await getProgressAction(analysis.id);
        if (!result.found || !result.progress) return;

        const p = result.progress;
        const updates: Partial<ArtifactAnalysis> = {};

        if (p.step) updates.currentStep = p.step as any;
        if (p.completedResponses !== undefined) updates.completedResponses = p.completedResponses;
        if (p.totalResponses !== undefined) updates.totalResponses = p.totalResponses;

        if (Object.keys(updates).length > 0) {
          useAnalysisStore.getState().updateAnalysis(analysis.id, updates);
        }

        if (p.hasCompleted) {
          clearInterval(interval);
          const result2 = await getAnalysisResultAction(analysis.id);
          if (result2.found && result2.analyses && result2.analyses.length > 0) {
            useAnalysisStore.getState().markComplete(analysis.id, result2.analyses, result2.synthesis);
          }
        }

        if (p.error) {
          clearInterval(interval);
          useAnalysisStore.getState().markError(analysis.id, p.error);
        }
      } catch {
        // Poller error — retry on next interval
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isHydrated, analysis?.id, analysis?.status])

  if (!isHydrated) {
    return (
      <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">← Analyses</span>
        </div>
        <div className="flex items-center justify-center py-32">
          <p className="text-base text-muted-foreground">Loading analysis...</p>
        </div>
      </div>
    )
  }

  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <XCircleIcon className="h-12 w-12 text-muted-foreground mb-4" />
        <h2 className="text-lg font-semibold tracking-tight mb-2">Analysis not found</h2>
        <p className="text-base text-muted-foreground mb-6">This analysis may have been removed or never existed.</p>
        <button
          onClick={() => router.push('/dashboard/analyses')}
          className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Back to Analyses
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push('/dashboard/analyses')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Analyses
        </button>
      </div>

      {/* Title area */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/40 pb-6">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <InlineRenamable
              value={analysis.name}
              onRename={(name) => updateAnalysis(analysis.id, { name })}
              className="text-2xl font-semibold tracking-tight flex-1"
            />
            <StatusBadge status={analysis.status} />
          </div>
          <p className="text-sm text-muted-foreground">
            {analysis.url} · {analysis.personaCount} personas
            {analysis.batchName && ` · Batch: ${analysis.batchName}`}
            {analysis.createdAt && (
              <>
                {' · Started '}
                <span className="font-mono tabular-nums">{new Date(analysis.createdAt).toLocaleString()}</span>
              </>
            )}
          </p>
          {analysis.error && (
            <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md mt-2">{analysis.error}</p>
          )}
        </div>

        {analysis.status === 'COMPLETED' && (
          <div className="flex items-center gap-3 self-start lg:self-auto">
            <button
              onClick={handleExportPdf}
              disabled={isExporting}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-secondary px-4 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed border border-border/60 shadow-xs"
            >
              {isExporting ? (
                <Loader2Icon className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <DownloadIcon className="h-3.5 w-3.5" />
              )}
              {isExporting ? 'Generating PDF...' : 'Download PDF Report'}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {analysis.status === 'IN_PROGRESS' ? (
        <InProgressView analysis={analysis} />
      ) : analysis.status === 'COMPLETED' ? (
        <CompletedView analysis={analysis} onRemove={() => removeAnalysis(id)} />
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-muted-foreground">Analysis was {analysis.status.toLowerCase()}.</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Run New Analysis
          </button>
          {analysis.status === 'ERROR' && (
            <FeedbackButton
              label="Report this error"
              defaultMessage={analysis.error ?? ''}
              context={{ error: analysis.error, runId: analysis.id }}
              variant="outline"
              className="mt-3"
            />
          )}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; class: string; icon: typeof ClockIcon }> = {
    IN_PROGRESS: { label: 'In Progress', class: 'text-blue-500 bg-blue-500/10 border-blue-500/20', icon: ClockIcon },
    COMPLETED: { label: 'Completed', class: 'text-green-500 bg-green-500/10 border-green-500/20', icon: CheckCircleIcon },
    ERROR: { label: 'Error', class: 'text-destructive bg-destructive/10 border-destructive/20', icon: XCircleIcon },
    CANCELLED: { label: 'Cancelled', class: 'text-muted-foreground bg-muted/30 border-muted/40', icon: XCircleIcon },
  }
  const c = config[status] || config.CANCELLED
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${c.class}`}>
      <Icon className="h-3.5 w-3.5" />
      {c.label}
      {status === 'IN_PROGRESS' && <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />}
    </span>
  )
}

function InProgressView({ analysis }: { analysis: ArtifactAnalysis }) {
  const currentStep = getCurrentStep(analysis.currentStep)
  const total = analysis.totalResponses ?? analysis.personaCount
  const completed = analysis.completedResponses ?? 0
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0

  const statusText =
    analysis.currentStep === 'INTAKE'
      ? 'Loading the artifact'
      : analysis.currentStep === 'ANALYZING'
        ? 'Simulating persona responses'
        : 'Initializing'

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Run progress</CardTitle>
          <CardDescription>{statusText}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <StepIndicator steps={ANALYSIS_STEPS} currentStep={currentStep} />
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="micro-label text-muted-foreground">
                Responses
              </span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {completed}/{total}
              </span>
            </div>
            <Progress value={percent} className="h-1.5" />
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b">
          <CardTitle>Agent view</CardTitle>
          <CardDescription>What the simulated user sees right now</CardDescription>
        </CardHeader>
        <CardContent>
          {analysis.screenshot ? (
            <div className="overflow-hidden rounded-md border border-border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:image/jpeg;base64,${analysis.screenshot}`}
                alt="Live agent view"
                className="aspect-video w-full object-cover object-top"
              />
            </div>
          ) : (
            <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/20">
              <span className="text-base text-muted-foreground">Waiting for the first capture…</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PersonaIdentityCard({ profile }: { profile: PersonaProfile }) {
  const valueGroups: { label: string; items: string[] }[] = [
    { label: 'Values', items: profile.values },
    { label: 'Fears', items: profile.fears },
  ]

  return (
    <div className="flex flex-col gap-4">
      {valueGroups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <span className="micro-label text-muted-foreground/70">
              {group.label}
            </span>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm leading-snug text-foreground/80">
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/70" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}

      <div className="flex flex-col gap-2">
        <span className="micro-label text-muted-foreground/70">
          Communication
        </span>
        <span className="text-sm leading-relaxed text-foreground/80">{profile.communicationStyle}</span>
      </div>

      <div className="flex flex-col gap-2">
        <span className="micro-label text-muted-foreground/70">
          Decision style
        </span>
        <span className="text-sm leading-relaxed text-foreground/80">{profile.decisionStyle}</span>
      </div>
    </div>
  )
}

function parseStructuredThoughts(thoughts: string): {
  good: string | null;
  bad: string | null;
  dealbreaker: string | null;
  remaining: string;
} {
  const parts = {
    good: null as string | null,
    bad: null as string | null,
    dealbreaker: null as string | null,
    remaining: thoughts,
  };

  const goodMatch = thoughts.match(/\[The Good\]([\s\S]*?)(?=\[The Bad\]|\[The Dealbreaker\]|$)/);
  const badMatch = thoughts.match(/\[The Bad\]([\s\S]*?)(?=\[The Good\]|\[The Dealbreaker\]|$)/);
  const dealbreakerMatch = thoughts.match(/\[The Dealbreaker\]([\s\S]*?)(?=\[The Good\]|\[The Bad\]|$)/);

  if (goodMatch) {
    parts.good = goodMatch[1].trim();
    parts.remaining = parts.remaining.replace(goodMatch[0], '').trim();
  }
  if (badMatch) {
    parts.bad = badMatch[1].trim();
    parts.remaining = parts.remaining.replace(badMatch[0], '').trim();
  }
  if (dealbreakerMatch) {
    parts.dealbreaker = dealbreakerMatch[1].trim();
    parts.remaining = parts.remaining.replace(dealbreakerMatch[0], '').trim();
  }

  parts.remaining = parts.remaining.replace(/\[The Good\]|\[The Bad\]|\[The Dealbreaker\]/g, '').trim();

  return parts;
}

function CompletedView({
  analysis,
  onRemove,
}: {
  analysis: ArtifactAnalysis
  onRemove: () => void
}) {
  const analyses = analysis.responses as PersonaResponse[] | undefined
  const [expandedPersonas, setExpandedPersonas] = useState<Set<number>>(new Set())
  const [chatTarget, setChatTarget] = useState<{ persona: Persona; analysis: PersonaResponse } | null>(null)
  const [isPanelChatOpen, setIsPanelChatOpen] = useState(false)
  // Think-aloud drawer state: which persona's transcript is open, and which
  // citation quote (if any) to scroll to and mark.
  const [transcriptTarget, setTranscriptTarget] = useState<{
    personaName: string
    transcript: string
    highlight?: string
  } | null>(null)
  const batches = usePersonaStore((s) => s.batches)

  const synthesis = useMemo(
    () => {
      if (analysis.synthesis) return analysis.synthesis
      if (!analyses) return null
      // Legacy analyses saved without a synthesis: counts-only placeholder
      return fallbackSynthesis(analyses)
    },
    [analyses, analysis.synthesis]
  )

  // Resolve each response back to a full Persona once — chat needs the
  // psychometrics/backstory, not just the display projection.
  const resolvedPersonas = useMemo(
    () => (analyses ?? []).map((a) => resolveChatPersona(a, batches, analysis?.batchId)),
    [analyses, batches, analysis?.batchId]
  )

  const togglePersona = (index: number) => {
    setExpandedPersonas(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  if (!analyses || analyses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground">No analysis data available for this analysis.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      {/* What Kynd is, then the one qualification the findings need — both
          before the reader forms an expectation of the numbers below. */}
      <div className="flex flex-col gap-1.5">
        <p className="max-w-[70ch] text-base leading-relaxed text-foreground/80">{REPORT_INTRO}</p>
        <p className="max-w-[70ch] text-base leading-relaxed text-muted-foreground">{REPORT_DISCLAIMER}</p>
      </div>

      {/* ── Executive Synthesis ─────────────────────────────── */}
      {synthesis && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              <span className="font-mono tabular-nums text-foreground/80">{synthesis.completedCount}</span> of{' '}
              <span className="font-mono tabular-nums text-foreground/80">{synthesis.totalPersonaCount}</span> personas completed
              {synthesis.failedCount > 0 && (
                <span className="text-destructive"> · {synthesis.failedCount} failed</span>
              )}
            </p>
            <button
              onClick={() => setIsPanelChatOpen(true)}
              className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <UsersIcon className="h-3.5 w-3.5" />
              Ask the whole audience
            </button>
          </div>

          {synthesis.researchQuestionAnswer && (
            /*
              The panel shrinks to the answer rather than the answer filling the
              panel. Capping only the paragraph left the panel full width with
              the text in half of it.

              The cap stays on the paragraph: `ch` resolves against the
              element's own font, so the paragraph is the only node that
              measures the answer's own 70ch limit (DESIGN.md → Typography:
              report body text is capped at 70ch).
            */
            <div className="w-fit rounded-lg border border-primary/10 bg-primary/5 p-5">
              <span className="micro-label mb-2 block text-primary">The answer</span>
              <p className="max-w-[70ch] text-base leading-relaxed text-foreground/90">{synthesis.researchQuestionAnswer}</p>
            </div>
          )}

          {synthesis.topFindings.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className={SECTION_LABEL}>Top findings</h3>
              {synthesis.topFindings.slice(0, 5).map((finding, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-snug text-foreground">{finding.observation}</p>
                    <span className="micro-label shrink-0 text-muted-foreground">
                      {finding.confidence}
                    </span>
                  </div>
                  <p className="max-w-[70ch] text-base leading-relaxed text-muted-foreground">{finding.impact}</p>
                  <details className="group/f">
                    <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <ChevronRightIcon className="h-3 w-3 transition-transform group-open/f:rotate-90" />
                      Evidence and citations
                    </summary>
                    <div className="mt-2 flex flex-col gap-2">
                      <p className="max-w-[70ch] rounded bg-muted/40 px-2.5 py-2 text-base italic leading-relaxed text-muted-foreground">
                        {finding.evidence}
                      </p>
                      {citationsOf(finding).length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <CitationTooltip
                            citations={citationsOf(finding)}
                            onOpenTranscript={(citation) => {
                              const response = analyses?.find(
                                (a) => a.personaProfile?.name === citation.personaName || a.personaId === citation.personaId
                              )
                              if (!response) return
                              setTranscriptTarget({
                                personaName: citation.personaName,
                                transcript: response.rawAnalysis,
                                highlight: citation.quote,
                              })
                            }}
                            getPersonaRole={(citation) => {
                              const response = analyses?.find(
                                (a) => a.personaProfile?.name === citation.personaName || a.personaId === citation.personaId
                              )
                              return response?.personaProfile?.occupation
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </details>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <UsersIcon className="h-3 w-3" />
                    <span>Simulated in <span className="font-mono tabular-nums">{finding.affectedPersonaCount}/{finding.totalPersonaCount}</span> personas</span>
                  </div>
                </div>
              ))}
            </section>
          )}

          {synthesis.disagreements.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className={SECTION_LABEL}>Where personas split</h3>
              {synthesis.disagreements.map((d, i) => {
                const total = d.split.reduce((sum, s) => sum + s.personaCount, 0) || 1
                return (
                  <div key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
                    <p className="text-sm font-medium text-foreground">{d.topic}</p>
                    <div className="flex flex-col gap-3">
                      {d.split.map((side, j) => (
                        <div key={j} className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="text-foreground/80">{side.view}</span>
                            <span className="shrink-0 text-xs font-mono tabular-nums text-muted-foreground">
                              {side.personaCount} {side.personaCount === 1 ? 'persona' : 'personas'}
                            </span>
                          </div>
                          <div className="h-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${Math.round((side.personaCount / total) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>
          )}

          {synthesis.biggestFrictions.length > 0 && (
            <section className="flex flex-col gap-3">
              <h3 className={SECTION_LABEL}>Biggest friction points</h3>
              <ul className="flex flex-col gap-2">
                {synthesis.biggestFrictions.slice(0, 3).map((f, i) => (
                  <li key={i} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning-foreground/10 font-mono text-xs tabular-nums text-warning-foreground">
                      {i + 1}
                    </span>
                    <span className="text-sm leading-relaxed text-foreground/80">{f}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {/* ── Per-Persona Drill-Down ──────────────────────────── */}
      <div className="border-t border-border/40 pt-6">
        <h3 className={cn(SECTION_LABEL, 'mb-4')}>
          Individual persona reports
        </h3>
        <div className="grid gap-3">
          {analyses.map((analysis, index) => {
            const personaName = analysis.personaProfile?.name ?? `Persona ${index + 1}`
            const isExpanded = expandedPersonas.has(index)
            const chatPersona = resolvedPersonas[index]
            const verdict =
              analysis.customerJourney && analysis.customerJourney.length > 0
                ? journeyVerdict(analysis.customerJourney)
                : null

            return (
            <div
              key={analysis.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <button
                onClick={() => togglePersona(index)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="flex flex-col gap-0.5">
                  <h4 className="text-base font-semibold">{personaName}</h4>
                  {analysis.personaProfile && (
                    <p className="text-sm text-muted-foreground">
                      {analysis.personaProfile.occupation} · {analysis.personaProfile.communicationStyle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {verdict && (
                    <span
                      className={cn('hidden text-xs font-medium sm:inline', verdict.className)}
                      title={verdict.title}
                    >
                      {verdict.label}
                    </span>
                  )}
                  {isExpanded ? <ChevronDownIcon className="h-4 w-4 text-muted-foreground" /> : <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="flex flex-col gap-5 border-t border-border/40 px-4 pb-5 pt-4">
                  <div className="flex flex-wrap gap-2">
                    {chatPersona && (
                      <button
                        onClick={() => setChatTarget({ persona: chatPersona, analysis })}
                        className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                      >
                        <MessageCircleIcon className="h-3.5 w-3.5" />
                        Ask {personaName} about what they saw
                      </button>
                    )}
                    {analysis.rawAnalysis && (
                      <button
                        onClick={() =>
                          setTranscriptTarget({ personaName, transcript: analysis.rawAnalysis })
                        }
                        className="inline-flex h-9 w-fit items-center justify-center gap-2 rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
                      >
                        <FileTextIcon className="h-3.5 w-3.5" />
                        Raw think-aloud
                      </button>
                    )}
                  </div>

                  {analysis.overview && (
                    <div className="flex flex-col gap-2">
                      <span className={SECTION_LABEL}>In short</span>
                      <p className="max-w-[70ch] text-base leading-relaxed text-foreground/90">
                        {analysis.overview}
                      </p>
                    </div>
                  )}

                  {analysis.customerJourney?.length > 0 && (
                    <div className="flex flex-col gap-3">
                      <span className={SECTION_LABEL}>Journey</span>
                      <JourneyPath journey={analysis.customerJourney} />
                    </div>
                  )}

                  {analysis.researchQuestionAnswer && (
                    <div className="rounded-lg border border-primary/10 bg-primary/5 p-3">
                      <span className="micro-label mb-1 block text-primary">
                        Their answer
                      </span>
                      <p className="max-w-[70ch] text-base leading-relaxed text-foreground/80">
                        {analysis.researchQuestionAnswer}
                      </p>
                    </div>
                  )}

                  {analysis.majorFindings.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className={SECTION_LABEL}>Findings</span>
                      {analysis.majorFindings.map((finding: MajorFinding, i: number) => (
                        <div key={i} className="flex flex-col gap-1.5 rounded-lg border border-border bg-card/50 p-3">
                          <p className="text-sm font-medium leading-snug text-foreground">{finding.observation}</p>
                          <p className="text-base leading-relaxed text-muted-foreground">
                            <span className="font-medium text-foreground/70">Impact:</span> {finding.impact}
                          </p>
                          {finding.evidence && (
                            <details className="group/ev">
                              <summary className="flex w-fit cursor-pointer list-none items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                                <ChevronRightIcon className="h-3 w-3 transition-transform group-open/ev:rotate-90" />
                                Evidence
                              </summary>
                              <p className="mt-1.5 rounded bg-muted/40 px-2 py-1.5 text-base italic leading-relaxed text-muted-foreground">
                                {finding.evidence}
                              </p>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(analysis.pointsOfFriction.length > 0 || analysis.unansweredQuestions.length > 0) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {analysis.pointsOfFriction.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className={SECTION_LABEL}>Friction</span>
                          <ul className="flex flex-col gap-1.5">
                            {analysis.pointsOfFriction.map((f: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-sm leading-snug text-foreground/80">
                                <AlertTriangleIcon className="mt-0.5 h-3 w-3 shrink-0 text-warning-foreground" />
                                {f}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {analysis.unansweredQuestions.length > 0 && (
                        <div className="flex flex-col gap-2">
                          <span className={SECTION_LABEL}>Still unanswered</span>
                          <ul className="flex flex-col gap-1.5">
                            {analysis.unansweredQuestions.map((q: string, i: number) => (
                              <li key={i} className="flex items-start gap-2 text-sm leading-snug text-foreground/80">
                                <HelpCircleIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                                {q}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {analysis.personaProfile && (
                    <details className="group rounded-lg border border-border bg-muted/20">
                      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                        Profile and psychographics
                        <ChevronDownIcon className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                      </summary>
                      <div className="px-3 pb-3 pt-1">
                        <PersonaIdentityCard profile={analysis.personaProfile} />
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>

      {analysis.screenshot && (
        <div className="rounded-lg overflow-hidden border border-border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:image/jpeg;base64,${analysis.screenshot}`}
            alt="Captured page"
            className="w-full"
          />
        </div>
      )}

      {chatTarget && (
        <PersonaChat
          persona={chatTarget.persona}
          analysis={chatTarget.analysis}
          isOpen={!!chatTarget}
          onClose={() => setChatTarget(null)}
        />
      )}

      <RawThinkAloudSheet
        open={!!transcriptTarget}
        onOpenChange={(open) => {
          if (!open) setTranscriptTarget(null)
        }}
        personaName={transcriptTarget?.personaName ?? ''}
        transcript={transcriptTarget?.transcript ?? ''}
        highlight={transcriptTarget?.highlight}
      />

      <PanelChat
        responses={analyses}
        synthesis={synthesis}
        personaNames={analysis.personaNames ?? []}
        isOpen={isPanelChatOpen}
        onClose={() => setIsPanelChatOpen(false)}
      />
    </div>
  )
}
