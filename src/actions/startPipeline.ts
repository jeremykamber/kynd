"use server"

import { pipelineStore } from "@/infrastructure/PipelineStore"

const API_PATH = process.env.NETLIFY_BACKGROUND_FUNCTIONS_PATH ?? '/api/process-pipeline'

function getSiteUrl(): string {
  return process.env.URL
    ?? process.env.NETLIFY_URL
    ?? process.env.DEPLOY_URL
    ?? 'http://localhost:8888'
}

export async function startInterviewPipeline(formData: FormData): Promise<{ jobId: string } | { error: string }> {
  const jobId = `interview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

  const files: { filename: string; content: string }[] = []
  for (const [key, value] of formData.entries()) {
    if (value instanceof File && (key === 'files' || key.startsWith('file_'))) {
      files.push({ filename: value.name, content: await value.text() })
    }
  }

  if (files.length < 2) {
    return { error: 'Please upload at least 2 interview transcripts.' }
  }

  await pipelineStore.saveInput(jobId, { files })
  await pipelineStore.saveState({
    jobId,
    type: 'interviews',
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })

  // Trigger the background function
  const siteUrl = getSiteUrl()
  const bgUrl = `${siteUrl}${API_PATH}`
  console.log(`[startPipeline] Triggering background function at ${bgUrl}`)

  fetch(bgUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jobId, type: 'interviews' }),
  }).catch((err) => {
    console.error(`[startPipeline] Failed to trigger background function:`, err)
    pipelineStore.updateState(jobId, {
      status: 'failed',
      error: `Failed to start background processing: ${(err as Error).message}`,
    })
  })

  return { jobId }
}

export async function getPipelineStatusAction(jobId: string): Promise<{
  found: boolean
  state?: any
  output?: any
}> {
  const state = await pipelineStore.getState(jobId)
  if (!state) return { found: false }

  if (state.status === 'completed') {
    const output = await pipelineStore.getOutput(jobId)
    return { found: true, state, output }
  }

  return { found: true, state }
}
