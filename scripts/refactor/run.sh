#!/usr/bin/env bash
# Scheduled refactor steward for Kynd.
#
# Runs at most once every REFACTOR_INTERVAL_HOURS (default 72). The launchd
# agent calls it daily (see install-launchd.sh); the interval gate decides
# whether this is the day.
#
# Order of operations:
#   1. deterministic gate: interval + "has dev changed at all since last run?"
#      (no LLM call when either answer says stop)
#   2. fresh worktree from origin/dev, dependencies installed
#   3. structural metrics (crap, dependency-cruiser, import depth)
#   4. one unattended Pi run with both design books inlined in the prompt
#   5. independent verification: release gate, lint, forbidden paths, test count
#   6. merge to dev only when every gate is green
#   7. durable log + state committed to dev
#
# Usage:
#   scripts/refactor/run.sh            # respects the schedule
#   scripts/refactor/run.sh --force    # ignore schedule and change gate
#   scripts/refactor/run.sh --dry-run  # build worktree, prompt and metrics; no LLM
#
# Env:
#   REFACTOR_INTERVAL_HOURS   default 72
#   REFACTOR_MODEL            default opencode-go/deepseek-v4.1-flash
#   REFACTOR_AGENT_TIMEOUT    default 21600 (6h)
#   REFACTOR_MERGE            auto (default) | never
#   REFACTOR_METRICS_COVERAGE 1 (default) | 0
#   REFACTOR_BOOK_PSD         absolute path to psd.txt
#   REFACTOR_BOOK_FOWLER      absolute path to the Refactoring text

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT" || exit 1

STATE_REL=".refactor/state.json"
LOG_REL=".refactor/LOG.md"
RUNS_DIR=".refactor/runs"
WORK_DIR=".refactor/work"
LOCK_DIR="$WORK_DIR/lock"
ATTEMPT_STAMP="$WORK_DIR/last-attempt"

INTERVAL_HOURS="${REFACTOR_INTERVAL_HOURS:-72}"
MODEL="${REFACTOR_MODEL:-opencode-go/deepseek-v4.1-flash}"
AGENT_TIMEOUT="${REFACTOR_AGENT_TIMEOUT:-21600}"
MERGE_MODE="${REFACTOR_MERGE:-auto}"
BOOK_PSD="${REFACTOR_BOOK_PSD:-/Users/jeremykamber/core/3_resources/books/psd.txt}"
BOOK_FOWLER="${REFACTOR_BOOK_FOWLER:-/Users/jeremykamber/core/3_resources/books/Refactoring - Improving The Design Of Existing Code (1st Edition) By Martin Fowler, Kent Beck, John Brant, William Opdyke, Don Roberts, Erich Gamma.txt}"

FORCE=0
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --dry-run) DRY_RUN=1 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

STAMP="$(date -u +%Y%m%d-%H%M)"
BRANCH="refactor/auto-$STAMP"
WORKTREE="$REPO_ROOT/.worktrees/refactor-$STAMP"
SESSION_ID="refactor-$STAMP"
RUN_LOG="$REPO_ROOT/$RUNS_DIR/$STAMP.log"

mkdir -p "$REPO_ROOT/$RUNS_DIR" "$REPO_ROOT/$WORK_DIR"

log() {
  printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" | tee -a "$RUN_LOG"
}

die() {
  log "ERROR: $*"
  exit 1
}

# ---------------------------------------------------------------------------
# Single-run lock. A stale lock from a killed run must not block the next one.
# ---------------------------------------------------------------------------
acquire_lock() {
  if [ -d "$LOCK_DIR" ]; then
    local held
    held="$(cat "$LOCK_DIR/pid" 2>/dev/null || echo 0)"
    if [ -n "$held" ] && kill -0 "$held" 2>/dev/null; then
      log "another run holds the lock (pid $held); exiting"
      exit 0
    fi
    log "removing stale lock (pid ${held:-unknown})"
    rm -rf "$LOCK_DIR"
  fi
  mkdir -p "$LOCK_DIR"
  echo "$$" > "$LOCK_DIR/pid"
}

release_lock() {
  rm -rf "$LOCK_DIR"
}

# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
json_field() {
  # json_field <file> <field> [default]
  python3 - "$1" "$2" "${3:-}" <<'PY'
import json, sys
path, field, default = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path) as handle:
        data = json.load(handle)
    value = data.get(field, default)
    print("" if value is None else value)
except Exception:
    print(default)
PY
}

