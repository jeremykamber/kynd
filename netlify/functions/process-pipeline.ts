/**
 * Background function for long-running LLM pipelines.
 *
 * Runs up to 15 minutes (Netlify Background Functions on all plans).
 * Triggered via HTTP POST by a server action. Pipeline state is
 * persisted in Netlify Blobs so the client can poll for progress.
 *
 * Request:  { jobId: string; type: "interviews" | "pricing" }
 * Response: 202 (immediate) — function continues in background.
 */

interface PipelineJob {
  jobId: string
  type: 'interviews' | 'pricing'
}

interface PipelineState {
  jobId: string
  type: string
  status: string
  progress?: number
  total?: number
  message?: string
  error?: string
  createdAt?: string
  updatedAt?: string
}

// ─── Netlify Blobs helpers ────────────────────────────────────────────────
const BLOBS_ORIGIN = process.env.NETLIFY_BLOBS_ORIGIN ?? `https://api.netlify.com/api/v1/blobs`
const SITE_ID = process.env.SITE_ID ?? process.env.NETLIFY_SITE_ID ?? ''
const DEPLOY_ID = process.env.DEPLOY_ID ?? process.env.NETLIFY_DEPLOY_ID ?? ''
const TOKEN = process.env.NETLIFY_ACCESS_TOKEN ?? ''

function blobUrl(storeName: string, key: string): string {
  return `${BLOBS_ORIGIN}/${SITE_ID}/${storeName}/${key}`
}

async function blobWrite(storeName: string, key: string, data: unknown): Promise<void> {
  const url = blobUrl(storeName, key)
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'X-NF-Edge-Cache': 'false',
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    console.error(`[Pipeline] Blob write failed for ${key} (${storeName}): ${res.status}`)
  }
}

async function blobRead<T>(storeName: string, key: string): Promise<T | null> {
  const url = blobUrl(storeName, key)
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'X-NF-Edge-Cache': 'false',
    },
  })
  if (res.status === 404) return null
  if (!res.ok) return null
  return res.json() as Promise<T>
}

// ─── State helpers ────────────────────────────────────────────────────────

async function saveState(state: PipelineState): Promise<void> {
  await blobWrite('pipeline-states', state.jobId, state)
}

async function updateState(jobId: string, partial: Partial<PipelineState>): Promise<void> {
  const existing = await blobRead<PipelineState>('pipeline-states', jobId)
  if (!existing) return
  await saveState({ ...existing, ...partial })
}

async function loadInput<T>(jobId: string): Promise<T | null> {
  return blobRead<T>('pipeline-inputs', jobId)
}

async function saveOutput(jobId: string, data: unknown): Promise<void> {
  await blobWrite('pipeline-outputs', jobId, data)
}

// ─── OpenRouter LLM helper ────────────────────────────────────────────────

const OPENROUTER_BASE = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1'
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY ?? ''

interface LlmOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: 'json_object' | 'text' }
}

async function callLlm(
  messages: { role: string; content: string }[],
  options: LlmOptions = {},
): Promise<string> {
  const response = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model ?? 'deepseek/deepseek-v4-flash',
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? undefined,
      response_format: options.responseFormat,
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`OpenRouter API error (${response.status}): ${text.slice(0, 200)}`)
  }

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ─── Pipeline: Interview Transcripts → Personas ──────────────────────────

