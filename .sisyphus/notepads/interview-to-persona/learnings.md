2026-05-24: Created application-layer types for interview -> persona pipeline.

Notes:
- Kept interfaces pure, no methods.
- Placed file under src/application/interviewPipeline/types.ts as requested.
- LSP server not installed in environment; ran tsc which surfaced unrelated type errors in Persona tests (existing project CI errors). Our new file is type-correct.

Gotchas:
- The repo contains strict Persona interface used widely; adding application types did not require importing domain types.
