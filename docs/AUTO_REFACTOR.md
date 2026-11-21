# Automated refactor steward

A launchd job runs a refactoring pass on Kynd about every three days. It works on a throwaway
worktree branched from `dev`, verifies itself, and merges only when every gate passes. It never
adds features.

The goal is one thing: **less complexity**. The steward reduces dependencies and obscurity so the
code is easier to change. It does not chase metrics, formatting, or comment volume.

## How it works

```text
launchd (daily 03:17)
  └─ scripts/refactor/run.sh
       1. deterministic gate ── nothing new on dev? exit. no tokens spent.
       2. worktree from origin/dev + bun install
       3. metrics: crap scores, dependency-cruiser, import depth, layer leaks
       4. Pi run with both design books inlined in the prompt
       5. independent gates: bun run release, forbidden paths, test count
       6. merge to dev when green
       7. append .refactor/LOG.md, record .refactor/state.json
```

The books are inserted as raw text into the prompt, not referenced by path:

- *A Philosophy of Software Design* (Ousterhout) defines what good structure is.
- *Refactoring* (Fowler) defines the process: small steps, test after each, stop when unsure.

Both together are about 250k tokens. The default model has a 1M context, so the whole text fits
alongside the codebase work. Paths are set in `run.sh` (`REFACTOR_BOOK_PSD`, `REFACTOR_BOOK_FOWLER`).

## Schedule

The LaunchAgent fires **daily at 03:17 local time**. `run.sh` enforces the real interval:
`REFACTOR_INTERVAL_HOURS` (default `72`).

Daily trigger plus an interval gate is deliberate. A `*/3` day-of-month cron expression drifts
across month boundaries, and a single fire every 72 h can land a minute early and skip a whole
cycle. With a daily trigger, a skipped day is retried the next day.

launchd also handles sleep better than cron: a fire missed while the Mac is asleep runs once on
wake, and per-job logs are built in. launchd is the supported scheduler on macOS; `cron` needs a
Full Disk Access grant on current releases.

## Deterministic stop (no LLM call)

`run.sh` exits before starting Pi in three cases:

1. The last attempt is younger than the interval.
2. `origin/dev` has no commits since the last recorded run, ignoring
   `.refactor/state.json` itself.
3. Another run holds the lock.

Case 2 is the important one: if nothing merged to `dev`, there is nothing new to refactor. This
check costs one `git fetch` and one `git log`.

The agent can also decide to stop. If the diff is docs-only, formatting-only, or offers no honest
target, it reports `no-op` and makes no commit.

## Gates before merge

The harness, not the agent, decides whether work merges. In order:

| Gate | Failure |
| --- | --- |
| Not dirty: leftover edits are committed automatically, then counted | — |
| Forbidden paths untouched (`package.json`, `bun.lock`, `.env*`, `infra/`, `.github/`, `scripts/refactor/`, `next.config.ts`) | no merge, branch kept |
| Assertion count did not decrease in `test/` and `src/**/__tests__` | no merge, branch kept |
| `bun run release` (`next build && vitest run`) | no merge, branch kept |
| `bun run lint` | advisory only |
| Rebase onto current `dev` succeeds, and `bun run release` passes again | no merge, branch kept |

A green run pushes to `dev` as a normal fast-forward. It does **not** deploy to the VPS. The repo
rule to pull `dev` on the VPS and restart PM2 stays a human step; a refactor changes structure,
not behaviour, but production deploys are not this job's decision.

## Records

| Path | Tracked | Purpose |
| --- | --- | --- |
| `.refactor/LOG.md` | yes | One entry per run: smell, change, reason, alternatives, doubts, what was noticed but not fixed. Read on every run so the steward does not loop. |
| `.refactor/state.json` | yes | Last merged dev SHA and last run time. The deterministic stop reads this. |
| `.refactor/runs/<stamp>.log` | no | Full transcript of gates, builds, and the agent's final message. |
| `.refactor/work/` | no | Generated briefing, metrics, raw diff, `result.json`, lock. |

`LOG.md` is the part that matters. A refactor without a recorded reason is treated as unfinished.

## Commands

```sh
# install or update the LaunchAgent
scripts/refactor/install-launchd.sh

# inspect it
scripts/refactor/install-launchd.sh --status
launchctl print gui/$(id -u)/com.kynd.refactor

# run now, ignoring the 72h gate
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
| `REFACTOR_MERGE` | `auto` | `never` leaves a reviewable branch instead of pushing |
| `REFACTOR_METRICS_COVERAGE` | `1` | `0` skips the coverage run; CRAP then reports complexity only |

## When a run fails

The worktree stays at `.worktrees/refactor-<stamp>` and the branch stays at
`refactor/auto-<stamp>`. Read `$WORKTREE/.refactor/work/result.json`, the agent output, and the
run log. Fix by hand, or delete the worktree and branch and let the next scheduled run retry.

The interval gate uses a local attempt stamp, so a crash does not cause a retry storm the next
night. `--force` overrides it.

Worktrees older than 14 days are removed automatically at the start of a run.

## Tooling added for this job

These are dev dependencies, used only by the metrics step:

- `dependency-cruiser` — coupling, instability, cycles, layer violations.
- `@vitest/coverage-v8` — coverage JSON, which turns `crap` complexity numbers into CRAP scores.

`crap` itself is an external binary (`~/.local/bin/crap`, Python + lizard). When it is missing,
the run continues with complexity-only metrics.

`scripts/refactor/depth.ts` reads the dependency graph and reports the longest import chain,
fan-in, fan-out and cycles.
