# Option C quality system

Status: the user chose Option C on 2026-11-24. This document specifies that
design. It is not an implementation record.

Interactive version: [option-c-quality-system.html](option-c-quality-system.html)

Prior evidence and rejected options: [analysis-quality-floor.md](analysis-quality-floor.md)

This document describes a report pipeline that can state a claim only when a
persona transcript supports it. It changes how claims are extracted, counted,
and written into the cohort report.

## 1. Problem

This section explains what fails today and defines the terms the rest of the
document uses.

### 1.1 Terms used in this document

The design uses several words that have ordinary meanings. In this document
they have one fixed meaning each.

| Term | Meaning |
|---|---|
| Artifact | The URL, screenshot, or text that the personas evaluate. |
| Monologue | The first-person transcript a persona writes while it reads or views the artifact. |
| Extraction | The third-person structured response built from one monologue. |
| Claim | One assertion a persona makes, with one verbatim quotation from its monologue. |
| Support gate | A model check that decides whether a claim's quotation supports the claim's observation. |
| Ledger | The stored list of all claims that passed the support gate, grouped by topic, with code-computed counts. |
| Group | A set of claims about the same topic, with counts of personas for, against, and neutral. |
| Finding | A group with enough distinct personas to appear in the cohort report. The floor is two for five or fewer and three for six or more. |
| Verdict | One choice per persona from a fixed set: `adopt`, `trial`, `reject`, or `undecided`. |
| Frame | The per-persona task, starting point, decision question, and role for one artifact run. |
| Artifact profile | The facts, content kind, and stage-anchor kind extracted from the artifact before persona analysis. |
| Plan | The code-built input to the report writer. It contains the ledger, facts, and counts, and no raw transcripts. |
| Synthesis | The cohort report: overview, answer, findings, disagreements, frictions, and counts. |

A claim is not a finding. A claim belongs to one persona. A finding belongs to
the cohort and needs two personas for a cohort of five or fewer, and three for a
cohort of six or more. A one-persona cohort can use one. A verdict is not a
claim either. A verdict is the persona's final decision, and the report counts
verdicts separately from claims.

### 1.2 What the current pipeline does

Today, `AnalyzeArtifactUseCase` captures the artifact and runs up to five
personas at once. Each persona makes two LLM calls. The first call produces a
first-person monologue. The second call, `extractPersonaResponse`, maps that
monologue into a `PersonaResponse` with an overview, a five-stage journey,
findings, frictions, and questions.

After all personas finish, `SynthesizeArtifactResultsUseCase` makes one
`generateCohortSynthesis` call. That call reads the raw monologues and the
per-persona answers. It writes the overview, the research-question answer, the
top findings, the disagreements, and the biggest frictions.

`groundSynthesisCitations` then resolves the model's evidence phrases into
verbatim quotes and derives `affectedPersonaCount` from the resolved quotes.
That step fixed one defect: a finding can no longer cite a quote that is not in
the transcript. It does not check whether the quote supports the observation.
It also does not check the prose against its own counts.

### 1.3 The failure

The latest local smoke output shows the remaining class of error. The overview
said:

> "All three personas hit the same wall: routing rules ... behind the Growth tier."

One persona was blocked at the action stage because the brief offered no beta
sign-up. The persona was not blocked by price. The synthesis moved that persona
onto the price wall because the prose was written from a general impression of
the cohort rather than from a counted claim set.

The same run had a disagreement split of one persona against one persona in a
cohort of three. The third persona was absent from both sides. A reader cannot
tell whether that persona had no view, held a third view, or was overlooked.

The report also invented a price and an organisation fact that the artifact
contradicted. The model was specific, but its specificity was not tied to the
artifact.

### 1.4 Evidence from blind review

Ten artifact runs per round. Ten blind reviewers per round. Five reviewer
roles. The pass floor is a median blind score of 8 out of 10.

| Round | Clean runs | Median | Mean | Pass |
|---|---:|---:|---:|---:|
| 1 | 10/10 | 6/10 | 5.7 | 0/10 |
| 2 | 10/10 | 6/10 | 5.7 | 0/10 |
| 3 | 10/10 | 5/10 | 5.4 | 0/10 |
| 4 | 10/10 | 5/10 | 5.0 | 0/10 |

| Reviewer | Specificity | Grounding | Differentiation | Actionability |
|---|---:|---:|---:|---:|
| Investor | 7 | 5 | 6 | 5 |
| Founder | 8 | 5 | 3 | 6 |
| PM | 8 | 5 | 4 | 6 |
| Marketer | 9 | 6 | 6.5 | 7.5 |
| Growth | 8 | 6 | 7 | 8 |

Specificity is already high. Grounding and differentiation are the floor.
Actionability depends on the answer, so it rises only when the answer is true.

The blind review also showed that changing "all" to the citation count alone
made the score worse. A reaction supported by eight personas was reported as
"3 of 8" because the model supplied only three anchors. A count must come from
a complete claim set, not from the anchors the model happened to emit.

### 1.5 Why a prompt change cannot fix it

