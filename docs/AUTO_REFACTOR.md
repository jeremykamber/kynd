# Automated refactor steward

A launchd job runs a refactoring pass on Kynd about every three days. It works in a throwaway
worktree branched from the latest `origin/dev`, verifies itself, and opens a pull request. It never
merges and never touches the checkout a human works in. It never adds features.

The goal is one thing: **less complexity**. The steward reduces dependencies and obscurity so the
code is easier to change. It does not chase metrics, formatting, or comment volume.

## How it works

```text
launchd (daily 03:17, caffeinate)
  └─ scripts/refactor/run.sh
       1. deterministic gate ── nothing new? open PR? exit. no tokens spent.
       2. worktree from origin/dev + bun install   (the human checkout is untouched)
       3. metrics: crap scores, dependency-cruiser, import depth, layer leaks
       4. Pi run with both design books inlined in the prompt
       5. independent gates: bun run release, forbidden paths, test count
       6. push refactor/auto-<stamp>, open a PR into dev
       7. write local run state; the log entry travels on the branch
```

The books are inserted as raw text into the prompt, not referenced by path:

- *A Philosophy of Software Design* (Ousterhout) defines what good structure is.
- *Refactoring* (Fowler) defines the process: small steps, test after each, stop when unsure.

Both together are about 250k tokens. The default model has a 1M context, so the whole text fits
alongside the codebase work. Paths are set in `run.sh` (`REFACTOR_BOOK_PSD`, `REFACTOR_BOOK_FOWLER`).

## The pull request

Each run opens one PR into `dev`. The description is built from measurements, not from the model's
imagination:

| Section | Source |
| --- | --- |
| What changed | model, from `.refactor/work/result.json` |
| The design change | model, in plain English |
| Before / after graph | dependency-cruiser at the base commit and at the branch head, limited to the touched modules and one hop of context, rendered as Mermaid |
| Structural delta | module count, import edges, cycles, longest chain, assertions, change size |
| What did not change | the release gate result on the final commit |
| Where to start reading | model, two to four files in reading order |
| Trade-offs and doubts | the log entry |

The graph is measured. If the branch did not change module boundaries, the body says so instead of
showing two identical diagrams.

The prose comes from the model, so the prompt makes it read the global `writing` skill before it
writes `result.json`, then reread the three fields and split any sentence over twenty words.
`make-pr-body.py` prints a `style-warning:` line to the run log for each model-written sentence that
is still too long. It never rewrites the model's prose and never blocks the PR.

The job opens at most one steward PR at a time. While a PR is open, the daily fire exits with the
PR URL. Merge or close it to let the next run proceed.

## Schedule and sleep

The LaunchAgent fires **daily at 03:17 local time**. `run.sh` enforces the interval:
`REFACTOR_INTERVAL_HOURS` (default `72`).

Daily trigger plus an interval gate is deliberate. A `*/3` day-of-month cron expression drifts
across month boundaries, and a single fire every 72 h can land a minute early and skip a whole
cycle. With a daily trigger, a skipped day is retried the next day.

launchd runs a missed calendar fire once on wake, so a sleeping laptop still runs the job. The job
runs under `caffeinate -i -s`, so an open laptop does not idle-sleep during a run. A closed lid
still suspends the machine; the process resumes on wake. If the model call dies in that suspend,
the harness clears its attempt stamp so the next daily fire retries instead of waiting three days.

## Deterministic stop (no LLM call)

`run.sh` exits before starting Pi when any of these is true:

1. The last attempt is younger than the interval.
2. A steward PR is already open.
3. `origin/dev` has no commits since the last recorded run.
4. Another run holds the lock.

Checks 1 and 3 cost one `git fetch` and one `git log`. Check 2 costs one `gh pr list`.

The agent can also decide to stop. If the diff is docs-only, formatting-only, or offers no honest
target, it reports `no-op`, makes no commit, and no PR is opened.

## Gates before a PR opens

The harness, not the agent, decides whether work is published. In order:

| Gate | Failure |
| --- | --- |
| Leftover edits are committed automatically, then counted | — |
| Forbidden paths untouched (`package.json`, `bun.lock`, `.env*`, `infra/`, `.github/`, `scripts/refactor/`, `next.config.ts`) | no PR, branch kept |
| Assertion count did not decrease in `test/` and `src/**/__tests__` | no PR, branch kept |
| `bun run build` and the full vitest suite, compared with the baseline failures recorded on the untouched base | new failure or build error: no PR, branch kept |
| `bun run lint` | advisory only |
| Rebase onto current `dev` succeeds, and `bun run release` passes again | no PR, branch kept |
| `gh pr create` | branch kept, error in the run log |