state_from_dev() {
  git show "origin/dev:$STATE_REL" 2>/dev/null
}

hours_since() {
  # hours_since <epoch-seconds>
  python3 - "$1" <<'PY'
import sys, time
try:
    then = float(sys.argv[1])
except ValueError:
    print("999")
    raise SystemExit
print(f"{max(0.0, (time.time() - then) / 3600):.1f}")
PY
}

run_with_timeout() {
  # run_with_timeout <seconds> <label> <command...>
  local seconds="$1" label="$2"
  shift 2
  "$@" &
  local pid=$!
  (
    sleep "$seconds"
    if kill -0 "$pid" 2>/dev/null; then
      echo "[watchdog] $label exceeded ${seconds}s; terminating" >&2
      kill -TERM "$pid" 2>/dev/null
      sleep 60
      kill -KILL "$pid" 2>/dev/null
    fi
  ) &
  local watchdog=$!
  wait "$pid"
  local status=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  return "$status"
}

write_state() {
  # write_state <worktree> <last-dev-sha> <outcome> <base-sha>
  local wt="$1" sha="$2" outcome="$3" base="$4"
  cat > "$wt/$STATE_REL" <<JSON
{
  "lastDevSha": "$sha",
  "lastRunAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "lastBranch": "$BRANCH",
  "lastOutcome": "$outcome",
  "lastBase": "$base"
}
JSON
}

record_state_on_dev() {
  # record_state_on_dev <worktree> <last-dev-sha> <outcome> <base>
  local wt="$1" sha="$2" outcome="$3" base="$4"
  write_state "$wt" "$sha" "$outcome" "$base"
  (
    cd "$wt" || exit 1
    git add "$STATE_REL" >/dev/null 2>&1 || exit 1
    if git diff --cached --quiet; then
      return 0
    fi
    git commit -q -m "chore(refactor): record run $STAMP ($outcome) [skip ci]" || exit 1
    git push -q origin HEAD:dev || exit 1
  ) >> "$RUN_LOG" 2>&1
}

remove_worktree() {
  local wt="$1"
  # `git worktree remove` refuses to remove the worktree it is run from.
  cd "$REPO_ROOT" || return 1
  git worktree remove --force "$wt" >> "$RUN_LOG" 2>&1 || rm -rf "$wt"
  git worktree prune >> "$RUN_LOG" 2>&1 || true
}

cleanup_stale_worktrees() {
  # BSD find has no -maxdepth, so age comes from stat. Worktrees older than 14
  # days are debris from a failed run and are safe to drop.
  git worktree list --porcelain 2>/dev/null \
    | awk '/^worktree /{print $2}' \
    | grep '/.worktrees/refactor-' \
    | while read -r path; do
        [ -d "$path" ] || continue
        AGE_DAYS=$(python3 -c "import os,sys,time; print(int((time.time()-os.stat(sys.argv[1]).st_mtime)/86400))" "$path" 2>/dev/null || echo 0)
        if [ "${AGE_DAYS:-0}" -gt 14 ]; then
          log "removing stale worktree $path"
          remove_worktree "$path"
        fi
      done
  cd "$REPO_ROOT" || true
}

# Start logging from here.
: > "$RUN_LOG"
log "run $STAMP (repo $REPO_ROOT)"

acquire_lock
trap 'release_lock' EXIT
trap 'release_lock; exit 130' INT TERM

cleanup_stale_worktrees

# ---------------------------------------------------------------------------
# 1. Deterministic gates. Nothing below runs (and no token is spent) when the
#    schedule is not due or dev has not moved since the last recorded run.
# ---------------------------------------------------------------------------
if ! git fetch --quiet origin dev; then
  die "git fetch origin dev failed"
fi
git rev-parse --verify --quiet origin/dev >/dev/null || die "origin/dev not found"
DEV_SHA="$(git rev-parse origin/dev)"
log "origin/dev = $DEV_SHA"

