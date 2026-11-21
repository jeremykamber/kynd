# Refactor log

This file is the memory of the automated refactor steward. Every run appends one entry.
Entries are never rewritten; a later run that reverses an earlier decision adds a new entry
and says why.

Why this file exists:

- **No loops.** A run reads this before choosing work, so it does not redo a refactor that
  already landed.
- **Reasons survive.** A diff says what changed; this says why, and which alternative lost.
- **Doubts stay visible.** A trade-off recorded here is a question for a later run that has
  more evidence. If the codebase moved on, that run should answer it explicitly.

How to read it: newest entries at the bottom. Each entry names the smell, the change, the
principle behind it, what was verified, and what remains uncertain.

<!-- Entries below this line are appended by the steward. -->

## 2026-11-21 — smoke test of the PR body generator

- **Commit(s):** local only
- **Area:** src/lib
- **Smell(s):** none; this is a harness test
- **Change:** added one module that imports utils
- **Why:** prove the measured graph and delta render
- **Design-it-twice:** not applicable
- **Verified:** not run
- **Doubts / trade-offs:** delete this branch after the smoke test
- **Noticed, not fixed:** none