Nothing is deployed. Merging the PR is your decision.

## Records

| Path | Tracked | Purpose |
| --- | --- | --- |
| `.refactor/LOG.md` | yes, on the branch | One entry per run: smell, change, reason, alternatives, doubts, what was noticed but not fixed. Travels with the PR, so it reaches `dev` when you merge. |
| `.refactor/work/state.json` | no | Last processed `dev` SHA, last outcome, last PR URL. Machine-local; the gate reads it. |
| `.refactor/runs/<stamp>.log` | no | Full transcript of gates, builds, and the agent's final message. |
| `.refactor/runs/<stamp>-pr-body.md` | no | A copy of the PR description as opened. |
| `.refactor/work/` | no | Generated briefing, metrics, raw diff, `result.json`, lock. |

`LOG.md` is the part that matters. A refactor without a recorded reason is treated as unfinished.
Because the log arrives with the PR, an unmerged branch is invisible to the next run by design: the
steward does not redo or pile up work.

## Commands

```sh
# install or update the LaunchAgent
scripts/refactor/install-launchd.sh

# inspect it
scripts/refactor/install-launchd.sh --status
launchctl print gui/$(id -u)/com.kynd.refactor

# run now, ignoring the interval, PR and change gates
launchctl kickstart -k gui/$(id -u)/com.kynd.refactor
# or
scripts/refactor/run.sh --force

# build the worktree, metrics and briefing without starting the model
scripts/refactor/run.sh --dry-run --force

# stop it
scripts/refactor/install-launchd.sh --remove
```

Useful knobs (`run.sh`):

| Variable | Default | Meaning |
| --- | --- | --- |
| `REFACTOR_INTERVAL_HOURS` | `72` | Minimum hours between attempts |
| `REFACTOR_MODEL` | `opencode-go/deepseek-v4.1-flash` | Model with a context large enough for both books |
| `REFACTOR_AGENT_TIMEOUT` | `21600` | Seconds before the agent is terminated |
| `REFACTOR_PUBLISH` | `pr` | `never` pushes the branch only; `merge` merges to `dev` (opt-in) |
| `REFACTOR_METRICS_COVERAGE` | `1` | `0` skips the coverage run; CRAP then reports complexity only |

## When a run fails

The worktree stays at `.worktrees/refactor-<stamp>` and the branch stays at
`refactor/auto-<stamp>`. Read the run log and `$WORKTREE/.refactor/work/result.json`, then fix by
hand or delete both and let the next fire retry.

The interval gate uses a local attempt stamp, so a crash does not cause a retry storm. An agent
failure clears the stamp on purpose, so the next daily fire retries. `--force` overrides everything.

Worktrees older than 14 days are removed automatically at the start of a run.

## Tooling added for this job

Dev dependencies, used only by the metrics and PR steps:

- `dependency-cruiser` — coupling, instability, cycles, layer violations, and the PR graph.
- `@vitest/coverage-v8` — coverage JSON, which turns `crap` complexity numbers into CRAP scores.

`crap` itself is an external binary (`~/.local/bin/crap`, Python + lizard). When it is missing, the
run continues with complexity-only metrics.

`scripts/refactor/depth.ts` reports the longest import chain, fan-in, fan-out and cycles.
`scripts/refactor/compare-tests.py` separates a pre-existing test failure from a regression.
`scripts/refactor/make-pr-body.py` builds the PR description and its Mermaid graphs.

## Browser test isolation

The browser specs normally reuse any dev server on `3000/3001/3100/3207`. Under the steward that
would test whatever a human has running, not the branch. `run.sh` exports `E2E_PORTS`
(4310-4313 by default); `test/helpers/server.ts` then starts its own server and never reuses an
existing one. The same environment reaches the agent, so its own test runs are isolated too.

## Pre-existing failures

Some repositories start a run with a failing test. The metrics step records the failing test
identities on the untouched base commit. The release gate compares its own failures with that
baseline: a failure that exists on both sides is reported in the PR and does not block it, and any
new failure blocks it. If the baseline report is missing, the gate is strict: zero failures.
