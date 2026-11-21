#!/usr/bin/env bash
# Install (or remove) the auto-refactor LaunchAgent.
#
# launchd is used instead of cron on macOS because it is the supported
# scheduler: it survives sleep (a missed calendar fire runs once on wake),
# gives per-job logs, and needs no Full Disk Access grant for /usr/sbin/cron.
#
# The job fires once a day. The real "every three days" decision lives in
# scripts/refactor/run.sh: a daily trigger plus an interval gate cannot drift
# across month boundaries the way `*/3` day-of-month cron does, and a run that
# is skipped today is retried tomorrow.
#
# Usage:
#   scripts/refactor/install-launchd.sh            # install or update
#   scripts/refactor/install-launchd.sh --remove   # uninstall
#   scripts/refactor/install-launchd.sh --status   # show state
#
# Env:
#   REFACTOR_LAUNCH_HOUR=3       local hour
#   REFACTOR_LAUNCH_MINUTE=17    local minute
#   REFACTOR_INTERVAL_HOURS=72   passed through to run.sh

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LABEL="com.kynd.refactor"
DOMAIN="gui/$(id -u)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$REPO_ROOT/logs"
RUNNER="$REPO_ROOT/scripts/refactor/run.sh"
HOUR="${REFACTOR_LAUNCH_HOUR:-3}"
MINUTE="${REFACTOR_LAUNCH_MINUTE:-17}"
INTERVAL="${REFACTOR_INTERVAL_HOURS:-72}"

status() {
  if launchctl print "$DOMAIN/$LABEL" >/dev/null 2>&1; then
    launchctl print "$DOMAIN/$LABEL" | grep -E 'state =|program =|last exit code|runs =' || true
  else
    echo "not loaded in $DOMAIN"
  fi
}

if [ "${1:-}" = "--status" ]; then
  echo "plist: $PLIST"
  status
  exit 0
fi

if [ "${1:-}" = "--remove" ]; then
  launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
  rm -f "$PLIST"
  echo "Removed $LABEL."
  exit 0
fi

chmod +x "$RUNNER" "$REPO_ROOT/scripts/refactor/metrics.sh"
mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"

cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>

  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>-s</string>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>exec "$RUNNER"</string>
  </array>

  <key>WorkingDirectory</key>
  <string>$REPO_ROOT</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$HOME/.bun/bin:$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>REFACTOR_INTERVAL_HOURS</key>
    <string>$INTERVAL</string>
    <key>HOME</key>
    <string>$HOME</string>
  </dict>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>$HOUR</integer>
    <key>Minute</key>
    <integer>$MINUTE</integer>
  </dict>

  <key>RunAtLoad</key>
  <false/>

  <key>ProcessType</key>
  <string>Background</string>

  <key>ThrottleInterval</key>
  <integer>300</integer>

  <key>LowPriorityIO</key>
  <true/>

  <key>StandardOutPath</key>
  <string>$LOG_DIR/refactor-launchd.log</string>

  <key>StandardErrorPath</key>
  <string>$LOG_DIR/refactor-launchd.log</string>
</dict>
</plist>
PLIST

# Validate before loading; a malformed plist fails silently otherwise.
plutil -lint "$PLIST" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "$DOMAIN" "$PLIST"
launchctl enable "$DOMAIN/$LABEL" >/dev/null 2>&1 || true

echo "Installed $LABEL"
echo "  fires:    daily at $(printf '%02d:%02d' "$HOUR" "$MINUTE") local time"
echo "  runs:     at most once per ${INTERVAL}h (gate in run.sh)"
echo "  publishes: a pull request into dev (REFACTOR_PUBLISH=pr)"
echo "  plist:    $PLIST"
echo "  output:   $LOG_DIR/refactor-launchd.log and $REPO_ROOT/.refactor/runs/"
echo
status
echo
echo "Next steps:"
echo "  run now:  launchctl kickstart -k $DOMAIN/$LABEL"
echo "  or:       $RUNNER --force"
echo "  preview:  $RUNNER --dry-run --force"
echo "  stop:     $REPO_ROOT/scripts/refactor/install-launchd.sh --remove"
