#!/usr/bin/env bash
# Structural metrics for one refactor run. Advisory only: nothing here gates a
# merge. The output is embedded in the agent's briefing so it can aim at real
# hotspots instead of guessing.
#
# Usage: metrics.sh <worktree> <output-file>
#
# Env:
#   REFACTOR_METRICS_COVERAGE=0   skip the coverage run (CRAP then reports
#                                 complexity only, which overstates risk)

set -uo pipefail

WORKTREE="${1:?usage: metrics.sh <worktree> <output-file>}"
OUT="${2:?usage: metrics.sh <worktree> <output-file>}"
COVERAGE="${REFACTOR_METRICS_COVERAGE:-1}"

cd "$WORKTREE" || exit 1
mkdir -p "$(dirname "$OUT")"
: > "$OUT"

section() {
  printf '\n===== %s =====\n' "$1" >> "$OUT"
}

section "size"
if git rev-parse --git-dir >/dev/null 2>&1; then
  SOURCE_FILES=$(git ls-files 'src/**/*.ts' 'src/**/*.tsx' 2>/dev/null)
  FILE_COUNT=$(printf '%s\n' "$SOURCE_FILES" | grep -c . || true)
  LINE_COUNT=$(printf '%s\n' "$SOURCE_FILES" | xargs wc -l 2>/dev/null | tail -1 | awk '{print $1}')
  printf 'source files: %s   source lines: %s\n' "${FILE_COUNT:-0}" "${LINE_COUNT:-0}" >> "$OUT"
fi

section "coverage"
COVERAGE_JSON="coverage/coverage-final.json"
rm -f "$COVERAGE_JSON"
if [ "$COVERAGE" = "1" ] && [ -d node_modules/@vitest/coverage-v8 ]; then
  # The suite also drives the browser specs, so this is slow. An unavailable
  # browser endpoint must not abort metrics; CRAP then reports complexity only.
  # Test output can include raw fixture bytes (a DOCX fixture prints itself).
  # It is useless in a prompt, so it goes to its own log and never into $OUT.
  # The same run records the baseline test report. The release gate later
  # compares its own failures with this file, so a failure that already exists
  # on the untouched base is not blamed on the branch.
  if bunx vitest run --coverage --coverage.reporter=json \
      --coverage.reportsDirectory=coverage --coverage.include='src/**' \
      --reporter=json --outputFile="$WORKTREE/.refactor/work/baseline-tests.json" \
      --silent > "$WORKTREE/.refactor/work/coverage-run.log" 2>&1; then
    printf 'coverage run: ok (output in .refactor/work/coverage-run.log)\n' >> "$OUT"
  elif [ -f "$COVERAGE_JSON" ] && [ -s "$WORKTREE/.refactor/work/baseline-tests.json" ]; then
    printf 'coverage run: tests failed on the base tree; coverage and baseline report kept\n' >> "$OUT"
  else
    printf 'coverage run: failed (metrics continue without coverage; see .refactor/work/coverage-run.log)\n' >> "$OUT"
    rm -f "$COVERAGE_JSON"
  fi
else
  printf 'coverage run: skipped\n' >> "$OUT"
fi

section "CRAP (complexity x coverage)"
if command -v crap >/dev/null 2>&1; then
  if [ -f "$COVERAGE_JSON" ]; then
    crap src --coverage "$COVERAGE_JSON" --top 30 --threshold 8 >> "$OUT" 2>&1
  else
    crap src --top 30 >> "$OUT" 2>&1
  fi
  printf '(rows are worst-first; CRAP >= 30 is a strong refactor candidate)\n' >> "$OUT"
else
  printf 'crap not installed; skipped\n' >> "$OUT"
fi

DEPCRUISE="./node_modules/.bin/depcruise"
if [ -x "$DEPCRUISE" ] && [ -d src ]; then
  section "dependency metrics (afferent/efferent coupling, instability)"
  "$DEPCRUISE" src --output-type metrics --no-progress >> "$OUT" 2>&1

  section "dependency depth and cycles"
  GRAPH="$(mktemp -t kynd-depgraph.XXXXXX)"
  if "$DEPCRUISE" src --output-type json --no-progress > "$GRAPH" 2>/dev/null; then
    if [ -x node_modules/.bin/tsx ]; then
      node_modules/.bin/tsx scripts/refactor/depth.ts "$GRAPH" --top 12 >> "$OUT" 2>&1
    else
      bun scripts/refactor/depth.ts "$GRAPH" --top 12 >> "$OUT" 2>&1
    fi
  else
    printf 'dependency graph could not be produced\n' >> "$OUT"
  fi
  rm -f "$GRAPH"

  section "layer-rule violations (from .dependency-cruiser.cjs)"
  "$DEPCRUISE" src --no-progress 2>&1 | tail -40 >> "$OUT"
else
  section "dependency metrics"
  printf 'dependency-cruiser not installed; skipped\n' >> "$OUT"
fi

section "hotspots: largest source files"
find src -type f \( -name '*.ts' -o -name '*.tsx' \) -not -path '*/__tests__/*' -not -name '*.test.ts' -not -name '*.test.tsx' \
  -exec wc -l {} + 2>/dev/null | sort -rn | sed -n '2,16p' >> "$OUT"

# Final guard: keep the briefing text plain. Drop ANSI colour and any control
# bytes a tool leaked, so the prompt stays readable and greppable.
python3 - "$OUT" <<'PYCLEAN'
import sys
path = sys.argv[1]
data = open(path, "rb").read().decode("utf-8", "replace")
out = []
for ch in data:
    if ch == "\n" or ch == "\t" or ch >= " ":
        out.append(ch)
open(path, "w", encoding="utf-8").write("".join(out).replace("\r", "\n"))
PYCLEAN

printf '\nmetrics written to %s\n' "$OUT"
