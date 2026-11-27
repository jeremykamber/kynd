# Squawks — Option C quality system

One line per squawk: `[squawk] severity | area | finding | why deferred`.
Nothing here blocks the structural core shipped in this branch.

[squawk] P1 | quality floor | Both blind rounds miss the 8.0 floor: the original S4 median is 7.25/10, the corrected six-case pooled result is 7.12/10, 0/6 corrected cases reach 8.0, and grounding stays at 6.0 | The remaining gap is the evidence model, not prompt wording; closing it needs a new extraction/support design and its own eval. Readers must treat the report as a hypothesis engine, not a replacement for real research.
[squawk] P1 | benchmark validity | The corrected benchmark uses six synthetic artifacts and model-generated personas; representativeness, per-artifact difficulty, and reviewer calibration are unproven | A human baseline and real audience transcripts are needed; that is data collection and reviewer design, not a code change in this branch.
[squawk] P2 | audience selection | The pitch-deck case needs an investor batch, but production stores only the batch name; it does not store why that batch was selected, so a buyer/investor mismatch is visible only after the run | Persisting the selection reason and validating it against the artifact kind is a schema and intake change; the corrected investor batch lives only in the benchmark.
[squawk] P2 | benchmark variants | The corrected A/B/C variants (partial-support, decision memo, red-team) and the artifact-aware variants did not beat the shipped core; the best was B2 at 7.12/10 | They add unmeasured paths and were deliberately left off this branch. The experiment commit is preserved at `explore/option-c-corrected-benchmark` (e8f90a3) for the next investigation.
