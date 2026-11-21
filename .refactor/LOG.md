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