The failure is structural. The synthesis call has two jobs at once: decide what
the cohort's evidence says, and write prose about it. When the model writes
"all three", it is making a counting claim that no code checks.

A stronger instruction can reduce the error rate, but it cannot make the count
true. The same model that writes the sentence also chooses the number. The
system needs a data structure that holds the verified claims and their counts
before the writer starts. That is the claim ledger.

## 2. Mechanism

This section describes the pipeline in run order, from artifact intake to a
validated report.

### 2.1 Run order

The pipeline has six stages. Each stage has one owner, and each stage passes a
typed value to the next.

```text
ArtifactInput
  |
  v
ArtifactIntake
  |
  v
extractArtifactProfile                 one LLM call, serial
  |  ArtifactProfile: content kind, facts, anchor kind
  v
buildSimulationFrames                  pure code
  |  one frame per persona
  v
for each persona, up to five at once
  |  monologue                          one LLM call
  |  extraction and claims              both read the monologue
  |  extraction                         one LLM call
  |  claims                             one LLM call
  v
buildClaimLedger
  |  support gate                      one batch LLM call
  |  cluster claims                    one batch LLM call
  |  counts, citations, splits         pure code
  v
buildSynthesisPlan                     pure code
  |
  v
synthesizeFromPlan                     one LLM call
  |
  v
validateSynthesis                      pure code
  |  one repair call when needed
  |  mark failed fields when repair fails
  v
ArtifactSynthesis
```

The central change is at the boundary between the ledger and the writer. The
writer receives the plan, which contains the verified claims, their counts,
their citations, and the artifact facts. It does not receive the raw
monologues. As a result, it can choose wording for a finding, but it cannot
introduce a count or a quotation that is not already in the plan.

### 2.2 Stage 1: extract the artifact profile

The artifact profile is a small structured record of what the artifact states.
It contains `contentKind`, a list of facts, the questions the artifact leaves
open, the kind of stage anchor the text supports, and a confidence level.

The profile is extracted before the persona analysis because `contentKind`
chooses the decision question. A landing page asks whether the reader will take
the next step. A feature brief asks whether the reader will adopt the product
at work. A video script asks whether the reader will keep watching and act. If
the pipeline detected the content kind after the personas had started, the
frames would already contain the wrong question.

The profile extractor sees the same artifact the persona sees. For a text run,
it sees the text. For a visual run, it sees the screenshot. For a URL run, it
sees the screenshot and the cleaned page content when that content is
available. It copies exact strings. It does not round a price, infer a missing
tier, or fill a fact from general knowledge. When the artifact does not state a
fact, the fact goes into `openQuestions`.

The profile call is serial, so it adds latency before the first persona starts.
The expected cost is 5 to 20 seconds. The alternative is a cheaper classifier
for content kind plus a profile call that runs later, but that would give the
frames a provisional question. The design accepts one serial call because a
wrong question contaminates every persona response.

If the profile call fails, the run continues with a fallback profile. A text
run becomes `document`; a site run becomes `landing_page`. The facts are empty,
the anchor kind is `none` for a site and `quote` for text, and the confidence is
`low`. The report marks the facts as unverified. A degraded report is better
than a missing run, but the degradation is visible.

### 2.3 Stage 2: build one frame per persona

A frame is the per-persona description of the evaluation task. It contains the
persona's role, the task that role performs, the entry point where the persona
starts, the decision question for the content kind, and the persona's current
alternative and switching trigger when those are known.

The frame is built by code from the persona and the artifact profile. It does
not call a model. The role comes from the persona when the persona has one. If
the persona has no role, the frame uses `daily_user` and records
`decisionRoleSource: "fallback"`, so the report can say the role was inferred.

The role changes which parts of the artifact the persona examines closely and
the order in which it examines them:

| Role | Task in the evaluation | Starting point |
|---|---|---|
| `economic_buyer` | Judge the money, payback, and risk of saying yes. | Price, terms, and proof of return. |
| `daily_user` | Judge the first use, the daily work, and the effort to switch. | The first task and the current workaround. |
| `blocker` | Judge what would stop you from approving this for your team. | Security, integration, migration, and support. |
| `champion` | Judge whether you could sell this internally and defend it. | Team pain, internal proof, and the ask. |

The role does not choose the verdict. Every persona chooses from the same four
verdicts after it reads the artifact. A blocker can adopt. An economic buyer can
reject. The role shapes the reasoning, and the fixed verdict set keeps the
answers comparable across roles.

The decision question depends only on the content kind:

| Content kind | Decision question |
|---|---|
| `landing_page` | Would you take the next step this page asks for? |
| `feature_brief` | Would you adopt this product in your work? |
| `pitch_deck` | Would you invest, partner, or buy after this deck? |
| `marketing_copy` | Would you act on this copy? |
| `video_script` | Would you keep watching and act on it? |
| `document` | Would you use this document to make a decision? |
| `other` | Would you act on this artifact? |

The frame is deterministic, so the same persona and artifact produce the same
task and starting point on every run. This removes one model decision from the
pipeline and makes role differences visible in the output.

### 2.4 Stage 3: run each persona

