import { InterviewUploadClient } from '@/ui/interviews/InterviewUploadClient'

export default function InterviewsPage() {
  return (
    <div className="flex flex-col gap-10 w-full h-full">
      <div className="flex flex-col gap-2 max-w-4xl mx-auto w-full">
        <h1 className="text-3xl font-semibold tracking-tight">
          Generate Personas from Interviews
        </h1>
        <p className="text-sm text-muted-foreground">
          Upload interview transcripts (.txt files) to extract behavioral signals and generate realistic personas grounded in real user research.
        </p>
      </div>
      <InterviewUploadClient />
    </div>
  )
}
