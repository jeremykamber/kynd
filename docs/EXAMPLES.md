# Reference Implementations & Patterns

Stable, "Gold Standard" examples of how to implement features in Kynd. Every snippet below is taken from
code that exists in the repository; when in doubt, the file is the source of truth.

Fuller conventions live in `CONTRIBUTING.md` (workflow, tests, conventions) and `ARCHITECTURE.md`
(layer boundaries, dependency direction, and the step-by-step for adding a feature).

---

## 1. Hexagonal Pattern (DTO + Use Case)

*Use this when a feature has real business rules that must be independent of React, Next.js, and the LLM.*

### Domain DTO (`src/domain/dtos/UserDTO.ts`)

```typescript
export interface UserDTO {
  id: string
  username: string
  email: string
  password: string
}
```

### Port (`src/domain/ports/UserRepositoryPort.ts`)

```typescript
import { User } from '../entities/User'

export interface UserRepositoryPort {
  saveUser(user: User): Promise<void>
  findUserByEmail(email: string): Promise<User | null>
  updateUser(user: User): Promise<void>
  deleteUser(id: string): Promise<void>
}
```

### Use Case (`src/application/usecases/RegisterUserUseCase.ts`)

```typescript
import { UserRepositoryPort } from '../../domain/ports/UserRepositoryPort'
import { UserDTO } from '../../domain/dtos/UserDTO'
import { User } from '../../domain/entities/User'

export class RegisterUserUseCase {
  constructor(private repo: UserRepositoryPort) {}

  async execute(dto: UserDTO): Promise<void> {
    const user = User.fromDTO(dto)
    if (!user.validate()) throw new Error('Invalid user')
    const existing = await this.repo.findUserByEmail(user.email)
    if (existing) throw new Error('Email already registered')
    await this.repo.saveUser(user)
  }
}
```

---

## 2. Server Action Pattern (Recommended)

*Use this for most features. The action is the only DI boundary: it builds infrastructure adapters, injects
them into a use case, and streams progress back to the client.*

### Server Action (`src/actions/generatePersonas.ts`)

```typescript
"use server";

import { GeneratePersonasUseCase } from "@/application/usecases/GeneratePersonasUseCase";
import { LlmServiceImpl } from "@/infrastructure/adapters/LlmServiceImpl";
import { createStreamableValue } from "@ai-sdk/rsc";
import { storeProgress, storeCompleted } from "@/actions/getProgress";
import { personaGenerationStore } from "@/infrastructure/PersonaGenerationStore";
import type { PersonaGenerationMode } from "@/domain/entities/PersonaProvenance";
import { shouldRunLocally } from "@/infrastructure/config";

async function runLocally(personaDescription: string, count: number, mode?: PersonaGenerationMode) {
  const runId = generateRunId();
  const stream = createStreamableValue<any>({ step: "BRAINSTORMING_PERSONAS" });

  // Side-channel progress for pollers (toast / reconnect), written alongside the stream.
  await storeProgress(runId, { step: "BRAINSTORMING_PERSONAS" });

  (async () => {
    try {
      const llmService = LlmServiceImpl.createFromEnv("openrouter");
      const useCase = new GeneratePersonasUseCase(llmService);

      const personas = await useCase.execute(personaDescription, (progress) => {
        try { stream.update(progress); } catch {}
        storeProgress(runId, {
          step: progress.step,
          streamingText: progress.streamingText,
          completedCount: progress.completedCount,
          totalCount: progress.totalCount,
        });
      }, count, undefined, mode);

      const finalPersonas = JSON.parse(JSON.stringify(personas));
      stream.done({ step: "DONE", personas: finalPersonas });
      personaGenerationStore.save(runId, finalPersonas);
      await storeCompleted(runId);
    } catch (error) {
      const msg = (error as Error).message;
      try { stream.done({ step: "ERROR", error: msg }); } catch {}
      personaGenerationStore.saveError(runId, msg);
      await storeCompleted(runId, msg);
    }
  })();

  return { streamData: stream.value, runId };
}

export async function generatePersonasAction(
  personaDescription: string,
  count: number = 5,
  mode?: PersonaGenerationMode,
) {
  if (shouldRunLocally()) return runLocally(personaDescription, count, mode);
  return runRemote(personaDescription, count, mode);
}
```