if [ "$FORCE" -ne 1 ]; then
  if [ -f "$ATTEMPT_STAMP" ]; then
    LAST_ATTEMPT="$(cat "$ATTEMPT_STAMP" 2>/dev/null || echo 0)"
    ELAPSED="$(hours_since "${LAST_ATTEMPT:-0}")"
    if python3 -c "import sys; sys.exit(0 if $ELAPSED < $INTERVAL_HOURS else 1)"; then
      log "not due: last attempt ${ELAPSED}h ago, interval ${INTERVAL_HOURS}h; exiting without an LLM call"
      exit 0
    fi
  fi

  STATE_JSON="$(state_from_dev)"
  if [ -n "$STATE_JSON" ]; then
    LAST_SHA="$(printf '%s' "$STATE_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("lastDevSha",""))' 2>/dev/null)"
    if [ -n "$LAST_SHA" ] && git cat-file -e "$LAST_SHA^{commit}" 2>/dev/null; then
      CHANGES="$(git log --format='%h %s' "$LAST_SHA..origin/dev" -- . ":(exclude)$STATE_REL")"
      if [ -z "$CHANGES" ]; then
        log "no commits to dev since $LAST_SHA (excluding refactor state); exiting without an LLM call"
        exit 0
      fi
      log "dev advanced since $LAST_SHA:"
      printf '%s\n' "$CHANGES" | tee -a "$RUN_LOG"
    fi
  else
    log "no recorded state on origin/dev; treating this as the first run"
  fi
fi

# Mark the attempt now. A failed run waits a full interval instead of retrying
# (and paying) every night. A dry run changes nothing, so it does not count.
if [ "$DRY_RUN" -ne 1 ]; then
  date +%s > "$ATTEMPT_STAMP"
fi

BASE_SHA="$DEV_SHA"

# ---------------------------------------------------------------------------
# 2. Worktree
# ---------------------------------------------------------------------------
log "creating worktree $WORKTREE on $BRANCH"
if ! git worktree add -q -b "$BRANCH" "$WORKTREE" origin/dev >> "$RUN_LOG" 2>&1; then
  die "could not create worktree"
fi

if ! "$REPO_ROOT/scripts/setup-worktree.sh" "$WORKTREE" >> "$RUN_LOG" 2>&1; then
  log "setup-worktree.sh failed; see $RUN_LOG"
  die "worktree setup failed"
fi

mkdir -p "$WORKTREE/.refactor/work"

# Diff briefing: what changed since the last run.
DIFF_TMP="$WORKTREE/.refactor/work/diff.txt"
LAST_FOR_DIFF="$BASE_SHA"
if [ -n "${LAST_SHA:-}" ] && git cat-file -e "$LAST_SHA^{commit}" 2>/dev/null; then
  LAST_FOR_DIFF="$LAST_SHA"
fi
{
  if [ "$LAST_FOR_DIFF" = "$BASE_SHA" ]; then
    echo "No earlier refactor state was found. This is the first automated run."
    echo
    echo "Recent history on dev:"
    git log --oneline -15 "$BASE_SHA"
  else
    echo "Commits on dev since the last refactor run ($LAST_FOR_DIFF..$BASE_SHA):"
    git log --format='%h %s' "$LAST_FOR_DIFF..$BASE_SHA" -- . ":(exclude)$STATE_REL"
    echo
    echo "Files changed:"
    git diff --stat "$LAST_FOR_DIFF..$BASE_SHA" -- . ":(exclude)$STATE_REL"
    echo
    PATCH_LINES=$(git diff "$LAST_FOR_DIFF..$BASE_SHA" -- . ":(exclude)$STATE_REL" | wc -l | tr -d ' ')
    if [ "${PATCH_LINES:-0}" -le 2500 ]; then
      echo "Full patch:"
      git diff "$LAST_FOR_DIFF..$BASE_SHA" -- . ":(exclude)$STATE_REL"
    else
      echo "Patch is $PATCH_LINES lines; read it with:"
      echo "  git log --oneline $LAST_FOR_DIFF..$BASE_SHA"
      echo "  git diff $LAST_FOR_DIFF..$BASE_SHA"
    fi
  fi
} > "$DIFF_TMP"

# ---------------------------------------------------------------------------
# 3. Metrics
# ---------------------------------------------------------------------------
METRICS_TMP="$WORKTREE/.refactor/work/metrics.txt"
log "collecting structural metrics (this can take a few minutes)"
if ! run_with_timeout 3600 metrics "$REPO_ROOT/scripts/refactor/metrics.sh" "$WORKTREE" "$METRICS_TMP" >> "$RUN_LOG" 2>&1; then
  log "metrics collection failed; continuing with a minimal report"
  {
    echo "metrics collection failed; inspect the tree directly"
    echo "fallback: crap src --top 30"
  } > "$METRICS_TMP"
fi