The monologue prompt receives the frame. The persona starts where its role
would start, reads from that starting point, and reacts in first person. It does
not receive the verdict set, and it is told not to decide a verdict. The
monologue remains a messy, partial reading rather than a structured report.

After the monologue, two calls run in parallel:

1. The core extraction maps the monologue into the existing `PersonaResponse`
   fields. It also returns one verdict, one decisive reason, and a verbatim
   quotation for that reason.
2. The claim pass reads the same monologue and returns 3 to 7 claims. Each claim
   has a topic, an observation, a stance, a verbatim quotation, and an optional
   cognitive stage.

The two calls run in parallel because both need only the monologue. The claim
pass is separate from the core extraction for three reasons:

1. The core extraction schema is already large. Adding claims increases the
   chance that the model truncates its JSON, and a truncated stream loses the
   whole persona response.
2. A failed claim pass leaves a usable persona response. The persona still has a
   verdict and a journey, and the ledger records that its claim set is missing.
3. The claim prompt has one job, so it is easier to constrain and easier to
   retry.

The claim pass does not run when the monologue call fails. A persona with no
monologue has no transcript, so it cannot produce a grounded claim.

The core extraction keeps the existing third-person identity rules. It adds one
rule: the persona must not adopt a role that the artifact assigns to its
reader. The role comes from the frame, not from the artifact's copy.

### 2.5 Stage 4: build the claim ledger

The ledger is the core of the design. It turns per-persona claims into cohort
counts without letting a model write a number.

The build has four steps.

**Step 1: check the quotations.** Code checks every claim's quotation against
the monologue it came from. If the quotation is not a verbatim substring, the
claim is dropped. The claim pass was already told to copy a complete sentence,
and this second check catches the cases where it paraphrased anyway.

**Step 2: check support.** The support gate receives all remaining claims in one
batch. For each claim, it compares the observation with the quotation and
returns one of three levels:

- `support`: the quotation supports the observation as written.
- `partial`: the quotation supports part of the observation, or a weaker
  version of it.
- `unsupported`: the quotation does not support the observation, or supports
  the opposite.

Only `support` claims enter the cohort ledger. `partial` and `unsupported`
claims stay on the persona response for inspection, but they cannot set a
count, a finding, or a split. The design does not try to rewrite a `partial`
claim, because a rewriting pass would add another model call and another chance
for the evidence and the observation to drift apart.

**Step 3: group the claims.** A clustering call receives the surviving claims
and groups the claims that make the same point. The prompt tells the model not
to merge different causes. "The price is high" and "the free plan is missing"
are different topics even when both make the persona hesitate. Code validates
the grouping. Every claim id may appear at most once. Unknown ids are ignored.
A claim that appears in no group becomes a one-claim group, so it is not
silently lost.

**Step 4: count and cite.** Code computes every number:

- `personaCount` is the number of distinct persona ids in the group.
- `supports`, `opposes`, and `neutral` count distinct personas on each side.
- A citation is built from a claim's persona id, persona name, and verbatim
  quotation.
- The verdict counts are copied from the persona responses, with a missing or
  invalid verdict treated as `undecided`.

The count rule matters. If one persona makes two claims on the same topic, that
persona still counts once. If a persona makes one claim for and one claim
against the same topic, the later claim wins by claim order and the ledger logs
a duplicate-persona conflict. That is a data defect to inspect, not a count to
inflate.

If the support call fails, the pipeline retries the batch once. If the retry
also fails, the run fails and no synthesis is saved. The design does not fall
back to unverified claims or to a report built from verdicts alone, because the
support gate is the guarantee that a claim can count.

### 2.6 Stage 5: write from the plan

The plan is built by code from the ledger and the artifact profile. It contains
the research question, the profile, the ledger, the findings that have enough
personas, the splits, the frictions, and the completion counts. It does not
contain a raw transcript.

The writer receives the plan and returns only language:

- an overview;
- a research-question answer;
- a wording for each finding, keyed by group id;
- labels for the two sides of each disagreement, keyed by group id;
- a wording for each friction, keyed by group id.

The writer never writes a count, a percentage, a citation, or a persona name.
Code joins the returned group ids to the groups and fills in the counts and
citations. An unknown group id is dropped. A missing finding is allowed; code
can produce a deterministic finding from the group.

The final `ArtifactSynthesis` is assembled as follows:

- `topFindings` come from the writer's group ids, joined to the groups.
- `affectedPersonaCount` comes from `group.personaCount`.
- `totalPersonaCount` is the completed count.
- `citations` come from the group.
- `evidence` is the first citation quotation.
- `confidence` is derived from the ratio of personas in the group to completed
  personas. At least 75 percent is `strongly supported`, at least 40 percent is
  `some support`, and below 40 percent is `weakly supported`.
- `disagreements` come from the split groups. If the supporting and opposing
  personas do not cover every completed persona, code adds a `No clear view`
  bucket for the remainder, so the split sums to the completed count.
- `biggestFrictions` come from the friction groups.
- `overview` and `researchQuestionAnswer` come from the writer, then pass the
  validator.

The writer never sees the raw monologues because the plan already holds the
verified claims and their citations. The counts in the report therefore come
from the ledger, and the writer cannot make them drift.

