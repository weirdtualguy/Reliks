#!/bin/bash
# Reliks repo cleanup, stage 1 (tier A only). Nothing is deleted:
#   - tracked files are removed with `git rm` (history + tag keep them)
#   - untracked/ignored files are MOVED to ~/reliks-trash-<date>, never rm'd
# Default is a dry run. Apply with:  APPLY=1 bash cleanup.sh
# Run from the repo root (~/pixel-cove).
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1

STAMP=$(date +%Y%m%d)
TRASH="$HOME/reliks-trash-$STAMP"
APPLY="${APPLY:-0}"

# Tier A: obsolete, superseded or scratch. Edit this list freely.
TIER_A="
HANDOFF.md
HANDOFF-LOCAL.md
HANDOFF-LOCAL2.md
HANDOFF-AI.md
PUBLISH-READINESS-2026-09-27.md
prune.txt
whitelist.txt
lens-out
tmp
refs
reliks-audit-chunked.js
reliks-audit-core.js
reliks-audit-loop.js
list-via-rest.js
wait-for-list.js
reliks-engine-v10.js
archive
sil/legacy
data/legacy
v13/archive
v13/ws-probe.html
"
# Private files: moved OUT of the repo folder, not trashed. Keep them safe.
PRIVATE="secrets.env secrets-v11.env secrets.mainnet.env"

say() { echo "$*"; }
run() { if [ "$APPLY" = 1 ]; then "$@"; else echo "  [dry] $*"; fi; }

say "== repo: $(pwd)  mode: $([ "$APPLY" = 1 ] && echo APPLY || echo DRY-RUN)"

if [ "$APPLY" = 1 ]; then
  say "== 1. safety net"
  git tag -f "pre-cleanup-$STAMP" >/dev/null 2>&1
  git branch -f "backup/pre-cleanup-$STAMP" >/dev/null 2>&1
  mkdir -p "$TRASH" "$HOME/reliks-private"
  # snapshot of everything on disk that git does not track (ledgers, ABIs, keys)
  tar czf "$HOME/reliks-local-state-$STAMP.tgz" \
    --exclude=node_modules --exclude=.git . 2>/dev/null \
    && say "   full snapshot: ~/reliks-local-state-$STAMP.tgz"
fi

say "== 2. baseline (must pass before and after)"
if [ "$APPLY" = 1 ]; then
  npm test >${TMPDIR:-$HOME}/reliks-before.log 2>&1 && say "   npm test: PASS" || { say "   npm test FAILS before cleanup, aborting (see ${TMPDIR:-$HOME}/reliks-before.log)"; exit 1; }
fi

say "== 3. move private files out of the repo folder"
for f in $PRIVATE; do
  [ -e "$f" ] && { say "   $f -> ~/reliks-private/"; run mv "$f" "$HOME/reliks-private/"; }
done

say "== 4. tier A removal"
for p in $TIER_A; do
  [ -e "$p" ] || continue
  if git ls-files --error-unmatch "$p" >/dev/null 2>&1 || [ -n "$(git ls-files "$p" 2>/dev/null | head -1)" ]; then
    say "   git rm   $p"; run git rm -rq --ignore-unmatch "$p"
  fi
  # whatever is left on disk (ignored/untracked) goes to the trash folder
  if [ -e "$p" ]; then
    say "   move     $p -> $TRASH/"
    if [ "$APPLY" = 1 ]; then mkdir -p "$TRASH/$(dirname "$p")"; mv "$p" "$TRASH/$p"; else echo "  [dry] mv $p $TRASH/$p"; fi
  fi
done

say "== 5. verify"
if [ "$APPLY" = 1 ]; then
  npm test >${TMPDIR:-$HOME}/reliks-after.log 2>&1 && say "   npm test: PASS" || say "   npm test FAILED, see ${TMPDIR:-$HOME}/reliks-after.log (restore: git reset --hard pre-cleanup-$STAMP)"
  sh tools/check.sh >${TMPDIR:-$HOME}/reliks-check.log 2>&1; tail -3 ${TMPDIR:-$HOME}/reliks-check.log
  git status --short | head -40
  say "== done. Review, then: git commit -m 'Clean up: remove superseded v11/handoff/audit scratch files'"
  say "   Undo everything: git reset --hard pre-cleanup-$STAMP  (untracked files are in $TRASH)"
else
  say "== dry run finished. Re-run with APPLY=1 to execute."
fi
