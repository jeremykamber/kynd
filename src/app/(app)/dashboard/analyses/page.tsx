'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useAnalysisStore } from '@/ui/stores/analysisStore'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ClockIcon, GlobeIcon, UsersIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon, PlusIcon, UploadIcon, ImageIcon, LinkIcon, TargetIcon, HelpCircleIcon, FlaskConicalIcon, FileTextIcon } from 'lucide-react'
import { Persona } from '@/domain/entities/Persona'
import { analysisInputKind, analysisSourceLabel } from '@/domain/entities/ArtifactAnalysis'
import type { ArtifactAnalysis } from '@/domain/entities/ArtifactAnalysis'
import type { ArtifactInput } from '@/domain/entities/ArtifactInput'
import {
  ACCEPTED_DOCUMENT_ACCEPT_ATTR,
  ACCEPTED_DOCUMENT_HINT,
  ACCEPTED_IMAGE_ACCEPT_ATTR,
  ACCEPTED_IMAGE_HINT,
  ACCEPTED_IMAGE_TYPES,
  MAX_DOCUMENTS,
  MAX_TEXT_CHARS,
  PASTED_TEXT_LABEL,
  formatCharacterCount,
  validateDocumentSelection,
  validateImageFile,
  validateTextLength,
} from '@/domain/entities/ArtifactIntakeLimits'
import type { ExtractedArtifactText } from '@/infrastructure/adapters/ArtifactTextExtractor'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InlineRenamable } from '@/components/custom/InlineRenamable'
import { DESTRUCTIVE_CARD_CONTROL_CLASS } from '@/lib/utils'