### 2.7 Stage 6: validate and mark

The validator is pure code. It compares the assembled synthesis with the plan.

It checks that every count matches the ledger, that every disagreement split
sums to the completed count, and that every citation is a transcript substring.
It checks that every number in the prose comes from the ledger or the fact
sheet, or is a value code derived from them. It checks that "all" means every
completed persona, "most" means more than half, and "none" means zero. It checks
that the aggregate contains no persona names and no recommendations.

If the validator finds a violation, the pipeline makes one repair call. The
repair call receives the plan, the draft, and the violation list. It does not
receive the raw transcripts. If the repaired draft still fails, the run keeps
the draft and marks the exact fields that failed. The marks are inline on the
findings, splits, or sentences that failed, and the same violations are stored
in `validationWarnings` on `ArtifactSynthesis`.

The design does not replace the whole draft with a plain fallback. A marked
field is visible, so a reader can see which sentence or count failed. The
verification run allows at most one marked field per run. A missing claim set
counts as one marked field. Production can show more than one, but each one is
marked, and the quality gate fails the run.

A true plain report is better than a specific invented one. A marked specific
report is acceptable only because the mark is unavoidable and the marked share
is measured.

## 3. Interfaces

This section specifies the types, ports, and use-case boundaries that carry the
mechanism.

### 3.1 Persona fields

`Persona` gains three optional fields. `PersonaProfile` gains the role so the
report can show it without loading the full persona.

```ts
export type DecisionRole =
  | "economic_buyer"
  | "daily_user"
  | "blocker"
  | "champion";

export interface Persona {
  // ... existing fields unchanged

  /** Role for an artifact decision. Optional for older personas. */
  decisionRole?: DecisionRole;
  /** What the persona uses today instead of this product. */
  currentAlternative?: string;
  /** What would make the persona change from that alternative. */
  switchingTrigger?: string;
}

export interface PersonaProfile {
  // ... existing fields unchanged
  decisionRole?: DecisionRole;
}
```

Every persona generation mode adds these fields when it can infer them. If the
audience description names a role, the generator uses it. If the batch has a
mix, the generator assigns roles that fit the batch. It does not force four
roles into a batch that contains two support leads. If the role is unknown, the
field stays absent and the frame marks the fallback.

`currentAlternative` and `switchingTrigger` are optional because the design
must not invent a tool, a budget, or a trigger. The monologue prompt says "not
stated" when the field is absent.

### 3.2 Frame

```ts
export interface SimulationFrame {
  personaId: string;
  decisionRole: DecisionRole;
  /** Whether the role came from the persona or the fallback. */
  decisionRoleSource: "persona" | "fallback";
  roleTask: string;
  entryPoint: string;
  decisionQuestion: string;
  currentAlternative?: string;
  switchingTrigger?: string;
}
```

`buildSimulationFrames(personas, profile)` is pure code. A role from the persona
sets `decisionRoleSource: "persona"`. A missing role becomes `daily_user` with
`decisionRoleSource: "fallback"`.

### 3.3 Verdict and response fields

```ts
export const VERDICTS = ["adopt", "trial", "reject", "undecided"] as const;
export type Verdict = (typeof VERDICTS)[number];

export interface PersonaResponse {
  // ... existing fields unchanged
  verdict?: Verdict;
  decisiveReason?: string;
  /** Verbatim sentence from rawAnalysis. */
  decisiveReasonQuote?: string;
  claims?: PersonaClaim[];
  decisionFrame?: SimulationFrame;
}
```

The verdict set is fixed. Do not generate a new set for a role, an artifact, or
a run. A missing or invalid verdict from the model becomes `undecided`, so the
verdict counts still sum to the completed count.

### 3.4 Artifact profile and facts

```ts
export type ContentKind =
  | "landing_page"
  | "feature_brief"
  | "pitch_deck"
  | "marketing_copy"
  | "video_script"
  | "document"
  | "other";

export type FactKind =
  | "product"
  | "audience"
  | "offer"
  | "price"
  | "tier"
  | "claim"
  | "cta"
  | "proof";

export interface ArtifactFact {
  kind: FactKind;
  label: string;
  value: string;
  /** Verbatim from text, or visible text from the screenshot. */
  sourceQuote?: string;
  /** Code can check text quotes; screenshot quotes are model-only. */
  source: "text" | "screenshot";
}

export interface PriceFact extends ArtifactFact {
  kind: "price";
  amount: number;
  currency: string;
  period?: "month" | "year" | "one_time";
}

export interface ArtifactProfile {
  contentKind: ContentKind;
  facts: ArtifactFact[];
  /** Facts the artifact does not state. The report must not guess them. */
  openQuestions: string[];
  stageAnchorKind: "timestamp" | "heading" | "quote" | "none";
  confidence: "high" | "medium" | "low";
  /** Non-empty when extraction failed and the run uses a fallback. */
  degraded: string[];
}
```

The profile extractor returns exact strings. It does not round a price and does
not infer a missing tier. A fact that is not present goes into `openQuestions`.
A fact from a text artifact can be checked by code. A fact from a screenshot is
marked `source: "screenshot"` because code can check the model's quotation only
when the text is available.

