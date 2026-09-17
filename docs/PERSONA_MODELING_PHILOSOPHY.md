# Persona Modeling Philosophy

Rules governing how Kynd generates personas. The system supports three
generation modes with different evidence and invention contracts, and encodes
five principles about what a persona detail is *for*.

The modes are selected by the caller and carried on every generated persona as
`generationMode`. Per-attribute trust is recorded as provenance, not implied.

---

## Generation Modes

| Mode | Evidence | Invention | Backstory | Intended use |
|------|----------|-----------|-----------|--------------|
| `research` | Required | None/minimal | Full narrative, evidence-grounded | Interview-based personas |
| `strategy` | Allowed | Controlled | Full narrative, storytelling allowed | ICP/market personas |
| `cluster` | Required | Cluster-level | Not generated | Multi-interview synthesis |

### Research mode

Evidence-first generation from interview transcripts. Config:
`ResearchPersonaConfigSchema` in `src/domain/dtos/PersonaGenerationConfig.ts`
(`interviewIds`, `evidenceThreshold`, `preserveUncertainty`, `verbatimSource`).

- Every value and fear carries a verbatim supporting quote (`valueEvidence`,
  `fearEvidence`); `verbatimSource` is the raw transcript that those quotes must
  be fragments of. Quotes that are paraphrases are rejected.
- Backstory (`generateResearchBackstory` in
  `src/infrastructure/adapters/PersonaAdapter.ts`) is narrative but must not
  fabricate specific life events, purchases, or trauma unless the evidence
  states them. When evidence is thin, the prompt instructs the model to say so
  rather than invent.
- Provenance is computed per attribute: confidence is LLM-decided, and the tier
  is derived from it (`>= 0.8` → `observed`, `>= 0.6` → `interpreted`,
  otherwise `synthetic`).

### Strategy mode

Richer storytelling from an ICP/market description. Config:
`StrategyPersonaConfigSchema` (`icpDescription`, `allowSyntheticBackstory`,
`storytellingLevel: 'conservative' | 'moderate' | 'rich'`).

- Representative assumptions are allowed to make the persona useful for
  imagination and decision-making.
- `allowSyntheticBackstory` controls whether the backstory prompt permits
  fabricated details that explain behavior. `storytellingLevel` controls
  narrative enrichment.
- `GeneratePersonasUseCase` invokes strategy mode with
  `allowSyntheticBackstory: true` and `storytellingLevel: 'moderate'`.

### Cluster mode

Synthetic representative personas synthesized from multiple interview subjects.
Config: `ClusterPersonaConfigSchema` (`interviewIds` min 1, `clusterLabel`,
`minClusterSize`).

- Each persona represents a cluster's central tendency, not one individual.
- Every attribute carries `clusterInfo` (source IDs, represented count).
- Properties are cluster-level; no per-person backstory is generated.
- Implemented by `PersonaAdapter.generateClusterPersonas` and exposed on
  `LlmServicePort`. No current use case dispatches it: `GeneratePersonasUseCase`
  rejects `cluster` with a pointer to `GeneratePersonasFromInterviewsUseCase`
  (which generates via research mode).

### Mode dispatch

`GeneratePersonasUseCase.execute` (`src/application/usecases/GeneratePersonasUseCase.ts`)
takes an optional `mode`:

- `research` → `LlmServicePort.generateResearchPersonas`
- `strategy` → `LlmServicePort.generateStrategyPersonas`
- `cluster` → rejected with a pointer to `GeneratePersonasFromInterviewsUseCase`
- `undefined` → legacy pipeline (backward compatibility)

The per-mode config types carry no discriminator field: the port method name is
the discriminator. The port surface is `src/domain/ports/LlmServicePort.ts`
(`generateResearchPersonas`, `generateStrategyPersonas`,
`generateClusterPersonas`, `applyCounterfactualTest`).

---

## Philosophy Principles

### 1. Every detail must explain a decision, behavior, or need

A persona is not a biography. Each generated attribute should earn its place by
explaining something the persona would decide or do. Details that are merely
descriptive add noise without constraining behavior.

### 2. Don't invent details that CREATE behavior — only details that EXPLAIN it

Invention is allowed only where it explains an already-grounded behavior.
Research mode is the strictest expression of this: no fabricated events, and
thin evidence is acknowledged rather than filled in.

### 3. Identity vs situation

Stable traits and contextual behavior are separate fields on `Persona`
(`src/domain/entities/Persona.ts`):

- `identityContext` — stable traits that apply across domains
- `situationContext` — behavior specific to a domain or scenario

Conflating the two makes a persona look like a personality test rather than a
person in a situation.

### 4. Counterfactual removal test

> "If this detail were false, would the team make a different product decision?"

Details that fail this test must not influence product decisions. The
counterfactual test is both a stored field (`Persona.counterfactualTest`) and an
operation on the port (`applyCounterfactualTest`), which is mode-aware: research
personas use strict criteria (any unsupported synthetic detail fails), strategy
personas flag only details that would change a decision.

### 5. Provenance over assertion

Every attribute tracks its tier (`observed` / `interpreted` / `synthetic`) and a
confidence value in `PersonaProvenance` (`src/domain/entities/PersonaProvenance.ts`).
Provenance is attached to the persona as `Persona.provenance`, linked to source
excerpts via `evidenceLinks`, and rolled up into `overallConfidence`. A claim's
trustworthiness is data, not a blanket mode label.

---

## Where the Rules Live

| File | Role |
|------|------|
| `src/domain/entities/Persona.ts` | Persona fields: mode, behavioral dimensions, provenance, evidence links, cluster info, identity/situation context, counterfactual test |
| `src/domain/entities/PersonaProvenance.ts` | Tier labels, per-attribute provenance, evidence links, cluster info |
| `src/domain/entities/BehavioralDimension.ts` | Context-specific behavioral axes that supplement Big Five |
| `src/domain/dtos/PersonaGenerationConfig.ts` | Per-mode config schemas |
| `src/domain/ports/LlmServicePort.ts` | Generation methods per mode + counterfactual test |
| `src/infrastructure/adapters/PersonaAdapter.ts` | Mode prompts, evidence validation, provenance construction |
| `src/application/usecases/GeneratePersonasUseCase.ts` | Mode dispatch and PB&J rationalization |
