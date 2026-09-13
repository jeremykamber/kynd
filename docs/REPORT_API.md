# Report API

A JSON API endpoint that runs artifact analysis with AI personas. It accepts an
artifact (URL or pre-captured screenshot) plus a set of personas, and returns one
`PersonaResponse` per persona. Useful for automated test loops, batch processing,
and programmatic integration.

## Endpoint

```
POST /api/report
```

## Quick Start

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com/pricing",
    "personas": [
      {
        "id": "persona-1",
        "name": "Sarah Chen",
        "age": 32,
        "occupation": "Senior Software Engineer",
        "educationLevel": "M.S. Computer Science",
        "interests": ["AI/ML", "open source"],
        "goals": ["Evaluate ROI", "justify expense to manager"],
        "conscientiousness": 85,
        "neuroticism": 25,
        "openness": 90,
        "extraversion": 45,
        "agreeableness": 60,
        "values": ["efficiency", "transparency"],
        "fears": ["vendor lock-in"],
        "communicationStyle": "direct and technical",
        "decisionStyle": "data-driven"
      }
    ]
  }'
```

## Request

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | `string` | Yes | Target artifact URL |
| `personas` | `Persona[]` | Yes | Non-empty array of persona objects |
| `imageBase64` | `string` | No | Pre-captured screenshot; skips browser capture |

A `requestId` may not be supplied by the caller — the route generates one for
each request.

### Persona Object

The route validates only `id` and `name`; every other field is optional but
drives the quality of the analysis. Full schema in
[`src/domain/entities/Persona.ts`](../src/domain/entities/Persona.ts).

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier for this persona |
| `name` | `string` | Yes | Display name |
| `age` | `number` | No | Age |
| `occupation` | `string` | No | Job title or role |
| `educationLevel` | `string` | No | Highest education attained |
| `interests` | `string[]` | No | Personal interests |
| `goals` | `string[]` | No | What they're trying to accomplish |
| `conscientiousness` | `number` | No | 0-100: Meticulous vs Chaotic |
| `neuroticism` | `number` | No | 0-100: Anxious vs Stable |
| `openness` | `number` | No | 0-100: Curious vs Traditional |
| `extraversion` | `number` | No | 0-100: Outgoing vs Solitary |
| `agreeableness` | `number` | No | 0-100: Compassionate vs Competitive |
| `values` | `string[]` | No | Core values that drive decisions |
| `fears` | `string[]` | No | Anxieties and risk concerns |
| `communicationStyle` | `string` | No | How they speak |
| `decisionStyle` | `string` | No | How they decide |
| `backstory` | `string` | No | Pre-generated persona backstory |

### Minimal Persona Example

```json
{
  "id": "tech-buyer-1",
  "name": "Alex Rivera"
}
```

For meaningful analysis, also provide `occupation`, `goals`, `values`, `fears`,
and the Big Five scores.

## Response

### Success (200 OK)

```json
{
  "requestId": "report-1745034567890-a1b2c",
  "url": "https://example.com/pricing",
  "personaCount": 1,
  "analyses": [
    {
      "id": "Sarah_Chen-1745034567891",
      "artifactUrl": "https://example.com/pricing",
      "screenshotBase64": "/9j/4AAQSkZJRg...",
      "rawAnalysis": "Full reasoning transcript for this persona...",
      "overview": "High-level summary of this persona's response...",
      "customerJourney": [
        {
          "stage": "interpretation",
          "description": "What the persona experienced at this stage.",
          "sentiment": "neutral",
          "outcome": "succeeded",
          "transition": "What caused progression to the next stage."
        }
      ],
      "researchQuestionAnswer": "Direct answer to the research question...",
      "majorFindings": [
        {
          "observation": "What happened — a specific behavior or reaction.",
          "evidence": "What the persona experienced that supports it.",
          "impact": "Why this matters for the persona's experience."
        }
      ],
      "pointsOfFriction": [
        "Annual-only billing is not stated until checkout"
      ],
      "unansweredQuestions": [
        "Is there a usage cap on the middle tier?"
      ],
      "personaProfile": {
        "name": "Sarah Chen",
        "occupation": "Senior Software Engineer",
        "bigFive": {
          "conscientiousness": 85,
          "neuroticism": 25,
          "openness": 90,
          "extraversion": 45,
          "agreeableness": 60
        },
        "values": ["efficiency", "transparency"],
        "fears": ["vendor lock-in"],
        "communicationStyle": "direct and technical",
        "decisionStyle": "data-driven"
      },
      "personaId": "persona-1"
    }
  ]
}
```

The top-level response is `{ requestId, url, personaCount, analyses }`.
Each entry of `analyses` is a `PersonaResponse` — see
[`src/domain/entities/PersonaResponse.ts`](../src/domain/entities/PersonaResponse.ts)
for the authoritative type.

### PersonaResponse Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Per-response ID (`<name>-<timestamp>`) |
| `artifactUrl` | `string?` | Analyzed URL |
| `screenshotBase64` | `string` | Captured viewport as base64 JPEG |
| `rawAnalysis` | `string` | Raw stream content for this persona |
| `overview` | `string` | High-level summary of the persona's full journey |
| `customerJourney` | `StageJourney[]` | Experience across all five cognitive stages, in order |
| `researchQuestionAnswer` | `string` | Answer to the research question, grounded in this persona's analysis |
| `majorFindings` | `MajorFinding[]` | Key findings (observation, evidence, impact) |
| `pointsOfFriction` | `string[]` | Moments the persona failed to progress |
| `unansweredQuestions` | `string[]` | Questions the persona still had |
| `personaProfile` | `PersonaProfile?` | Lightweight display projection of the persona |
| `personaId` | `string?` | Matches the input persona's `id` |

`StageJourney.stage` is one of `interpretation`, `understanding`, `belief`,
`motivation`, `action`, and must appear exactly once each, in that order.
`StageJourney.sentiment` is `positive` / `neutral` / `negative`;
`StageJourney.outcome` is `succeeded` / `blocked` / `stopped`.

### Error Responses

**400 Bad Request** — invalid input:

```json
{
  "error": "Missing or invalid 'personas' parameter - must be a non-empty array"
}
```

Per-persona validation errors name the index:

```json
{
  "error": "Invalid persona at index 1: missing or invalid 'id' field"
}
```

`url` is validated after the persona array:

```json
{
  "error": "Missing or invalid 'url' parameter"
}
```

**500 Internal Server Error** — server-side failure:

```json
{
  "error": "Failed to navigate to page: timeout exceeded"
}
```

## Usage Examples

### Test Loop Integration

```typescript
async function runArtifactTests() {
  const personas = await generateTestPersonas(5);
  const results = [];

  for (const url of artifactUrls) {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, personas })
    });

    const data = await response.json();

    // Aggregate friction across personas
    const frictionCount = data.analyses.reduce(
      (sum: number, a: { pointsOfFriction: string[] }) => sum + a.pointsOfFriction.length,
      0
    );

    results.push({ url, frictionCount, raw: data });
  }

  return results;
}
```

### Batch Processing

```typescript
async function analyzeCompetitorPages(urls: string[]) {
  const persona = getBaselinePersona();

  const reports = await Promise.all(
    urls.map(url =>
      fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, personas: [persona] })
      }).then(r => r.json())
    )
  );

  return reports.map((report, i) => ({
    url: urls[i],
    findings: report.analyses[0].majorFindings.length,
    friction: report.analyses[0].pointsOfFriction
  }));
}
```

## Error Handling

Always check the HTTP status code and handle errors gracefully:

```typescript
async function fetchReport(url: string, personas: Persona[]) {
  const response = await fetch('/api/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, personas })
  });

  if (!response.ok) {
    const error = await response.json();

    if (response.status === 400) {
      throw new ValidationError(error.error);
    } else {
      throw new AnalysisError(error.error);
    }
  }

  return response.json();
}
```

## Performance Tips

1. **Parallel requests**: process multiple URLs concurrently
2. **Reuse personas**: generate personas once, cache and reuse across requests
3. **Pre-capture screenshots**: use `imageBase64` to skip browser capture when
   you already have a screenshot
4. **Persona count**: each persona adds one analysis pass; keep batches sized to
   your latency budget

## Related

- [Architecture Guide](../ARCHITECTURE.md) - System design and patterns
- [Artifact Analysis Flow](./ARTIFACT_ANALYSIS_FLOW.md) - Canonical pipeline
- [PersonaResponse Entity](../src/domain/entities/PersonaResponse.ts) - Response type definitions
- [Generate Personas Action](../src/actions/generatePersonas.ts) - Create personas programmatically