async function processInterviews(jobId: string): Promise<void> {
  await updateState(jobId, { status: 'extracting', message: 'Starting interview pipeline...' })

  const input = await loadInput<{ files: { filename: string; content: string }[] }>(jobId)
  if (!input || !input.files || input.files.length < 2) {
    await updateState(jobId, { status: 'failed', error: 'Need at least 2 interview transcripts' })
    return
  }

  // Phase 1: Extract signals from each transcript
  await updateState(jobId, {
    status: 'extracting',
    message: `Extracting signals from ${input.files.length} transcripts...`,
    total: input.files.length,
    progress: 0,
  })

  const extractionResults: { filename: string; signals: any }[] = []

  for (let i = 0; i < input.files.length; i++) {
    const file = input.files[i]
    await updateState(jobId, {
      status: 'extracting',
      message: `Analyzing: ${file.filename}`,
      total: input.files.length,
      progress: i + 1,
    })

    try {
      const response = await callLlm(
        [
          {
            role: 'system',
            content: `You are an expert user researcher. Extract behavioral signals from the interview transcript below.
Return a JSON object with the fields: painPoints (array of {text, quote}), goals (array of {text, quote}),
values (array of {text, quote}), featureDesires (array of {text, quote}),
decisionPattern (object with text and quote), communicationStyle (object with text),
context (object with role and industry, each with text).
Focus on extracting verbatim quotes and specific details.`,
          },
          { role: 'user', content: file.content },
        ],
        {
          temperature: 0.3,
          responseFormat: { type: 'json_object' },
        },
      )

      const signals = JSON.parse(response)
      extractionResults.push({ filename: file.filename, signals })
      console.log(`[Pipeline] Extracted signals from ${file.filename}`)
    } catch (err) {
      console.error(`[Pipeline] Extraction failed for ${file.filename}:`, err)
    }
  }

  if (extractionResults.length < 2) {
    await updateState(jobId, {
      status: 'failed',
      error: `Only ${extractionResults.length} interview(s) extracted. Need at least 2.`,
    })
    return
  }

  // Phase 2: Pool signals (synthesize into combined description)
  await updateState(jobId, { status: 'pooling', message: 'Synthesizing signal patterns...' })
  const allPainPoints = extractionResults.flatMap(r => r.signals.painPoints ?? [])
  const allGoals = extractionResults.flatMap(r => r.signals.goals ?? [])
  const allValues = extractionResults.flatMap(r => r.signals.values ?? [])
  const allFeatures = extractionResults.flatMap(r => r.signals.featureDesires ?? [])
  const decisionPatterns = extractionResults.map(r => r.signals.decisionPattern?.text ?? 'Unknown').filter(Boolean)
  const roles = extractionResults.map(r => r.signals.context?.role?.text ?? 'Unknown').filter(Boolean)
  const industries = extractionResults.map(r => r.signals.context?.industry?.text ?? 'Unknown').filter(Boolean)
  const commStyles = extractionResults.map(r => r.signals.communicationStyle?.text ?? 'Unknown').filter(Boolean)

  const personaDescription = [
    'Based on the following user research data, generate detailed user personas.',
    '',
    '--- Pain Points ---',
    ...new Set(allPainPoints.map((p: any) => `- ${p.text}`)),
    '',
    '--- Goals ---',
    ...new Set(allGoals.map((g: any) => `- ${g.text}`)),
    '',
    '--- Values ---',
    ...new Set(allValues.map((v: any) => `- ${v.text}`)),
    '',
    '--- Desired Features ---',
    ...new Set(allFeatures.map((f: any) => `- ${f.text}`)),
    '',
    '--- Decision Patterns ---',
    ...decisionPatterns.map(d => `- ${d}`),
    '',
    '--- Roles ---',
    ...roles.map(r => `- ${r}`),
    '',
    '--- Industries ---',
    ...industries.map(i => `- ${i}`),
    '',
    '--- Communication Styles ---',
    ...commStyles.map(c => `- ${c}`),
    '',
    `There are ${extractionResults.length} interview transcripts. Generate 8-10 personas.`,
  ].join('\n')

  // Phase 3: Generate personas
  await updateState(jobId, { status: 'generating', message: 'Generating personas...' })

  const count = Math.max(extractionResults.length * 2, 8)
  const personaCount = Math.min(count, 10)

  // Step 1: Generate initial personas
  await updateState(jobId, { status: 'generating', message: 'Creating persona profiles...' })
  const personaJson = await callLlm(
    [
      {
        role: 'system',
        content: `You are a persona generation engine. Generate ${personaCount} detailed personas based on the user research data.
Return a JSON array of persona objects. Each persona must have:
- id: string (unique)
- name: string
- age: number
- occupation: string
- educationLevel: string
- interests: string[]
- goals: string[]
- conscientiousness: number (0-100)
- neuroticism: number (0-100)
- openness: number (0-100)
- extraversion: number (0-100)
- agreeableness: number (0-100)
- values: string[]
- fears: string[]
- communicationStyle: string
- decisionStyle: string
- pricingSensitivity: number (0-100)
- typicalBudget: string
- backstory: string (2-3 paragraph narrative life story)
- aiInsight: string (1-2 sentence behavioral insight)`,
      },
      { role: 'user', content: personaDescription },
    ],
    {
      temperature: 0.7,
      responseFormat: { type: 'json_object' },
      maxTokens: 16000,
    },
  )

  const personas = JSON.parse(personaJson)
  const personaArray = Array.isArray(personas) ? personas : personas.personas ?? [personas]

  await updateState(jobId, {
    status: 'generating',
    message: `Generated ${personaArray.length} personas`,
    progress: personaArray.length,
    total: personaArray.length,
  })

  // Phase 4: Save results
  await updateState(jobId, { status: 'compiling', message: 'Finalizing results...' })
  await saveOutput(jobId, personaArray)
  await updateState(jobId, { status: 'completed', message: `Generated ${personaArray.length} personas` })

  console.log(`[Pipeline] Interview pipeline complete for ${jobId}: ${personaArray.length} personas`)
}

// ─── Pipeline: Pricing Page Analysis ──────────────────────────────────────

async function processPricing(jobId: string): Promise<void> {
  await updateState(jobId, { status: 'analyzing', message: 'Starting pricing analysis...' })
  // TODO: Implement pricing pipeline
  await updateState(jobId, { status: 'failed', error: 'Pricing pipeline not yet implemented in background function' })
}

// ─── Main handler ─────────────────────────────────────────────────────────

export default async (req: Request): Promise<Response> => {
  try {
    const job: PipelineJob = await req.json()
    console.log(`[Pipeline] Starting job ${job.jobId} (${job.type})`)

    await saveState({
      jobId: job.jobId,
      type: job.type,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    // Fire-and-forget: start processing, return 202 immediately
    if (job.type === 'interviews') {
      processInterviews(job.jobId).catch(async (err) => {
        console.error(`[Pipeline] Job ${job.jobId} failed:`, err)
        await updateState(job.jobId, { status: 'failed', error: (err as Error).message })
      })
    } else if (job.type === 'pricing') {
      processPricing(job.jobId).catch(async (err) => {
        console.error(`[Pipeline] Job ${job.jobId} failed:`, err)
        await updateState(job.jobId, { status: 'failed', error: (err as Error).message })
      })
    }

    return new Response(null, { status: 202 })
  } catch (err) {
    console.error(`[Pipeline] Error starting job:`, err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const config = {
  path: '/api/process-pipeline',
  background: true,
}