function AnalysisCard({ analysis }: { analysis: ArtifactAnalysis }) {
  const router = useRouter()
  const removeAnalysis = useAnalysisStore((s) => s.removeAnalysis)
  const updateAnalysis = useAnalysisStore((s) => s.updateAnalysis)

  const statusConfig = {
    IN_PROGRESS: { label: 'In Progress', icon: ClockIcon, class: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    COMPLETED: { label: 'Completed', icon: CheckCircleIcon, class: 'text-green-500 bg-green-500/10 border-green-500/20' },
    ERROR: { label: 'Error', icon: XCircleIcon, class: 'text-destructive bg-destructive/10 border-destructive/20' },
    CANCELLED: { label: 'Cancelled', icon: AlertCircleIcon, class: 'text-muted-foreground bg-muted/30 border-muted/40' },
  }[analysis.status]

  const StatusIcon = statusConfig.icon
  const sourceKind = analysisInputKind(analysis)
  const sourceLabel = analysisSourceLabel(analysis)
  const SourceIcon = sourceKind === 'url' ? GlobeIcon : sourceKind === 'screenshot' ? ImageIcon : FileTextIcon
  const sourceText = sourceKind === 'url' ? analysis.url : sourceLabel ?? ''

  return (
    <div className="relative group">
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/dashboard/analyses/${analysis.id}`)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            router.push(`/dashboard/analyses/${analysis.id}`)
          }
        }}
        className="w-full text-left rounded-lg border border-border bg-card p-6 transition-all hover:border-border/80 hover:shadow-sm cursor-pointer"
      >
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center gap-3">
            <InlineRenamable
              value={analysis.name}
              onRename={(name) => updateAnalysis(analysis.id, { name })}
              className="min-w-0 flex-1 text-base font-semibold"
            />
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.class}`}>
              <StatusIcon className="h-3 w-3" />
              {statusConfig.label}
              {analysis.status === 'IN_PROGRESS' && (
                <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
              )}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-mono tabular-nums text-muted-foreground">
            <span className="flex items-center gap-1 min-w-0">
              <SourceIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{sourceText}</span>
            </span>
            <span className="flex items-center gap-1">
              <UsersIcon className="h-3 w-3" />
              {analysis.personaCount} personas
            </span>
            {analysis.batchName && (
              <span>Batch: {analysis.batchName}</span>
            )}
            <span className="ml-auto flex items-center gap-1 whitespace-nowrap text-muted-foreground/70">
              <ClockIcon className="h-3 w-3 shrink-0" />
              {new Date(analysis.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
              {analysis.completedAt && analysis.status !== 'IN_PROGRESS' && (
                <>
                  <span className="text-muted-foreground/30">·</span>
                  {new Date(analysis.completedAt).toLocaleDateString(undefined, {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </>
              )}
            </span>
          </div>
        </div>
        {analysis.status === 'IN_PROGRESS' && analysis.totalResponses && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{analysis.completedResponses ?? 0}/{analysis.totalResponses} analyses</span>
              <span className="font-mono tabular-nums font-medium">{Math.round(((analysis.completedResponses ?? 0) / analysis.totalResponses) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((analysis.completedResponses ?? 0) / analysis.totalResponses) * 100}%` }}
              />
            </div>
          </div>
        )}
        {analysis.error && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">{analysis.error}</p>
        )}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeAnalysis(analysis.id)
        }}
        className={DESTRUCTIVE_CARD_CONTROL_CLASS}
        aria-label="Delete analysis"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

/** One-click smoke-test preset: verified URL + coherent goal/question. */
export const TEST_ANALYSIS_PRESET = {
  url: 'https://jobright.ai',
  businessGoal: 'Convince hiring managers and small business owners to sign up for the free AI recruiting assistant.',
  researchQuestion: 'Why doesn\'t the user get the free version?',
} as const

function NewAnalysisForm({
  onRun,
}: {
  onRun: (
    input: ArtifactInput,
    personas: Persona[],
    businessGoal?: string,
    researchQuestion?: string,
    batchId?: string,
  ) => void
}) {
  const batches = usePersonaStore((s) => s.batches)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [inputMode, setInputMode] = useState<'url' | 'upload' | 'text'>('url')
  const [businessGoal, setBusinessGoal] = useState('')
  const [researchQuestion, setResearchQuestion] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // Sync selected batch when batches hydrate or change
  useEffect(() => {
    if (batches.length > 0 && !batches.find((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(batches[0].id) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [batches, selectedBatchId])
  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  // URL
  const [url, setUrl] = useState('')

  // Upload — one image, or up to five documents whose text is extracted here.
  // The two kinds are mutually exclusive, so selecting one clears the other.
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [documents, setDocuments] = useState<File[]>([])
  const [documentText, setDocumentText] = useState<ExtractedArtifactText | null>(null)
  const [isExtracting, setIsExtracting] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  // Text
  const [pastedText, setPastedText] = useState('')

  const clearImage = useCallback(() => {
    setImageFile(null)
    setImagePreview(null)
    setImageBase64(null)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }, [])

  const selectImage = useCallback((file: File) => {
    const problem = validateImageFile(file)
    if (problem) {
      setValidationError(problem)
      return
    }
    setValidationError(null)
    setDocuments([])
    setDocumentText(null)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
    setImageBase64(null)

    const reader = new FileReader()
    reader.onload = () => setImageBase64(reader.result as string)
    reader.onerror = () => setValidationError('Failed to read file. Please try again.')
    reader.readAsDataURL(file)
  }, [])

  /**
   * Validates the new selection, then extracts it. Extraction runs in the
   * browser so no document bytes ever reach the server action; the module is
   * imported on first use so a URL or screenshot run never downloads a parser.
   */
  const applyDocuments = useCallback(async (next: File[]) => {
    const problem = validateDocumentSelection(next)
    if (problem) {
      setValidationError(problem)
      return
    }

    setValidationError(null)
    clearImage()
    setIsExtracting(true)
    try {
      const { extractArtifactText } = await import('@/infrastructure/adapters/ArtifactTextExtractor')
      const extracted = await extractArtifactText(next)
      setDocuments(next)
      setDocumentText(extracted)
    } catch (err) {
      setValidationError((err as Error).message)
    } finally {
      setIsExtracting(false)
    }
  }, [clearImage])

  const addDocuments = useCallback((files: File[]) => {
    if (files.length === 0) return
    void applyDocuments([...documents, ...files])
  }, [applyDocuments, documents])

  const removeDocument = useCallback((name: string) => {
    const next = documents.filter((file) => file.name !== name)
    if (next.length === 0) {
      setDocuments([])
      setDocumentText(null)
      setValidationError(null)
      return
    }
    void applyDocuments(next)
  }, [applyDocuments, documents])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) selectImage(file)
  }, [selectImage])

  const handleDocumentInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    addDocuments(Array.from(e.target.files ?? []))
    // Reset so picking the same file again still fires a change.
    e.target.value = ''
  }, [addDocuments])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length === 0) return
    if (files.length > 1 || documents.length > 0 || !(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(files[0].type)) {
      addDocuments(files)
      return
    }
    selectImage(files[0])
  }, [addDocuments, documents.length, selectImage])

  // Fills the form from the preset, then runs it when a batch is available;
  // without a batch the prefill still lands and the user submits manually.
  const prefillTestAnalysis = () => {
    setUrl(TEST_ANALYSIS_PRESET.url)
    setBusinessGoal(TEST_ANALYSIS_PRESET.businessGoal)
    setResearchQuestion(TEST_ANALYSIS_PRESET.researchQuestion)
    setInputMode('url')
    const batch = batches.find((b) => b.id === selectedBatchId) ?? batches[0]
    if (batch) {
      setSelectedBatchId(batch.id)
      onRun({ type: 'url', url: TEST_ANALYSIS_PRESET.url }, batch.personas, TEST_ANALYSIS_PRESET.businessGoal, TEST_ANALYSIS_PRESET.researchQuestion, batch.id)
    }
  }

  const pastedLength = pastedText.length
  const pastedTextProblem = validateTextLength(pastedLength)

  const runInput: ArtifactInput | null = inputMode === 'url'
    ? (url.trim() ? { type: 'url', url: url.trim() } : null)
    : inputMode === 'upload'
      ? (imageBase64
        ? { type: 'screenshot', imageBase64 }
        : documentText
          ? { type: 'text', text: documentText.text, label: documentText.label, files: documentText.files.map((f) => f.name) }
          : null)
      : pastedText.trim() && !pastedTextProblem
        ? { type: 'text', text: pastedText, label: PASTED_TEXT_LABEL }
        : null

  const handleSubmit = () => {
    if (!selectedBatch || !runInput) return
    onRun(runInput, selectedBatch.personas, businessGoal, researchQuestion, selectedBatchId)
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 text-base leading-relaxed text-muted-foreground">
          <p>Create a persona batch first, then come back to run an analysis.</p>
          <Button asChild variant="default" size="sm" className="w-fit">
            <Link href="/dashboard">Go to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2 flex-1">
            <label htmlFor="batch-select" className="text-sm font-medium">Persona Batch</label>
            <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
              <SelectTrigger id="batch-select">
                <SelectValue placeholder="Select a batch" />
              </SelectTrigger>
              <SelectContent>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.label} — {batch.personas.length} personas
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-7 shrink-0"
            onClick={prefillTestAnalysis}
            title={`Prefills ${TEST_ANALYSIS_PRESET.url} with a matching goal and research question, then starts the run`}
          >
            <FlaskConicalIcon data-icon="inline-start" />
            Run test analysis
          </Button>
        </div>

        <Tabs value={inputMode} onValueChange={(value) => setInputMode(value as 'url' | 'upload' | 'text')}>
          <TabsList className="gap-1 rounded-lg bg-muted p-1">
            <TabsTrigger value="url" className="flex-1">
              <LinkIcon className="h-3.5 w-3.5" />
              URL
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex-1">
              <UploadIcon className="h-3.5 w-3.5" />
              Upload
            </TabsTrigger>
            <TabsTrigger value="text" className="flex-1">
              <FileTextIcon className="h-3.5 w-3.5" />
              Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url" className="flex flex-col gap-2">
            <label htmlFor="artifact-url" className="text-sm font-medium">Artifact URL</label>
            <Input
              id="artifact-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </TabsContent>

          <TabsContent value="upload" className="flex flex-col gap-3">
            <span className="text-sm font-medium">Artifact Upload</span>

            {imageFile ? (
              <div className="flex items-center gap-3 rounded-lg border p-3">
                {imagePreview && (
                  <img
                    src={imagePreview}
                    alt="Screenshot preview"
                    className="h-14 w-14 rounded object-cover"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{imageFile.name}</p>
                  <p className="text-xs font-mono tabular-nums text-muted-foreground">
                    {(imageFile.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => { clearImage(); setValidationError(null) }}
                  className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                  aria-label="Remove screenshot"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => (documents.length > 0 || documentText ? documentInputRef.current?.click() : imageInputRef.current?.click())}
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false) }}
                onDrop={handleDrop}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-base text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground cursor-pointer ${
                  isDragOver ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <UploadIcon className="h-6 w-6" />
                Drop a file or click to browse
                <span className="text-xs text-muted-foreground/70">
                  One image ({ACCEPTED_IMAGE_HINT}) or up to {MAX_DOCUMENTS} documents ({ACCEPTED_DOCUMENT_HINT})
                </span>
              </button>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => imageInputRef.current?.click()}>
                <ImageIcon data-icon="inline-start" />
                Choose image
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => documentInputRef.current?.click()}>
                <FileTextIcon data-icon="inline-start" />
                Add documents
              </Button>
              <span className="text-xs text-muted-foreground">
                Images and documents cannot be combined in one run.
              </span>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_ACCEPT_ATTR}
              onChange={handleFileInput}
              className="hidden"
            />
            <input
              ref={documentInputRef}
              type="file"
              multiple
              accept={ACCEPTED_DOCUMENT_ACCEPT_ATTR}
              onChange={handleDocumentInput}
              className="hidden"
            />

            {documents.length > 0 && (
              <div className="flex flex-col gap-2">
                <ul className="flex flex-col gap-2">
                  {documents.map((file) => (
                    <li key={file.name} className="flex items-center gap-3 rounded-lg border p-3">
                      <FileTextIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs font-mono tabular-nums text-muted-foreground">
                          {(file.size / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDocument(file.name)}
                        className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label={`Remove ${file.name}`}
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <p className="text-xs font-mono tabular-nums text-muted-foreground">
                  {isExtracting
                    ? 'Extracting text…'
                    : `${documents.length} of ${MAX_DOCUMENTS} documents · ${formatCharacterCount(documentText?.text.length ?? 0)} characters`}
                </p>
              </div>
            )}

            {validationError && (
              <p className="text-xs text-destructive" role="alert">{validationError}</p>
            )}
          </TabsContent>

          <TabsContent value="text" className="flex flex-col gap-2">
            <label htmlFor="artifact-text" className="text-sm font-medium">Artifact Text</label>
            <Textarea
              id="artifact-text"
              placeholder="Paste a feature brief, feature list, landing-page copy, YouTube script, or pitch-deck text…"
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              className="min-h-40 text-sm"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {formatCharacterCount(pastedLength)} / {formatCharacterCount(MAX_TEXT_CHARS)} characters
              </span>
              {pastedTextProblem && (
                <span className="text-xs text-destructive" role="alert">{pastedTextProblem}</span>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col gap-2">
          <label htmlFor="business-goal" className="text-sm font-medium flex items-center gap-1.5">
            <TargetIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Business Goal
          </label>
          <Textarea
            id="business-goal"
            placeholder="What is this artifact trying to accomplish? e.g. Convince visitors to book a demo, explain product value, encourage signup"
            value={businessGoal}
            onChange={(e) => setBusinessGoal(e.target.value)}
            className="min-h-15 text-sm"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="research-question" className="text-sm font-medium flex items-center gap-1.5">
            <HelpCircleIcon className="h-3.5 w-3.5 text-muted-foreground" />
            Research Question
          </label>
          <Textarea
            id="research-question"
            placeholder="What do you want to learn? e.g. Why would users leave? What creates trust? How would enterprise buyers react?"
            value={researchQuestion}
            onChange={(e) => setResearchQuestion(e.target.value)}
            className="min-h-15 text-sm"
          />
        </div>

        <Button
          disabled={!selectedBatch || !runInput || isExtracting}
          onClick={handleSubmit}
        >
          {isExtracting ? 'Extracting text…' : 'Run Analysis'}
        </Button>
      </CardContent>
    </Card>
  )
}

/**
 * /dashboard/analyses: the analysis list (in-progress first, then finished) plus
 * the inline "Run New Analysis" form. Analysis records come from the client
 * analysis store; starting a run is delegated to useAnalysisFlow.
 *
 * The form's open state lives in the URL (`?new=1`) so the global floating CTA
 * can open it from any route, including this one.
 */
function AnalysesPageContent() {
  const analyses = useAnalysisStore((s) => s.analyses)
  const analysisFlow = useAnalysisFlow()
  const router = useRouter()
  const searchParams = useSearchParams()
  const showNewForm = searchParams.get('new') === '1'

  const setShowNewForm = useCallback((open: boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    if (open) params.set('new', '1')
    else params.delete('new')
    const query = params.toString()
    router.replace(query ? `/dashboard/analyses?${query}` : '/dashboard/analyses', { scroll: false })
  }, [router, searchParams])

  const inProgress = analyses.filter((s) => s.status === 'IN_PROGRESS')
  const completed = analyses.filter((s) => s.status === 'COMPLETED')
  const failed = analyses.filter((s) => s.status === 'ERROR' || s.status === 'CANCELLED')

  const handleRunAnalysis = (
    input: ArtifactInput,
    personas: Persona[],
    businessGoal?: string,
    researchQuestion?: string,
    batchId?: string,
  ) => {
    analysisFlow.setArtifactSource(input)
    if (businessGoal) analysisFlow.setBusinessGoal(businessGoal)
    if (researchQuestion) analysisFlow.setResearchQuestion(researchQuestion)
    analysisFlow.handleAnalyzeArtifact(personas, input, businessGoal, researchQuestion, batchId)
    setShowNewForm(false)
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">Analyses</h1>
          {analyses.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {`${completed.length} completed${failed.length > 0 ? ` · ${failed.length} failed` : ''} · ${inProgress.length} in progress`}
            </p>
          )}
        </div>
        <Button
          onClick={() => setShowNewForm(!showNewForm)}
          size="sm"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Run New Analysis
        </Button>
      </div>

      {showNewForm && (
        <NewAnalysisForm onRun={handleRunAnalysis} />
      )}

      {analysisFlow.isPending && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-base text-blue-600 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Analysis is running…
          <Link
            href="/dashboard/analyses"
            className="ml-auto text-sm font-medium text-blue-600 hover:underline"
          >
            Refresh
          </Link>
        </div>
      )}

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="micro-label text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </h2>
          <div className="flex flex-col gap-4">
            {inProgress.map((sim) => (
              <AnalysisCard key={sim.id} analysis={sim} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="micro-label text-muted-foreground">
            Completed
          </h2>
          <div className="flex flex-col gap-4">
            {completed.map((sim) => (
              <AnalysisCard key={sim.id} analysis={sim} />
            ))}
          </div>
        </section>
      )}

      {failed.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="micro-label text-muted-foreground">
            Failed
          </h2>
          <div className="flex flex-col gap-4">
            {failed.map((sim) => (
              <AnalysisCard key={sim.id} analysis={sim} />
            ))}
          </div>
        </section>
      )}

      {analyses.length === 0 && !showNewForm && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <ClockIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base leading-relaxed text-muted-foreground max-w-sm">
            No analyses yet. Click "Run New Analysis" above to get started.
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * `useSearchParams` makes this client subtree render after hydration during
 * prerendering, so it must sit under a Suspense boundary — see Next's
 * useSearchParams docs. The fallback mirrors loading.tsx's header skeleton.
 */
function AnalysesPageFallback() {
  return (
    <div className="flex flex-col gap-8 w-full h-full">
      <div className="flex flex-col gap-2">
        <div className="h-9 w-40 rounded bg-muted animate-pulse" />
        <div className="h-5 w-52 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}

export default function AnalysesPage() {
  return (
    <Suspense fallback={<AnalysesPageFallback />}>
      <AnalysesPageContent />
    </Suspense>
  )
}