# ---------------------------------------------------------------------------
# 4. Briefing + agent
# ---------------------------------------------------------------------------
PRIOR_LOG_TMP="$WORKTREE/.refactor/work/prior-log.md"
if [ -f "$WORKTREE/$LOG_REL" ]; then
  cp "$WORKTREE/$LOG_REL" "$PRIOR_LOG_TMP"
else
  echo "No refactor log yet. This is the first run." > "$PRIOR_LOG_TMP"
fi

PROMPT="$WORKTREE/.refactor/work/prompt.md"
log "building briefing (both books inlined)"
if ! python3 "$REPO_ROOT/scripts/refactor/build-prompt.py" \
  --template "$REPO_ROOT/scripts/refactor/prompt.md" \
  --out "$PROMPT" \
  --psd "$BOOK_PSD" \
  --fowler "$BOOK_FOWLER" \
  --diff "$DIFF_TMP" \
  --log "$PRIOR_LOG_TMP" \
  --metrics "$METRICS_TMP" \
  --base "$BASE_SHA" \
  --run-date "$(date -u +%Y-%m-%d)" >> "$RUN_LOG" 2>&1; then
  log "briefing build failed (book paths: $BOOK_PSD ; $BOOK_FOWLER)"
  die "cannot start the agent without the full briefing"
fi

rm -f "$WORKTREE/.refactor/work/result.json"

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry run: worktree at $WORKTREE, briefing at $PROMPT, metrics at $METRICS_TMP"
  cat > "$WORKTREE/.refactor/work/result.json" <<'JSON'
{
  "outcome": "no-op",
  "summary": "dry run: briefing built, no agent started",
  "areas": [],
  "risk": "low"
}
JSON
  log "dry run complete; worktree left in place for inspection"
  exit 0
fi

if [ "$DRY_RUN" -ne 1 ]; then
  log "starting Pi ($MODEL), timeout ${AGENT_TIMEOUT}s, session $SESSION_ID"
  (
    cd "$WORKTREE" || exit 1
    cat "$PROMPT" | pi --print \
      --model "$MODEL" \
      --session-id "$SESSION_ID" \
      --name "refactor $STAMP" \
      > "$WORKTREE/.refactor/work/agent-output.txt" 2>&1
  )
  AGENT_STATUS=$?
  log "Pi exited with status $AGENT_STATUS"
  if [ "$AGENT_STATUS" -ne 0 ]; then
    log "agent run failed; leaving worktree for inspection: $WORKTREE"
    exit 1
  fi
fi

# ---------------------------------------------------------------------------
# 5. Verification. The agent's claims are not evidence; these gates are.
# ---------------------------------------------------------------------------
log "verifying the result"
cd "$WORKTREE" || die "worktree vanished"

if ! git diff --quiet || ! git diff --cached --quiet; then
  log "agent left uncommitted changes; committing them so the gate sees them"
  git add -A >> "$RUN_LOG" 2>&1
  git commit -q -m "refactor: commit work left uncommitted by the steward ($STAMP)" >> "$RUN_LOG" 2>&1 \
    || log "WARNING: could not commit leftover changes"
fi

COMMITS_AHEAD="$(git rev-list --count "origin/dev..HEAD" 2>/dev/null || echo 0)"
log "commits ahead of origin/dev: $COMMITS_AHEAD"

OUTCOME=""
RESULT_FILE="$WORKTREE/.refactor/work/result.json"
if [ -f "$RESULT_FILE" ]; then
  OUTCOME="$(json_field "$RESULT_FILE" outcome "")"
fi

if [ "$COMMITS_AHEAD" -eq 0 ]; then
  if [ "$OUTCOME" = "no-op" ] || [ "$DRY_RUN" -eq 1 ]; then
    log "no code changes: recorded no-op"
    if [ "$DRY_RUN" -ne 1 ]; then
      record_state_on_dev "$WORKTREE" "$BASE_SHA" "no-op" "$BASE_SHA"
    fi
    remove_worktree "$WORKTREE"
    exit 0
  fi
  log "agent produced no commits and no edits; treating as no-op"
  record_state_on_dev "$WORKTREE" "$BASE_SHA" "no-op" "$BASE_SHA"
  remove_worktree "$WORKTREE"
  exit 0
fi