### 3.5 Stage anchors

```ts
export type StageAnchor =
  | { kind: "timestamp"; value: string } // 0:42 or 01:02:03
  | { kind: "heading"; value: string }   // verbatim heading
  | { kind: "quote"; value: string };    // verbatim phrase

export interface StageJourney {
  // ... existing fields unchanged
  anchor?: StageAnchor;
}
```

The artifact profile chooses the allowed anchor:

- `video_script`: timestamps. Every reached stage must have a timestamp, and
  the timestamps must rise across the reached stages. The terminal timestamp is
  the drop-off point.
- Text documents: headings when the text has them, otherwise verbatim quotes.
- Websites, screenshots, and `other`: no anchor. An anchor from the model is
  dropped.

Validation is mechanical. A timestamp matches `m:ss` or `h:mm:ss`. A heading or
quote is a verbatim substring. A stage anchor never changes the stage order.

### 3.6 Claims and ledger

```ts
export type ClaimStance = "supports" | "opposes" | "neutral";

export interface ExtractedClaim {
  topic: string;
  observation: string;
  stance: ClaimStance;
  quote: string;
  stage?: CognitiveStage;
}

export interface PersonaClaim extends ExtractedClaim {
  id: string;
  personaId: string;
}

export type SupportLevel = "support" | "partial" | "unsupported";

export interface ClaimSupport {
  claimId: string;
  level: SupportLevel;
  reason: string;
}

export interface ClaimGroup {
  id: string;
  topic: string;
  claims: PersonaClaim[];
  personaCount: number;
  supports: number;
  opposes: number;
  neutral: number;
  stage?: CognitiveStage;
  citations: EvidenceCitation[];
}

export interface ClaimLedger {
  groups: ClaimGroup[];
  verdicts: Record<Verdict, number>;
  completedCount: number;
  failedCount: number;
  totalPersonaCount: number;
  missingClaimPersonaIds: string[];
  rejectedClaims: Array<{
    claim: PersonaClaim;
    level: SupportLevel;
    reason: string;
  }>;
  degraded: string[];
}
```

`PersonaClaim.id` is assigned by code as `personaId:index`. The claim pass does
not generate ids, because a model-generated id can collide or change between
retries.

### 3.7 Plan and synthesis

```ts
export interface SynthesisPlan {
  researchQuestion: string;
  profile: ArtifactProfile;
  ledger: ClaimLedger;
  /** Groups at the cohort-size finding floor. */
  findings: ClaimGroup[];
  /** Groups with support and opposition. */
  splits: ClaimGroup[];
  /** Groups with at least two opposing personas. */
  frictions: ClaimGroup[];
  completedCount: number;
  failedCount: number;
  totalPersonaCount: number;
}

export interface SynthesisDraft {
  overview: string;
  researchQuestionAnswer: string;
  findings: Array<{
    groupId: string;
    observation: string;
    impact: string;
  }>;
  disagreements: Array<{
    groupId: string;
    supportsLabel: string;
    opposesLabel: string;
  }>;
  frictions: Array<{
    groupId: string;
    text: string;
  }>;
}
```

`buildSynthesisPlan(profile, ledger, totals)` is pure code. It selects groups,
not prose. A finding needs two distinct personas when the cohort has five or
fewer, and three when it has six or more. A one-persona cohort can use its
single persona. A split needs one supporting persona and one opposing persona.
A friction needs two opposing personas. The plan sorts by persona count and then
by support count.

`buildArtifactSynthesis(plan, draft)` is also pure code. It joins the draft to
the plan, fills counts and citations, adds the `No clear view` bucket when
needed, and copies the new optional fields into `ArtifactSynthesis`.

```ts
export interface ArtifactSynthesis {
  // ... existing fields unchanged
  verdicts?: Record<Verdict, number>;
  claimGroups?: ClaimGroup[];
  facts?: ArtifactFact[];
  contentKind?: ContentKind;
  degraded?: string[];
  /** Fields the validator rejected after the repair attempt. */
  validationWarnings?: string[];
}
```

The report surface shows `validationWarnings` in a banner and marks the same
fields inline. A saved report keeps the warning after reload. PDF export stays
available, and the PDF stamps the warning and the violations on every page. The
warning is not a substitute for the ledger; it identifies the exact fields that
failed.

### 3.8 Ports and use cases

`LlmServicePort` gains six methods:

```ts
extractArtifactProfile(
  intake: ArtifactIntake,
  framing: ArtifactFraming,
  options?: { runId?: string },
): Promise<ArtifactProfile>;

extractPersonaClaims(
  persona: Persona,
  monologue: string,
  options?: { runId?: string },
): Promise<ExtractedClaim[]>;

verifyClaimSupport(
  claims: Array<{ claimId: string; observation: string; quote: string }>,
  options?: { runId?: string },
): Promise<ClaimSupport[]>;

clusterClaims(
  claims: Array<{ claimId: string; topic: string; observation: string }>,
  options?: { runId?: string },
): Promise<Array<{ topic: string; claimIds: string[] }>>;

synthesizeFromPlan(
  plan: SynthesisPlan,
  options?: { runId?: string },
): Promise<SynthesisDraft>;

repairSynthesis(
  plan: SynthesisPlan,
  draft: SynthesisDraft,
  violations: string[],
  options?: { runId?: string },
): Promise<SynthesisDraft>;
```

