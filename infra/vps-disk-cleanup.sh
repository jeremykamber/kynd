#!/usr/bin/env bash
#
# vps-disk-cleanup.sh — reclaim disk on the Kynd VPS.
#
# The VPS fills up over time because aborted `ollama pull` downloads leave
# multi-GB `-partial` blob files behind in the models directory. This script
# deletes known-reclaimable data and is safe to run repeatedly. It is invoked
# every 6 hours by jeremykamber's crontab, via a NOPASSWD sudoers rule for this
# exact path:
#
#   jeremykamber ALL=(root) NOPASSWD: /home/jeremykamber/dev/kynd/infra/vps-disk-cleanup.sh
#
# Usage:
#   sudo ./vps-disk-cleanup.sh            # clean
#   sudo ./vps-disk-cleanup.sh --dry-run  # show what would be deleted
#
# Env:
#   DISK_CLEANUP_LOG   override log path (default /var/log/kynd-disk-cleanup.log)
#
# Exit: 0 on success, 1 if the root filesystem is still >95% used afterwards.

set -uo pipefail

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

LOG="${DISK_CLEANUP_LOG:-/var/log/kynd-disk-cleanup.log}"
OLLAMA_MODELS="/usr/share/ollama/.ollama/models"
BLOBS="$OLLAMA_MODELS/blobs"
MANIFESTS="$OLLAMA_MODELS/manifests"
PM2_LOG_DIRS=("/home/jeremykamber/.pm2/logs" "/root/.pm2/logs")
# rsyslog files. When the disk fills, rsyslogd's "write error" messages are
# themselves written to these files, so a full disk creates a runaway feedback
# loop of log spam. Capping them keeps that loop from re-inflating the disk.
SYSLOG_FILES=("/var/log/syslog" "/var/log/syslog.1" "/var/log/daemon.log" "/var/log/daemon.log.1")
NPM_CACHE="/home/jeremykamber/.npm"
PM2_LOG_MAX_BYTES=$((200 * 1024 * 1024))    # 200 MiB
SYSLOG_MAX_BYTES=$((200 * 1024 * 1024))     # 200 MiB
NPM_CACHE_MAX_BYTES=$((1024 * 1024 * 1024)) # 1 GiB
JOURNAL_MAX="100M"
HIGH_WATER=95

log() {
  printf '%s %s\n' "$(date +%FT%T%z)" "$*" | tee -a "$LOG"
}

# Human-readable MiB for a byte count.
mib() { awk -v b="${1:-0}" 'BEGIN { printf "%d MiB", b / 1048576 }'; }

root_used_pct() { df --output=pcent / | tail -n1 | tr -dc '0-9'; }

# Sum of allocated bytes for the paths on stdin (0 if empty).
alloc_bytes() {
  local total
  total=$(xargs -d '\n' -r du -cB1 -d0 2>/dev/null | tail -n1 | cut -f1)
  echo "${total:-0}"
}

# Digest hex strings (without the "sha256:" prefix) referenced by any manifest.
referenced_digests() {
  find "$MANIFESTS" -type f -exec cat {} + 2>/dev/null \
    | grep -o '"digest":"sha256:[0-9a-f]\{64\}"' \
    | sed 's/.*sha256://; s/"//' | sort -u
}

# Blob paths currently handed to a live `ollama runner` (in-flight inference).
running_blobs() {
  local p
  for p in /proc/[0-9]*/cmdline; do
    tr '\0' ' ' < "$p" 2>/dev/null
  done | tr ' ' '\n' \
       | grep -o "$BLOBS/sha256-[0-9a-f]\{64\}$" | sort -u
}

