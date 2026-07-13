"use client"

import { useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import { Upload, FileText, XIcon, CheckCircle2 } from 'lucide-react'
import { useInterviewPipeline } from '@/ui/hooks/useInterviewPipeline'
import { MinimalCard } from '@/components/custom/MinimalCard'
import { Badge } from '@/components/ui/badge'
import { FlowDialog } from '@/components/custom/FlowDialog'

export function InterviewUploadClient() {
  const {
    files,
    addFile,
    removeFile,
    clearFiles,
    personas,
    error,
    isPending,
    progress,
    personaCount,
    setPersonaCount,
    handleSubmit,
    handleCancel,
  } = useInterviewPipeline()

  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const readFileContent = useCallback(
    (file: File): Promise<void> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = (e) => {
          const content = e.target?.result as string
          addFile(file.name, content)
          resolve()
        }
        reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
        reader.readAsText(file)
      })
    },
    [addFile],
  )

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files
    if (!selectedFiles) return

    const filePromises: Promise<void>[] = []
    for (let i = 0; i < selectedFiles.length; i++) {
      if (selectedFiles[i].name.endsWith('.txt')) {
        filePromises.push(readFileContent(selectedFiles[i]))
      }
    }
    await Promise.all(filePromises)
    if (e.target) e.target.value = ''
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const droppedFiles = e.dataTransfer.files
    const filePromises: Promise<void>[] = []
    for (let i = 0; i < droppedFiles.length; i++) {
      if (droppedFiles[i].name.endsWith('.txt')) {
        filePromises.push(readFileContent(droppedFiles[i]))
      }
    }
    await Promise.all(filePromises)
  }

  const handleReset = () => {
    clearFiles()
  }

  const hasResults = personas && personas.length > 0

  // Show results after successful generation
  if (hasResults) {
    return (
      <div className="flex flex-col gap-8 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
        <div className="flex flex-col gap-4 text-center items-center pt-8">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
            Generate Personas from Interviews
          </h1>
        </div>

        <MinimalCard>
          <div className="flex flex-col gap-6 items-center text-center py-8">
            <CheckCircle2 className="h-16 w-16 text-primary" />
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-bold tracking-tight">
                Personas Generated!
              </h2>
              <p className="text-lg text-muted-foreground text-balance max-w-lg">
                Successfully created <span className="font-semibold text-foreground">{personas.length}</span>{' '}
                interview-derived personas from {files.length} transcript{files.length !== 1 ? 's' : ''}.
              </p>
            </div>
            <div className="flex gap-4 pt-4">
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                View Personas
              </Link>
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-transparent px-8 text-sm font-semibold text-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Start Over
              </button>
            </div>
          </div>
        </MinimalCard>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-16 max-w-4xl mx-auto w-full animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 text-center items-center">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
          Generate Personas from Interviews
        </h1>
        <p className="text-lg text-muted-foreground text-balance max-w-2xl">
          Upload interview transcripts (.txt files) to extract behavioral signals
          and generate realistic personas grounded in real user research.
        </p>
      </div>

      <div className="grid gap-12">
        {/* Step 1: File Upload */}
        <section className="flex flex-col gap-6 relative">
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-primary font-bold hidden md:flex">
            1
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">
                  Upload Interview Transcripts
                </h2>
                <p className="text-sm text-muted-foreground">
                  Upload interview transcripts (.txt files) to extract behavioral
                  signals and generate realistic personas.
                </p>
              </div>

              {/* Drag-drop zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 gap-4 transition-colors cursor-pointer ${
                  isDragging
                    ? 'border-primary/70 bg-primary/5'
                    : 'border-border/60 hover:border-primary/50 bg-secondary/20'
                }`}
              >
                <Upload className="h-12 w-12 text-muted-foreground/60" />
                <p className="text-base font-medium">
                  Drop transcripts here or click to browse
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports .txt files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  hidden
                  multiple
                  accept=".txt"
                  onChange={handleFileSelect}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div className="flex flex-col gap-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-secondary/30 px-4 py-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm font-medium truncate">
                          {file.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                          {(file.content.length / 1024).toFixed(1)} KB
                        </Badge>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFile(file.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0 ml-2"
                        aria-label={`Remove ${file.name}`}
                      >
                        <XIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </MinimalCard>
        </section>

        {/* Step 2: Generate */}
        <section className="flex flex-col gap-6 relative">
          <div className="absolute -left-12 top-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary text-primary font-bold hidden md:flex">
            2
          </div>
          <MinimalCard>
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-xl font-semibold tracking-tight">
                  Generate Personas
                </h2>
                <p className="text-sm text-muted-foreground">
                  {files.length === 0
                    ? 'Upload interview transcripts above to get started.'
                    : files.length === 1
                      ? `${files.length} transcript uploaded. Need at least 2 to generate interview-grounded personas.`
                      : `${files.length} transcripts uploaded. Ready to extract signals and generate personas.`}
                </p>
              </div>

              {files.length === 1 && (
                <p className="text-sm text-amber-400 font-medium bg-amber-400/10 p-3 rounded-md flex items-center gap-2">
                  <span className="text-base">⚠️</span>
                  Need at least 2 interview transcripts to generate personas. Upload one more to proceed.
                </p>
              )}

              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-muted-foreground">
                  Number of Personas to Generate
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={personaCount}
                  onChange={(e) => setPersonaCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                  disabled={isPending}
                  className="h-10 w-24 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="text-xs text-muted-foreground">
                  1–20 personas. More personas = richer behavioral coverage but longer generation time.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={files.length < 2 || isPending}
                  onClick={handleSubmit}
                  className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {isPending ? 'Processing...' : files.length < 2 ? 'Need 2+ Transcripts' : 'Generate Personas from Interviews'}
                </button>
              </div>

              {error && (
                <p className="text-sm text-destructive font-medium bg-destructive/10 p-3 rounded-md">
                  {error}
                </p>
              )}
            </div>
          </MinimalCard>
        </section>
      </div>

      {/* Pipeline Progress Dialog */}
      <FlowDialog
        open={progress !== null}
        onOpenChange={(open) => {
          if (!open && progress) {
            handleCancel()
          }
        }}
        title="Processing Interview Transcripts"
        description="Extracting behavioral signals, pooling patterns, and generating interview-grounded personas."
        currentStep={
          progress?.step === 'EXTRACTING' ? 0
          : progress?.step === 'POOLING' ? 1
          : progress?.step === 'SAMPLING' ? 2
          : progress?.step === 'GENERATING' ? 3
          : progress?.step === 'INGESTING' ? 4
          : 0
        }
        steps={[
          { title: 'Extracting Signals', description: 'Analyzing interview transcripts for behavioral signals', cyclingTexts: ['Analyzing transcripts for behavioral patterns...', 'Identifying key themes across interviews...', 'Mapping signals to psychographic dimensions...'] },
          { title: 'Pooling Signals', description: 'Aggregating patterns across all interviews', cyclingTexts: ['Aggregating patterns across all transcripts...', 'Finding common behavioral threads...', 'Building a unified signal model...'] },
          { title: 'Sampling Personas', description: 'Drawing coherent persona profiles from the distribution', cyclingTexts: ['Drawing persona profiles from the distribution...', 'Selecting diverse archetypes...', 'Optimizing for coverage and distinction...'] },
          { title: 'Generating Personas', description: 'Building backstories, psychographics, and insights', cyclingTexts: ['Building interview-grounded backstories...', 'Developing psychographic profiles...', 'Crafting behavioral insights...'] },
          { title: 'Ingesting to Memory', description: 'Indexing personas for retrieval-augmented chat', cyclingTexts: ['Indexing personas for retrieval...', 'Building embedding vectors...', 'Optimizing for semantic search...'] },
        ]}
        streamingText={progress?.message}
      >
        {/* Children slot reserved for future progress bar / persona dots */}
        {progress && <div />}
      </FlowDialog>
    </div>
  )
}