`AnalyzeArtifactUseCase` returns an `ArtifactAnalysisRun` instead of a bare
`PersonaResponse[]`:

```ts
export interface ArtifactAnalysisRun {
  responses: PersonaResponse[];
  profile: ArtifactProfile;
  frames: SimulationFrame[];
}
```

The use case still performs intake and persona analysis. It extracts the profile
once after intake, builds the frames in code, and passes the frame to both the
monologue and extraction calls. It does not build the ledger or the synthesis.

`BuildClaimLedgerUseCase` runs the support gate and the cluster call in
parallel after all responses settle. It then calls `buildClaimLedger` with the
model results and the responses.

`SynthesizeArtifactResultsUseCase` now accepts a `SynthesisPlan` and returns
`ArtifactSynthesis`. It calls `synthesizeFromPlan`, builds the final synthesis
in code, validates it, and repairs or falls back once. It no longer reads
transcripts.

### 3.9 Prompt contracts

The prompts carry the rules that code cannot enforce.

**Monologue.** The prompt adds the frame: the role task, the entry point, the
current alternative, and the switching trigger. It tells the persona to start
where the role would start and not to decide a verdict. The persona still writes
in first person and still does not see the verdict enum.

**Extraction.** The prompt adds the decision question, the fixed verdict set,
the decisive reason and its quotation, the content kind, and the stage anchor
rule. It also adds the identity rule: do not adopt a role the artifact assigns
to its reader. The role comes from the frame.

**Claims.** The prompt asks for 3 to 7 claims. Each claim needs a topic, a
one-sentence observation, a stance, a complete quotation from the transcript,
and an optional stage. It says: "No quote, no claim." It does not ask for a
verdict or a recommendation.

**Support gate.** The prompt compares one observation with one quotation and
returns `support`, `partial`, or `unsupported`, plus a short reason. It is one
batch call. It may not use outside knowledge and may not add facts.

**Clustering.** The prompt groups claims by the underlying topic. It must not
merge different causes. Every claim id appears at most once, or not at all. It
does not create or edit claims.

**Synthesis.** The prompt receives the plan. It must use the plan's counts,
citations, and facts, and it must return a group id for every finding,
disagreement, and friction. It may not add a persona name, a citation, a count,
or a recommendation. If the plan has no supported finding, it says so.

**Profile.** The prompt extracts exact facts, the content kind, and the anchor
kind. It must copy exact strings, never round a price, never infer a missing
tier, and put missing facts in `openQuestions`.

### 3.10 Failure paths

| Failure | Behaviour | What the reader sees |
|---|---|---|
| Artifact profile fails | Fallback profile, `degraded` set | Report runs; facts are marked unverified |
| Content kind is low confidence | Fallback content kind | Report runs; no invented stage anchors |
| Monologue fails | Degraded persona response | Failed count rises; persona excluded |
| Core extraction fails | Degraded persona response | Failed count rises; persona excluded |
| Claim pass fails | Persona response survives with no claims | Completed count stays; missing claim set counts as one marked field |
| Claim quotation is not a substring | Claim dropped | Claim cannot set a count or finding |
| Support gate fails | Retry once, then fail the run | Error state; no synthesis saved |
| A support result is missing | Treated as unsupported | Claim cannot count |
| Clustering fails | Retry once, then each claim becomes a one-claim group | No cohort finding from single-persona groups |
| Clustering merges different topics | Bad merge survives if ids are valid | Quality harness must catch it |
| Verdict is missing or invalid | Treated as `undecided` | Verdict counts still sum |
| Split does not cover everyone | Add `No clear view` | The split sums to completed |
| Validator fails | One repair, then show the draft with inline marks and `validationWarnings` | Marked fields are visible; QA allows one per run |
| Fact sheet says $49 and prose says $99 | Validator rejects and marks the field | Repair or marked field; wrong price is not silently shown |
| Video anchor is missing | Stage remains without an anchor | Quality harness fails the run; no invented timestamp |
| All personas fail | Run rejects | Error state |

The design fails the run when the support gate cannot verify claims. It shows a
marked draft only when the ledger exists and the writer's prose fails its
checks. The QA gate allows at most one marked field per run. The target is zero.

### 3.11 Invariants

1. The verdict counts sum to `completedCount`.
2. Every claim in a group has a verbatim quotation in that persona's monologue.
3. A claim without a support level of `support` cannot enter a group.
4. `personaCount` is a distinct-persona count, never a claim count.
5. A disagreement split sums to `completedCount`.
6. Every citation is a verbatim monologue substring.
7. Every unmarked number in the prose is in the ledger or the fact sheet, or is
   derived by code from them.
8. "All" means every completed persona. "Most" means more than half. "None"
   means zero.
9. A video anchor is a timestamp and rises across stages. A text anchor is
   verbatim. A site anchor does not exist.
