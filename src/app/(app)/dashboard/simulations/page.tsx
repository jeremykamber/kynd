'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useSimulationStore } from '@/ui/stores/simulationStore'
import { usePersonaStore } from '@/ui/stores/personaStore'
import { useAnalysisFlow } from '@/ui/hooks/useAnalysisFlow'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClockIcon, GlobeIcon, UsersIcon, CheckCircleIcon, XCircleIcon, AlertCircleIcon, XIcon, PlusIcon, UploadIcon, ImageIcon, LinkIcon } from 'lucide-react'
import { computeRunAverages } from '@/ui/dashboard/utils/computeBenchmarks'
import { Persona } from '@/domain/entities/Persona'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

function SimulationCard({ simulation }: { simulation: import('@/domain/entities/Simulation').Simulation }) {
  const router = useRouter()
  const removeSimulation = useSimulationStore((s) => s.removeSimulation)

  const statusConfig = {
    IN_PROGRESS: { label: 'In Progress', icon: ClockIcon, class: 'text-blue-500 bg-blue-500/10 border-blue-500/20' },
    COMPLETED: { label: 'Completed', icon: CheckCircleIcon, class: 'text-green-500 bg-green-500/10 border-green-500/20' },
    ERROR: { label: 'Error', icon: XCircleIcon, class: 'text-destructive bg-destructive/10 border-destructive/20' },
    CANCELLED: { label: 'Cancelled', icon: AlertCircleIcon, class: 'text-muted-foreground bg-muted/30 border-muted/40' },
  }[simulation.status]

  const StatusIcon = statusConfig.icon

  const runAverages = useMemo(() => {
    if (simulation.status === 'COMPLETED' && simulation.analyses && simulation.analyses.length > 0) {
      return computeRunAverages(simulation.analyses)
    }
    return null
  }, [simulation.analyses, simulation.status])

  return (
    <div className="relative group">
      <button
        onClick={() => router.push(`/dashboard/simulations/${simulation.id}`)}
        className="w-full text-left rounded-lg border border-border bg-card p-5 transition-all hover:border-border/80 hover:shadow-sm"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2 min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold truncate">{simulation.name}</h3>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${statusConfig.class}`}>
                <StatusIcon className="h-3 w-3" />
                {statusConfig.label}
                {simulation.status === 'IN_PROGRESS' && (
                  <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                )}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <GlobeIcon className="h-3 w-3" />
                {simulation.url}
              </span>
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3 w-3" />
                {simulation.personaCount} personas
              </span>
            </div>
            {simulation.batchName && (
              <p className="text-xs text-muted-foreground/70">Batch: {simulation.batchName}</p>
            )}
            {simulation.status === 'COMPLETED' && runAverages && (
              <div className="flex items-center gap-2 mt-1">
                {[
                  { key: 'clarity', label: 'Clarity' },
                  { key: 'trust', label: 'Trust' },
                  { key: 'buyIntent', label: 'Buy' },
                ].map(({ key, label }) => {
                  const val = (runAverages as any)[key] ?? 0;
                  const pct = (val / 10) * 100;
                  const bgColor = val >= 7 ? 'rgba(34,197,94,0.12)' : val >= 4 ? 'rgba(234,179,8,0.12)' : 'rgba(239,68,68,0.12)';
                  const borderColor = val >= 7 ? 'border-green-500/25' : val >= 4 ? 'border-amber-500/25' : 'border-red-500/25';
                  return (
                    <div key={key} className={`relative rounded-md border ${borderColor} overflow-hidden min-w-[56px]`}>
                      <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: bgColor }} />
                      <div className="relative p-1.5 flex flex-col items-center z-10">
                        <span className="text-sm font-bold tabular-nums leading-tight">{val.toFixed(1)}</span>
                        <span className="text-[9px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground whitespace-nowrap">
              {new Date(simulation.createdAt).toLocaleDateString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
              })}
            </p>
            {simulation.completedAt && simulation.status !== 'IN_PROGRESS' && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 whitespace-nowrap">
                {new Date(simulation.completedAt).toLocaleDateString(undefined, {
                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
        {simulation.status === 'IN_PROGRESS' && simulation.totalAnalyses && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
              <span>{simulation.completedAnalyses ?? 0}/{simulation.totalAnalyses} analyses</span>
              <span className="tabular-nums font-medium">{Math.round(((simulation.completedAnalyses ?? 0) / simulation.totalAnalyses) * 100)}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                style={{ width: `${((simulation.completedAnalyses ?? 0) / simulation.totalAnalyses) * 100}%` }}
              />
            </div>
          </div>
        )}
        {simulation.error && (
          <p className="mt-2 text-xs text-destructive bg-destructive/10 p-2 rounded">{simulation.error}</p>
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          removeSimulation(simulation.id)
        }}
        className="absolute -top-2 -right-2 flex items-center justify-center size-6 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:bg-destructive focus:outline-none"
        aria-label="Delete simulation"
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}

function NewSimulationForm({ onRun }: { onRun: (url: string, personas: Persona[], imageBase64?: string) => void }) {
  const batches = usePersonaStore((s) => s.batches)
  const [selectedBatchId, setSelectedBatchId] = useState<string>('')
  const [url, setUrl] = useState('')

  // Sync selected batch when batches hydrate or change
  useEffect(() => {
    if (batches.length > 0 && !batches.find((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(batches[0].id) // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [batches, selectedBatchId])

  const selectedBatch = batches.find((b) => b.id === selectedBatchId)

  const [inputMode, setInputMode] = useState<'url' | 'screenshot'>('url')
  const [screenshotFile, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageBase64Ref = useRef<string | null>(null)

  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
  const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

  const validateAndReadFile = useCallback((file: File) => {
    setValidationError(null)

    if (!ACCEPTED_TYPES.includes(file.type as any)) {
      setValidationError('Only PNG, JPG, and WEBP images are accepted.')
      return
    }
    if (file.size > MAX_SIZE_BYTES) {
      setValidationError('Image must be under 10 MB.')
      return
    }

    setScreenshotFile(file)
    setScreenshotPreview(URL.createObjectURL(file))

    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      setImageBase64(result)
      imageBase64Ref.current = result
    }
    reader.onerror = () => {
      setValidationError('Failed to read file. Please try again.')
    }
    reader.readAsDataURL(file)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) validateAndReadFile(file)
  }, [validateAndReadFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) validateAndReadFile(file)
  }, [validateAndReadFile])

  const removeScreenshot = useCallback(() => {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    setImageBase64(null)
    imageBase64Ref.current = null
    setValidationError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  const handleSubmit = () => {
    if (!selectedBatch) return

    if (inputMode === 'url') {
      if (!url.trim()) return
      onRun(url, selectedBatch.personas)
    } else {
      if (!imageBase64Ref.current) return
      onRun('Screenshot Upload', selectedBatch.personas, imageBase64Ref.current)
    }
  }

  if (batches.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Create a persona batch first, then come back to run a simulation.</p>
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
        <div className="flex flex-col gap-2">
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
        {/* ── Input mode toggle ──────────────────────────────────── */}
        <div className="flex flex-col gap-2">
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              onClick={() => setInputMode('url')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === 'url'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <LinkIcon className="h-3.5 w-3.5" />
              URL
            </button>
            <button
              type="button"
              onClick={() => setInputMode('screenshot')}
              className={`flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                inputMode === 'screenshot'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              Screenshot
            </button>
          </div>

          {inputMode === 'url' ? (
            /* ── URL mode ──────────────────────────────────────── */
            <div className="flex flex-col gap-2">
              <label htmlFor="pricing-url" className="text-sm font-medium">Pricing Page URL</label>
              <Input
                id="pricing-url"
                type="url"
                placeholder="https://your-startup.com/pricing"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
          ) : (
            /* ── Screenshot mode ──────────────────────────────── */
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Pricing Page Screenshot</label>
              {!screenshotFile ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors hover:border-foreground/25 hover:text-foreground cursor-pointer ${
                    isDragOver ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <UploadIcon className="h-6 w-6" />
                  Drop a screenshot or click to browse
                  <span className="text-xs text-muted-foreground/70">PNG, JPG, or WEBP — under 10 MB</span>
                </button>
              ) : (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  {screenshotPreview && (
                    <img
                      src={screenshotPreview}
                      alt="Screenshot preview"
                      className="h-14 w-14 rounded object-cover"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{screenshotFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(screenshotFile.size / 1024).toFixed(0)} KB
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeScreenshot}
                    className="rounded-md p-1 text-muted-foreground hover:text-destructive transition-colors"
                    aria-label="Remove screenshot"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileInput}
                className="hidden"
              />
              {validationError && (
                <p className="text-xs text-destructive">{validationError}</p>
              )}
            </div>
          )}
        </div>
        <Button
          disabled={
            inputMode === 'url'
              ? !url.trim()
              : !imageBase64Ref.current
          }
          onClick={handleSubmit}
        >
          Run Simulation
        </Button>
      </CardContent>
    </Card>
  )
}

export default function SimulationsPage() {
  const simulations = useSimulationStore((s) => s.simulations)
  const analysisFlow = useAnalysisFlow()
  const [showNewForm, setShowNewForm] = useState(false)

  const inProgress = simulations.filter((s) => s.status === 'IN_PROGRESS')
  const completed = simulations.filter((s) => s.status !== 'IN_PROGRESS')

  const handleRunSimulation = (url: string, personas: Persona[], imageBase64?: string) => {
    if (imageBase64) {
      analysisFlow.setPricingImageBase64(imageBase64)
    }
    analysisFlow.setPricingUrl(url)
    analysisFlow.handleAnalyzePricing(personas, url, imageBase64)
    setShowNewForm(false)
  }

  return (
    <div className="flex flex-col gap-8 w-full h-full animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Simulations</h1>
          <p className="text-sm text-muted-foreground">
            {simulations.length === 0
              ? 'No simulations yet. Run your first simulation to get started.'
              : `${completed.length} completed · ${inProgress.length} in progress`}
          </p>
        </div>
        <Button
          onClick={() => setShowNewForm(!showNewForm)}
          size="sm"
        >
          <PlusIcon className="h-3.5 w-3.5" />
          Run New Simulation
        </Button>
      </div>

      {showNewForm && (
        <NewSimulationForm onRun={handleRunSimulation} />
      )}

      {analysisFlow.isPending && (
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4 text-sm text-blue-600 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
          Simulation is running…
          <Link
            href="/dashboard/simulations"
            className="ml-auto text-xs font-medium text-blue-600 hover:underline"
          >
            Refresh
          </Link>
        </div>
      )}

      {inProgress.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            In Progress
          </h2>
          <div className="flex flex-col gap-3">
            {inProgress.map((sim) => (
              <SimulationCard key={sim.id} simulation={sim} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Completed
          </h2>
          <div className="flex flex-col gap-3">
            {completed.map((sim) => (
              <SimulationCard key={sim.id} simulation={sim} />
            ))}
          </div>
        </section>
      )}

      {simulations.length === 0 && !showNewForm && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-12 w-12 rounded-full bg-muted/30 flex items-center justify-center mb-4">
            <ClockIcon className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm max-w-sm">
            No simulations yet. Click "Run New Simulation" above to get started.
          </p>
        </div>
      )}
    </div>
  )
}