### UI Consumption (`src/ui/hooks/usePersonaFlow.ts`)

The hook owns `useTransition`/`isPending` state, consumes the RSC stream, and commits the result to the
Zustand store.

```typescript
import { generatePersonasAction } from '@/actions/generatePersonas'
import { readStreamableValue } from '@ai-sdk/rsc'
import { usePersonaStore, type PersonaBatch } from '@/ui/stores/personaStore'
import { resolveBatchLabel } from '@/lib/resolveBatchLabel'

const handleGeneratePersonas = useCallback((promptOverride?: string) => {
  const prompt = promptOverride ?? customerProfile
  if (!prompt.trim()) return

  setError(null)
  setRunId(null)
  setPersonaProgress({ step: 'BRAINSTORMING_PERSONAS' })
  setIsPending(true)

  ;(async () => {
    try {
      const result = await generatePersonasAction(prompt, personaCount, 'strategy')
      const streamData = result.streamData
      const id = result.runId as string | undefined
      setIsPending(false) // core action returned — release loading state

      if (id) usePersonaStore.getState().addActiveGeneration(id)

      if (streamData) {
        for await (const update of readStreamableValue<any>(streamData)) {
          if (!update) continue
          if (update.step === 'ERROR') { setError(update.error); setPersonaProgress(null); return }
          if (update.step === 'DONE') {
            const label = promptOverride ? promptOverride.slice(0, 60) : customerProfile.slice(0, 40)
            const fallbackLabel = `"${label}${label.length >= 60 ? '...' : ''}"`
            const batch: PersonaBatch = {
              id: `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
              label: await resolveBatchLabel(fallbackLabel, update.personas!, {
                source: 'description', description: promptOverride || customerProfile,
              }),
              source: 'description',
              createdAt: new Date().toISOString(),
              personas: update.personas!,
            }
            usePersonaStore.getState().addBatch(batch)
            setPersonas(update.personas)
            setPersonaProgress({ step: 'DONE', personas: update.personas,
              completedCount: update.personas!.length, totalCount: update.personas!.length })
            return
          }
          setPersonaProgress(update as PersonaProgress)
        }
      } else if (id) {
        setRunId(id) // remote path: poll getProgressAction / getPersonaGenerationResultAction
      }
    } catch (err) {
      setIsPending(false)
      setError((err as Error).message)
    }
  })()
}, [customerProfile, personaCount, onSuccess])
```

---

## 3. Port Implementation (Adapter)

*Infrastructure classes implement domain ports. They contain all I/O and no business rules.*

### `src/infrastructure/adapters/RemotePlaywrightAdapter.ts`

```typescript
import { chromium as baseChromium } from "playwright";
import { addExtra } from "playwright-extra";
import { Browser } from "playwright-core";
import { BrowserServicePort } from "@/domain/ports/BrowserServicePort";

const chromium = addExtra(baseChromium);

export class RemotePlaywrightAdapter implements BrowserServicePort {
    private readonly wsEndpoint: string;
    private browser: Browser | null = null;

    constructor(wsEndpoint: string) {
        this.wsEndpoint = wsEndpoint;
    }

    async navigateTo(
        url: string,
        onProgress?: (status: "SETTING_UP" | "LOADING_WEBSITE") => void,
        onLiveScreenshot?: (screenshotBase64: string) => Promise<void>,
    ): Promise<void> {
        onProgress?.("SETTING_UP");
        this.browser = await chromium.connect(this.wsEndpoint);
        // …newContext(locale, UA, headers), newPage(), goto, waitForDomStability
    }

