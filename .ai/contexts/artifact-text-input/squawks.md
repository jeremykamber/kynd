# Squawks — text artifact input

One line per squawk: `[squawk] severity | area | finding | why deferred`.
Everything here was found and *not* fixed on this branch. Nothing in this list
blocks the feature; each row names what it costs.

[squawk] high | synthesis | All five blind reviews of clean runs found the synthesis layer inflating or inverting persona counts and consensus — e.g. "all three flagged" when one persona said it, a 1-vs-4 meeting split reported as 4-vs-1 (05.json:637, 07.json:435) — while the per-persona transcripts and quotes check out | Pre-existing synthesis prompt, outside this brief; changing it needs its own eval across URL and screenshot runs, which this branch cannot run (see credits row)

[squawk] high | evidence | The 10-run matrix is 5/5 clean, not 10/10: runs 01-04 and 10 have no clean result because the OpenRouter account hit zero credits mid-mission (402 "requires more credits"; `E2-blocked-credits.json` shows total_credits 11, total_usage 11.12) | Needs ~$10-15 of credits; the runner is fixed and will record code_sha + a green gate on every run once funded

[squawk] high | deployment | No deployed-backend proof: F4 (PM2 restart + real text analysis through `/api/vps/analyze`) needs a live LLM call, which the exhausted balance refuses | Same credits blocker; the branch is pushed and the restart command is in the report

[squawk] high | analysis schema | The five-stage journey is a purchase funnel, and a video script has no purchase: run 09's personas had to express "would I keep watching" through interpretation → understanding → belief → motivation → action, and the synthesis inherited that frame | Changing the stage model is a product redesign with eval work, not a mechanical fix

[squawk] medium | personas | Persona batches are homogeneous: in run 06 the same eight personas open several monologues with near-identical sentences and all eight raise the "why five" objection, so a "7 of 8 flagged" count overstates independent corroboration | Diversity is a persona-generation property; the synthesis now counts *cited* personas, but two templated personas still count as two

[squawk] medium | synthesis | A persona can still pick up the artifact's own role labels: run 08's Sky is "a skeptical, experienced freelancer" in the overview while the profile says Head of Marketing (the artifact mentions a freelancer) | The mechanical half is in (name/"the user"/first person) and the prompt forbids the transfer, but detecting that "freelancer" contradicts "Head of Marketing" needs the artifact and the persona model in the same check

[squawk] medium | extraction | Scanned PDFs have no OCR; they fail with "No text layer found. Export a text-based PDF or upload a DOCX" instead of guessing | OCR is a new dependency with its own size and accuracy tradeoffs, not a normalization detail

[squawk] medium | extraction | `.doc` and `.ppt` are refused with export instructions rather than converted; PPTX follows slide XML order, drops speaker notes and chart data | No trustworthy pure-JS legacy-office converter; adding one would put a fragile binary parser in the browser bundle

[squawk] medium | UI | A 5-document cap means a user with six small files must merge them, even under the 80,000-character budget | The cap bounds parse time and memory in the browser; revisiting it needs measurements, not a bigger number

[squawk] medium | harness | `scripts/verify-output.ts` style checks fail on real runs ("extraction speaks in first person", banned jargon) and now fail the process, so a run with good content can still exit 1 | The checks encode prompt guidance; whether they should be gating is a product call — the runner records them separately from degradation

[squawk] low | dev | A dev-overlay hydration error in `PrimaryNav` and a "state update on a component that hasn't mounted" warning appeared in one pre-fix session; 6 reloads per route on this branch and on a pristine `origin/dev` worktree show 0 afterwards | Not reproducible on either revision, so there is nothing to bisect; logged with the exact messages and the reproduction counts

[squawk] low | tests | `src/app/api/report/__tests__/route.test.ts` "should return 400 when url is missing" times out at 5s once in a full-suite run under load, and fails identically on pristine `origin/dev` | Pre-existing cold-import flake, unrelated to this branch; raising its timeout would hide a real isolation problem

[squawk] low | identity | Records written before `inputKind` existed keep `url: "Screenshot Upload"`; `analysisSourceLabel` maps them for display and the field is never rewritten | A migration would touch stored analyses for a cosmetic field; the read-side derivation is one function

[squawk] low | UI | The text tab edits an 80,000-character paste through a 16rem-tall scroll box | Bounded height keeps the counter, cap error and Run button on screen; a full-height editor would regress the thing the cap error is meant to show