# Forbidden paths: a refactor must not rewrite deployment, secrets, tooling or
# dependencies.
FORBIDDEN="$(git diff --name-only "origin/dev...HEAD" | grep -E '^(\.env|infra/|\.github/|scripts/refactor/|package\.json$|bun\.lock$|next\.config\.ts$|\.refactor/(run|prompt|metrics|depth|build-prompt))' || true)"
if [ -n "$FORBIDDEN" ]; then
  log "GATE FAILED: refactor touched forbidden paths:"
  printf '%s\n' "$FORBIDDEN" | tee -a "$RUN_LOG"
  write_state "$WORKTREE" "$BASE_SHA" "failed:forbidden-paths" "$BASE_SHA"
  log "branch left for review: $BRANCH"
  exit 1
fi

# Test count: a refactor may move tests, never delete assertions.
count_assertions() {
  # count_assertions <rev>
  {
    git grep -o -E 'expect\(|assert[.(]' "$1" -- 'test' 'src/**/__tests__' 2>/dev/null
  } | wc -l | tr -d ' '
}
BASE_ASSERTIONS="$(count_assertions "origin/dev")"
HEAD_ASSERTIONS="$(count_assertions "HEAD")"
log "assertions: base=$BASE_ASSERTIONS head=$HEAD_ASSERTIONS"
if [ "${HEAD_ASSERTIONS:-0}" -lt "${BASE_ASSERTIONS:-0}" ]; then
  log "GATE FAILED: test assertions decreased ($BASE_ASSERTIONS -> $HEAD_ASSERTIONS); a refactor must not weaken tests"
  write_state "$WORKTREE" "$BASE_SHA" "failed:weakened-tests" "$BASE_SHA"
  log "branch left for review: $BRANCH"
  exit 1
fi

log "running lint (advisory)"
run_with_timeout 1800 lint bun run lint >> "$RUN_LOG" 2>&1 || log "lint reported problems (advisory)"

log "running release gate: bun run release"
if ! run_with_timeout 5400 release bun run release >> "$RUN_LOG" 2>&1; then
  log "GATE FAILED: bun run release did not pass"
  write_state "$WORKTREE" "$BASE_SHA" "failed:release" "$BASE_SHA"
  log "branch left for review: $BRANCH"
  exit 1
fi
log "release gate passed"

# ---------------------------------------------------------------------------
# 6. Merge to dev (only when configured and green)
# ---------------------------------------------------------------------------
if [ "$MERGE_MODE" != "auto" ]; then
  log "merge disabled (REFACTOR_MERGE=$MERGE_MODE); branch $BRANCH is ready for review"
  record_state_on_dev "$WORKTREE" "$BASE_SHA" "branch" "$BASE_SHA"
  exit 0
fi

git fetch --quiet origin dev || die "fetch before merge failed"

if ! git merge-base --is-ancestor origin/dev HEAD; then
  log "dev moved during the run; rebasing"
  if ! git rebase origin/dev >> "$RUN_LOG" 2>&1; then
    git rebase --abort >> "$RUN_LOG" 2>&1 || true
    log "GATE FAILED: rebase conflict; branch left for review: $BRANCH"
    write_state "$WORKTREE" "$BASE_SHA" "failed:conflict" "$BASE_SHA"
    exit 1
  fi
  log "re-running release gate after rebase"
  if ! run_with_timeout 5400 release-after-rebase bun run release >> "$RUN_LOG" 2>&1; then
    log "GATE FAILED after rebase"
    write_state "$WORKTREE" "$BASE_SHA" "failed:release-after-rebase" "$BASE_SHA"
    exit 1
  fi
fi

if ! git push -q origin HEAD:dev >> "$RUN_LOG" 2>&1; then
  log "push rejected; fetching, rebasing once"
  git fetch --quiet origin dev || true
  if git rebase origin/dev >> "$RUN_LOG" 2>&1 && run_with_timeout 5400 release-retry bun run release >> "$RUN_LOG" 2>&1 && git push -q origin HEAD:dev >> "$RUN_LOG" 2>&1; then
    log "pushed after retry"
  else
    log "GATE FAILED: could not push to dev; branch left for review: $BRANCH"
    write_state "$WORKTREE" "$BASE_SHA" "failed:push" "$BASE_SHA"
    exit 1
  fi
fi

MERGED_SHA="$(git rev-parse HEAD)"
log "merged to dev at $MERGED_SHA"

# ---------------------------------------------------------------------------
# 7. Durable state, then cleanup
# ---------------------------------------------------------------------------
if ! record_state_on_dev "$WORKTREE" "$MERGED_SHA" "merged" "$BASE_SHA"; then
  log "WARNING: refactor merged but the run state was not recorded; the next run may re-evaluate the same diff"
fi

log "run complete"
remove_worktree "$WORKTREE"
exit 0