cleanup_ollama() {
  [ -d "$BLOBS" ] || return 0

  # 1. Aborted downloads. Skip entirely while a download/create is in flight:
  #    a fresh -partial mtime (last 10 min) or a live `ollama pull`.
  local active=0
  if find "$BLOBS" -name '*-partial*' -newermt '-10 minutes' -print -quit 2>/dev/null | grep -q .; then
    active=1
  fi
  pgrep -af 'ollama.*(pull|create)' >/dev/null 2>&1 && active=1

  if [ "$active" -eq 1 ]; then
    log "ollama: download in progress, skipping aborted partials"
  else
    local files
    files=$(find "$BLOBS" -name '*-partial*' 2>/dev/null)
    if [ -n "$files" ]; then
      local n bytes
      n=$(printf '%s\n' "$files" | wc -l)
      bytes=$(printf '%s\n' "$files" | alloc_bytes)
      [ "$DRY_RUN" -eq 0 ] && printf '%s\n' "$files" | xargs -r rm -f
      log "ollama: removed $n aborted download(s), freed $(mib "$bytes")"
    fi
  fi

  # 2. Complete blobs no manifest references and no running runner holds open.
  local keep open f digest
  keep=$(referenced_digests)
  open=$(running_blobs)
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    digest=$(basename "$f" | sed 's/^sha256-//')
    printf '%s\n' "$keep" | grep -qx "$digest" && continue
    printf '%s\n' "$open" | grep -qx "$f" && continue
    [ "$DRY_RUN" -eq 0 ] && rm -f "$f"
    log "ollama: removed orphaned blob $(basename "$f")"
  done < <(find "$BLOBS" -maxdepth 1 -regextype posix-extended \
             -regex '.*/sha256-[0-9a-f]{64}' 2>/dev/null)
}

cleanup_pm2_logs() {
  local dir f bytes
  for dir in "${PM2_LOG_DIRS[@]}"; do
    [ -d "$dir" ] || continue
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      bytes=$(stat -c%s "$f" 2>/dev/null || echo 0)
      [ "$bytes" -gt "$PM2_LOG_MAX_BYTES" ] || continue
      [ "$DRY_RUN" -eq 0 ] && truncate -s 0 "$f"
      log "pm2: truncated $f ($(mib "$bytes"))"
    done < <(find "$dir" -type f -name '*.log' 2>/dev/null)
  done
}

cleanup_syslog() {
  local f bytes
  for f in "${SYSLOG_FILES[@]}"; do
    [ -f "$f" ] || continue
    bytes=$(stat -c%s "$f" 2>/dev/null || echo 0)
    [ "$bytes" -gt "$SYSLOG_MAX_BYTES" ] || continue
    [ "$DRY_RUN" -eq 0 ] && truncate -s 0 "$f"
    log "syslog: truncated $f ($(mib "$bytes"))"
  done
}

cleanup_journal() {
  command -v journalctl >/dev/null 2>&1 || return 0
  [ "$DRY_RUN" -eq 0 ] && journalctl --vacuum-size="$JOURNAL_MAX" >/dev/null 2>&1
  log "journal: vacuumed to $JOURNAL_MAX"
}

cleanup_npm_cache() {
  [ -d "$NPM_CACHE" ] || return 0
  local bytes
  bytes=$(du -sB1 "$NPM_CACHE" 2>/dev/null | cut -f1)
  bytes=${bytes:-0}
  [ "$bytes" -gt "$NPM_CACHE_MAX_BYTES" ] || return 0
  if [ "$DRY_RUN" -eq 0 ]; then
    rm -rf "$NPM_CACHE"
    install -d -o jeremykamber -g jeremykamber -m 755 "$NPM_CACHE"
  fi
  log "npm: cleared cache ($(mib "$bytes"))"
}

main() {
  log "start: root filesystem $(root_used_pct)% used"
  cleanup_ollama
  cleanup_pm2_logs
  cleanup_syslog
  cleanup_journal
  cleanup_npm_cache
  local used
  used=$(root_used_pct)
  log "end: root filesystem ${used}% used"
  [ "$used" -le "$HIGH_WATER" ]
}

main