    async captureViewport(): Promise<string> { /* base64 JPEG of the viewport */ }
    async getCleanedHtml(): Promise<string> { /* hidden/script/style stripped */ }
    async close(): Promise<void> { /* page → context → browser */ }
}
```

`BrowserServicePort` (the contract, `src/domain/ports/BrowserServicePort.ts`) declares `navigateTo`,
`captureViewport`, `captureScreenshot`, `captureFullPage`, `getCleanedHtml`, `scrollTo`, `scrollDown`,
`getElementLocation`, and `close` — the adapter above implements them.

---

## 4. Static Factory

*Construction with environment reads belongs in a static factory so tests and callers can inject overrides.*

### `src/infrastructure/adapters/LlmServiceImpl.ts`

```typescript
static createFromEnv(
    provider: "ollama" | "openrouter",
    overrides?: { text?: string; smallText?: string; vision?: string; scout?: string; extraction?: string },
): LlmServiceImpl {
    const baseURL = provider === "ollama"
        ? process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1"
        : process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";

    const apiKey = provider === "openrouter"
        ? process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY
        : process.env.OLLAMA_API_KEY || "ollama";

    const client = new OpenAI({ baseURL, apiKey: apiKey as string, maxRetries: 0 });
    const providerInstance = createOpenAI({
        baseURL,
        apiKey: apiKey as string,
        fetch: withReasoningDisabled(globalThis.fetch, shouldDisableThinkingForModel),
    });

    const models = provider === "ollama"
        ? { text: overrides?.text || LlmServiceImpl.OLLAMA_DEFAULT_MODEL, /* …all five */ }
        : {
            text: overrides?.text || LlmServiceImpl.OR_TEXT_MODEL,
            smallText: overrides?.smallText || LlmServiceImpl.OR_SMALL_TEXT_MODEL,
            vision: overrides?.vision || LlmServiceImpl.OR_VISION_MODEL,
            scout: overrides?.scout || LlmServiceImpl.OR_SCOUT_MODEL,
            extraction: overrides?.extraction || LlmServiceImpl.OR_EXTRACTION_MODEL,
        };

    return new LlmServiceImpl(client, providerInstance, models);
}
```

Call sites stay trivial: `const llmService = LlmServiceImpl.createFromEnv("openrouter");`

---

## 5. Zustand Store

*Client state that must survive navigation goes in `src/ui/stores/`. Persist via the shared IndexedDB
storage adapter — localStorage has a hard size ceiling that persona batches blow through.*

### `src/ui/stores/personaStore.ts`

```typescript
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { Persona } from '@/domain/entities/Persona'
import { indexedDBStorage } from '@/infrastructure/services/indexedDBStorage'

export interface PersonaBatch {
  id: string
  label: string
  source: 'description' | 'interviews'
  transcriptCount?: number
  createdAt: string
  personas: Persona[]
}

interface PersonaStoreState {
  batches: PersonaBatch[]
  activeBatchId: string | null
  activeGenerationRunIds: string[]

  addBatch: (batch: PersonaBatch) => void
  setActiveBatch: (id: string | null) => void
  removeBatch: (id: string) => void
  getActiveBatch: () => PersonaBatch | undefined
  addActiveGeneration: (runId: string) => void
  removeActiveGeneration: (runId: string) => void
}