10. The verdict enum is fixed.
11. A role never implies a verdict.
12. The aggregate report contains no persona names and no recommendations.
13. The synthesis writer never receives raw monologues.
14. A marked field appears both inline and in `validationWarnings`.
15. The QA run allows at most one marked field. A missing claim set counts as
    one marked field.
16. PDF export is available with warnings and stamps the warning on every page.

## 4. Trade-offs

This section records the alternatives considered and the cost of the chosen
option.

### 4.1 Separate claim pass instead of extending the extraction

Extending `extractPersonaResponse` with claims would save one call per persona.
It would also enlarge an already large schema. The current extraction has a
minimum output budget of 8,000 tokens because a smaller budget truncated a
verbose persona. Adding claims to that schema increases the chance of a
truncation on every persona. A separate claim pass costs one call per persona,
but it can fail without losing the persona response, and it can be retried on
its own.

The design chooses the separate pass. The added call runs in parallel with the
core extraction, so the wall-clock cost is smaller than the call count suggests.

### 4.2 Role in the persona, frame in the run

A role could be generated per run, which would make it more artifact-specific.
That would add an LLM call and allow the role to drift between runs. A role
could also live only on the persona, which would be stable but could be wrong
for a new artifact.

The design stores the role on the persona when generation can infer it, then
builds the artifact-specific frame in code. The frame changes the task, entry
point, and decision question. The role stays stable. The cost is that a persona
whose role changes across artifacts needs a new persona record. The design
accepts that cost because role stability makes the output easier to compare.

### 4.3 Content kind from the profile instead of a heuristic

A file-name or URL heuristic would cost nothing. It would also classify a video
script named `.txt` as a document. A separate classifier call would be more
accurate but would add another serial call.

The design lets the profile call return `contentKind` along with the facts. The
cost is one serial call before persona analysis. The benefit is that the
decision question and the stage-anchor rule come from the same reading of the
artifact. If the profile fails, the fallback is a heuristic, and the report
marks the profile as degraded.

### 4.4 Plan plus writer instead of code-only report

A code-only report would be deterministic. It would also be too plain for the
product. The design lets the writer choose wording for findings, splits, and
frictions, but code owns structure, counts, and citations. The writer receives a
plan, so it can produce specific language without inventing numbers.

The cost is one writer call and a validator. The benefit is that the report can
still read like a report rather than a table dump.

### 4.5 One batch support gate

A per-finding support call would have a smaller prompt and a simpler failure
boundary. It would also multiply calls and cost. The design uses one batch call
over all claims. If the batch fails, no claim enters the ledger. That is a hard
failure, but it is safer than accepting unverified claims.

### 4.6 Additive storage instead of a version bump

A storage version bump would let the code assume the new fields exist. It would
also discard old analyses, as the current `analysisStore` migration does for
older versions. The design keeps the new fields optional and leaves the store
at version 3. Old records render without the new sections, and new records gain
them. The cost is optional checks in the UI and the domain. The benefit is that
no saved analysis is lost.

## 5. Verification

This section describes the tests and the harness that can reject the design.

### 5.1 Acceptance tests

The tests are written from the requirement, not from the implementation. The
first three fail against today's pipeline.

| Test | Expected result | Mutation that must break it |
|---|---|---|
| Inverted quotation | Claim is dropped; it cannot count. | Remove the support filter. |
| Complete count | Three claims, one unsupported, reports 2 of 3. | Remove the distinct-persona count. |
| Complete split | One support, one oppose, one no view sums to 3. | Remove the `No clear view` bucket. |
| Video anchor | Terminal timestamp is 04:12 and rises. | Remove the timestamp check. |
| Role is not a verdict | A blocker can adopt. | Remove the frame. |
| Fact guard | $49 is allowed; $99 is rejected. | Remove the fact guard. |
| Quote grounding | A non-substring quote is dropped. | Remove the substring check. |
| Fixed verdicts | `maybe` is rejected. | Remove the enum. |
| No recommendations | "You should lower the price" fails. | Remove the style check. |
| Writer input | The plan has no raw transcript. | Add a transcript field. |
| Support failure | One retry, then the run rejects and saves no synthesis. | Remove the retry or the throw. |
| Marked-field budget | One missing claim set passes QA; two fail. | Remove the budget check. |
| Warning surface | A validation failure shows a banner and an inline mark. | Remove the warning field. |
| Finding floor | Two of five is a finding; two of six is not. | Remove the cohort-size branch. |

### 5.2 Current red proof

The current code fails the inverted-quotation test. On 2026-11-24, a disposable
test called `SynthesizeArtifactResultsUseCase` with three responses and a
synthesis finding whose observation was "The price is fair" and whose only
quotation was "I nearly choked at the price." The test expected no findings.
Current code returned one finding with three citations.

```text
bunx vitest run test/acceptance/option-c-red.test.ts
FAIL  drops a finding whose quote supports the opposite
expected [] to deeply equal [ { affectedPersonaCount: 3, citations: [ ... ] } ]
```

The test file was removed after the proof. The permanent tests are added with
S1.

### 5.3 Quality harness

