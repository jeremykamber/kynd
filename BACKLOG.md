# Product Backlog

## ✅ Done

### Phase 1-2: Foundation & Core Features
- [x] Hexagonal MVP Scaffold
- [x] Research-backed Persona Prompts
- [x] LlmServiceImpl (Consolidated Adapter)
- [x] BrowserService (Playwright)
- [x] Persona Chat Integration
- [x] Agentic Memory System

### Phase 3: Deep Evaluation & Refinement
- [x] LLM-as-Critic Validation (consistency check for backstory coherence) - PR #28, Mar 2026
- [x] Interactive Persona Chat - PR #6, Feb 2026
- [x] Live Screenshot Feed (500ms viewport capture during page load) - PR #6, Feb 2026
- [x] **InCharacter Psychometric Evaluation** — Interview-based persona fidelity evaluation using separate expert LLM (May 2026)
- [x] **PICon Multi-Turn Consistency Evaluation** — Internal, external, and retest consistency across 10-20 step sessions (May 2026)

### Phase 4: Behavioral Simulation & UX Flow
- [x] Visual Gaze Prediction (AI-predicted "Gaze Maps" based on persona goals) - PR #6, Feb 2026
- [x] Branded PDF Export (Initial) - PR #20, Feb 2026
- [x] **Persona Browser Agent Design** — 802-page design doc for persona-driven agentic browsing using Stagehand primitives (May 2026)
- [x] **Pricing Analysis Non-Streaming Overhaul** — Schema enforcement, timeout, HMR-safe stores, comprehensive logging (June 2026)

### Phase 5: Persona Inference System (Research-Backed)
- [x] **Literature Review** — 227-line academic lit review on inference-time persona construction methods, submitted for INFO 499 (Apr 2026)
- [x] **Compartmentalized Persona Prompts** — Four-component prompt architecture (identity, psychographics, epistemic boundaries, behavioral guardrails) to prevent attention dilution (May 2026)
- [x] **PB&J Psychological Scaffold Rationalization** — Big Five roots, cognitive-reflex decision style, core values & risk worldview rationales (May 2026)
- [x] **ID-RAG Identity Graph Retrieval** — Two-tier RAG: narrative backstory chunks + interview-derived chunks, retrieved at chat time with source metadata (May 2026)
- [x] **Interview-to-Persona Pipeline** — Full 7-step pipeline: ingest, extract signals, pool across participants, sample, generate personas, rationalize, ingest into ID-RAG (May 2026)
- [x] **Persona Variation Generation** — Big Five trait sliders with inline LLM streaming for persona variants (June 2026)

### Recent Enhancements (2026)
- [x] Complete UI & Design System Overhaul - PR #24 (Mar 2026)
- [x] Persona Token Limit for Monologue Generation - PR #29 (Mar 2026)
- [x] UI Refinements (Preview, Early Chat, Dialog Glitch, TypeError) - PR #25 (Mar 2026)
- [x] Rate Limiting for Audit Requests - PR #23 (Feb 2026)
- [x] Pricing Analysis via Image Upload - PR #22 (Feb 2026)
- [x] Image Upload Support for Pricing Analysis - PR #21 (Feb 2026)
- [x] Adaptive Pricing Scouting - PR #19 (Feb 2026)
- [x] Chat History Preservation (localStorage) - PR #22 (Feb 2026)
- [x] HTML Summarization and Viewport Capture - PR #19 (Feb 2026)
- [x] **Design System Refresh** — Cerulean blue accent, refined tokens, sonner toasts, button hierarchy (June 2026)
- [x] **Persistent Persona Store** — Zustand + localStorage persist, sidebar nav, batch history (May 2026)
- [x] **Simulations Pages** — List + detail views with progress polling (June 2026)
- [x] **Interview Upload Page** — File drag-drop with pipeline integration (May 2026)
- [x] **Comprehensive Test Suite** — 44 new tests (unit + integration + E2E) for persona inference system + pricing analysis (May-June 2026)

---

## 🚧 In Progress

### Phase 4: Behavioral Simulation & UX Flow
- [ ] **Agentic Browser Interaction**: Implement the persona-driven browser agent from the design doc — custom agent loop on top of Stagehand `act()`/`extract()`/`observe()` with persona anchor injection between steps, structured step-by-step narrative output, and emotional reflection tracking
- [ ] **Persona Browser Agent: Production Hardening**: Error recovery, timeout handling, session persistence, multi-page navigation, CDP/remote browser support

### Pricing Analysis
- [ ] **Pricing Analysis OMO Fixes**: Address issues identified in the pricing page analysis plan — edge cases in non-streaming flow, analysis quality improvements, error state handling

---

## 📋 TODO (Future Phases)

### Phase 3: Deep Evaluation & Refinement (P2)
- [ ] **Economic Environment Toggles** (P2): Simulate Recession vs. Growth conditions — interesting but far-term, not blocking current work
- [ ] **Comparative Perspective View** (P2): Side-by-side comparison of persona views — still wanted but needs redesigned format

### Phase 5: Team Collaboration & Reporting
- [ ] Branded PDF Export (Refinement)
- [ ] Unified Cohort Reports
- [ ] Team Workspaces
- [ ] Stakeholder Annotations

### Phase 6: Integration & Ecosystem
- [ ] CRM / Segment Integration
- [ ] CI/CD Pricing Audit CLI
- [ ] Chrome Extension
- [ ] Webhooks

---

### Observability & Debugging (P3)
- [ ] **Client-Side Log Sink**: Lightweight `ClientLogger` that mirrors `console.log` calls to a `POST /api/vps/client-logs` endpoint, appending client-side trace events (cancel, polling, stream arrival) into the per-run `AnalysisLogger` JSONL file
- [ ] **Log Viewer Page**: Admin UI at `/admin/logs/{runId}` to read and search per-run structured logs without SSH access
- [ ] **Log Level Configuration**: `LOG_LEVEL` env var to suppress TRACE/DEBUG in production while keeping the instrumentation in place for when it's needed

## Priority Key

| Label | Meaning |
|-------|---------|
| **P0** | Blocking — must do now |
| **P1** | This sprint / next sprint |
| **P2** | This quarter |
| **P3** | Backlog — revisit later |