export const usePersonaStore = create<PersonaStoreState>()(
  persist(
    (set, get) => ({
      batches: [],
      activeBatchId: null,
      activeGenerationRunIds: [],

      addBatch: (batch) => set((state) => ({ batches: [batch, ...state.batches] })),
      setActiveBatch: (id) => set({ activeBatchId: id }),
      getActiveBatch: () => {
        const { batches, activeBatchId } = get()
        return batches.find((b) => b.id === activeBatchId)
      },
      // …removeBatch, updateBatchLabel, removePersona, insertPersonasAfter, updatePersona
      addActiveGeneration: (runId) =>
        set((state) => ({
          activeGenerationRunIds: state.activeGenerationRunIds.includes(runId)
            ? state.activeGenerationRunIds
            : [...state.activeGenerationRunIds, runId],
        })),
      removeActiveGeneration: (runId) =>
        set((state) => ({
          activeGenerationRunIds: state.activeGenerationRunIds.filter((id) => id !== runId),
        })),
    }),
    {
      name: 'persona-storage',
      storage: createJSONStorage(() => indexedDBStorage),
    }
  )
)
```

---

## 6. Entity + Zod

*Domain entities are plain TypeScript interfaces; the matching Zod schema is the wire contract for LLM
output and is reused as the `streamObject` schema.*

### `src/domain/entities/Persona.ts`

```typescript
import { z } from "zod";

export interface Persona {
  id: string;
  name: string;
  age: number;
  occupation: string;
  educationLevel: string;
  interests: string[];
  goals: string[];

  // Big Five Personality Traits (0-100)
  conscientiousness: number;
  neuroticism: number;
  openness: number;
  extraversion: number;
  agreeableness: number;

  // Psychographic specification
  values: string[];
  fears: string[];
  communicationStyle: string;
  decisionStyle: string;

  backstory?: string;
  generationMode?: PersonaGenerationMode;
  provenance?: PersonaProvenance;
  // …see the file for the full surface
}

export const PersonaSchema = z.object({
  id: z.string().describe("Unique identifier for the persona"),
  name: z.string().describe("Full name of the persona"),
  age: z.number().describe("Age of the persona"),
  occupation: z.string().describe("Job title or role"),
  educationLevel: z.string().describe("Highest level of education"),
  interests: z.array(z.string()).describe("Personal interests and hobbies"),
  goals: z.array(z.string()).describe("Professional or personal goals"),

  conscientiousness: z.number().min(0).max(100).describe("High=Meticulous, Low=Chaotic"),
  neuroticism: z.number().min(0).max(100).describe("High=Anxious, Low=Stable"),
  openness: z.number().min(0).max(100).describe("High=Curious, Low=Traditional"),
  extraversion: z.number().min(0).max(100).describe("High=Outgoing, Low=Solitary"),
  agreeableness: z.number().min(0).max(100).describe("High=Compassionate, Low=Competitive"),

  values: z.array(z.string()).describe("Core values driving decisions"),
  fears: z.array(z.string()).describe("Anxieties and risk concerns"),
  communicationStyle: z.string().describe("How they speak — direct, analytical, collaborative, etc."),
  decisionStyle: z.string().describe("Decision process — data-driven, gut-driven, etc."),

  backstory: z.string().optional().describe("Life narrative — causally coherent backstory"),
  generationMode: PersonaGenerationModeSchema.optional(),
  provenance: PersonaProvenanceSchema.optional(),
});

export function validatePersona(entity: unknown): boolean { /* structural validation */ }
```

`PersonaResponseSchema` in `src/domain/entities/PersonaResponse.ts` follows the same pattern and is what the
analysis extraction call validates against.

---

## 7. Retry

*Transient provider failures (429, 5xx) are retried with exponential backoff plus jitter. Non-retryable
errors throw immediately; the last error is never swallowed.*

### `src/infrastructure/adapters/LlmServiceImpl.ts`

```typescript
public async withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await fn();
        } catch (error: unknown) {
            lastError = error;
            const status = (error as { status?: number }).status;
            const isRetryable = status === 429 || (status !== undefined && status >= 500);
            if (!isRetryable || i === maxRetries - 1) throw error;
            const waitTime = Math.pow(2, i) * 2000 + Math.random() * 1000;
            console.warn(`[LlmService] Retry ${i + 1}/${maxRetries} after ${Math.round(waitTime)}ms (status=${status})`);
            await this.sleep(waitTime);
        }
    }
    throw lastError;
}

// Call site (createChatCompletion):
return this.withRetry(async () => {
    return await this.client.chat.completions.create(/* … */);
});
```