Unit tests cannot prove the 8/10 floor. The design adds `scripts/quality-floor.ts`
for that proof.

The script runs the real pipeline ten times against a fixed artifact and writes
each raw run to `.sisyphus/quality-floor/<timestamp>/`. It runs the structural
gate first. Any invariant failure marks the run failed before review. The
structural gate also fails a run with more than one marked field; a missing
claim set counts as one.

For each run, the script creates ten fresh review contexts. A review sees only
the report, not the run id, the personas, or the other reviews. The six roles
are investor, founder, PM, marketer, growth, and engineer. Each review scores
specificity, grounding, differentiation, and actionability from 0 to 10 and
returns one JSON object. The script computes the median per run. The floor is
8.0.

The gate has two outcomes. A structurally green report with a 5/10 blind score
fails. A 9/10 blind score with a broken citation also fails.

The cost is 10 runs times 5 personas times 4 calls, plus 100 blind reviews. Run
the harness on the VPS, not a laptop, and cap the reviewer model. The cost is
why this is a separate slice.

## 6. Rollout

### 6.1 S1: claim ledger and derived report

S1 is the first slice. It adds the claim pass, the support gate, clustering,
the ledger, the plan, the writer, the validator, and the warning surface. It
keeps the existing report shape and adds optional fields only. It does not touch
personas or intake. It adds a narrow warning UI: a banner and inline marks on
fields that already render. It also stamps the warning on PDF export.

Checkpoint: tests 1, 2, 3, 7, 9, and 10 pass. A real five-persona text run drops
an inverted claim and sums a split. A forced validation failure shows the
banner and the inline mark. The QA run has at most one marked field. The report
can be plain. It cannot carry an unmarked false field.

### 6.2 S2: decision frames and verdicts

S2 adds the role fields to `Persona` and `PersonaProfile`, builds frames in
code, adds the verdict and decisive reason to the response, changes the
monologue and extraction prompts, and adds the verdict mix to the report.

Checkpoint: a blocker can adopt, an economic buyer can reject, and the verdict
counts sum to the completed count. Run a blind differentiation check on one
fixed artifact.

### 6.3 S3: artifact profile and stage anchors

S3 adds the profile call, the facts, the content kind, the stage anchors, the
fact guard, and the anchor validator. It adds the facts and anchors to the
report.

Checkpoint: a video script produces a real terminal timestamp. A pricing page
with two tiers produces the exact prices, and the report cannot invent a third.

### 6.4 S4: quality harness

S4 adds `scripts/quality-floor.ts`, the six reviewer prompts, the structural
gate, and the summary writer. It runs ten artifacts, ten blind reviews, and six
roles.

Checkpoint: the gate can fail a run. The 8/10 floor is a median, not an average.
A single 9/10 run does not pass the gate.

### 6.5 Compatibility

`PersonaResponse` and `ArtifactSynthesis` fields are optional. Old persisted
records parse and render, and the UI hides the new sections when the fields are
absent. `Persona` fields are optional, so older personas get `daily_user` with
`decisionRoleSource: "fallback"`.

The IndexedDB store stays at version 3. The VPS API shape is additive. Deploy the
backend, restart the `kynd-backend` PM2 process, then deploy the frontend. The
client already tolerates missing optional fields.

`scripts/verify-output.ts` adds profile and ledger checks. It must fail a run
with an unsupported claim in a finding, a split that does not sum, or a price
that is not in the fact sheet.

## 7. Limits and open questions

This section records what the design does not solve and what still needs
measurement.

### 7.1 Limits

Five personas are not a representative sample. The report describes a cohort,
not a population. The counts say "of 5", not "of the market".

The support gate is not infallible. A plausible wrong claim can still pass. The
design makes an unsupported claim unable to set a count, and the blind review
catches what the gate misses.

The quality harness is the only evidence for the 8/10 floor. Unit tests and a
green structure check are not a quality score.

The design does not resolve the artifact's own ambiguity. If the page does not
state an annual price, the report says the annual price is not stated. It does
not fill the gap.

A persona's role may depend on the artifact. The design keeps the role on the
persona and builds the task in the frame. A future artifact-specific role needs
a new persona record or a deliberate override.

### 7.2 Open questions

| ID | Question | Why it matters |
|---|---|---|
| IOU-1 | How many claims fit in the claim pass at five personas? | Sets a hard output budget and a retry limit. |
| IOU-2 | Does the support batch stay under the model context at 50 claims? | Sets the batch split threshold. |
| IOU-3 | Does role generation work in legacy, strategy, and research modes? | Role coverage differs by generation mode. |
| IOU-4 | Can a screenshot fact quotation be checked without page text? | The fact guard is numeric only for screenshots. |
| IOU-5 | How often does clustering merge different objections? | A bad merge hides a real split. |
| IOU-6 | What is the added median wall time at five personas? | Decides whether the serial profile call is acceptable. |
| IOU-7 | Does `No clear view` help the reader or dilute the split? | The reviewer decides whether to keep the bucket. |

## 8. Next step

Run `jnk-implement` for S1. The first checkpoint is the claim ledger and the
derived report. Do not start with S2 or S3.
