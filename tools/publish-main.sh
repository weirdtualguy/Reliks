#!/bin/sh
# Fast-forwards origin/main to the current branch, only if the new commits hold no key-like strings and CI is green for this exact commit.
cd "$(git rev-parse --show-toplevel)" || exit 1
git fetch -q origin || { echo "NOT PUBLISHED (fetch failed)"; exit 1; }
br=$(git rev-parse --abbrev-ref HEAD); head=$(git rev-parse HEAD); base=$(git rev-parse origin/main)
[ "$head" = "$base" ] && { echo "main is already at HEAD"; exit 0; }
hits=$(git diff "$base"..HEAD | grep '^+' | grep -iE '(priv|secret|seed|mnemonic|wif)[A-Za-z_]*["'"'"' :=]+[0-9a-f]{64}|BEGIN [A-Z ]*PRIVATE KEY|PC_PRIV=[0-9a-f]{20,}' | cut -c1-110)
runs=$(curl -s "https://api.github.com/repos/weirdtualguy/Reliks/actions/runs?branch=$br&per_page=1")
sha=$(echo "$runs" | grep -o '"head_sha": *"[0-9a-f]*"' | head -1 | grep -o '[0-9a-f]\{40\}')
con=$(echo "$runs" | grep -o '"conclusion": *"[a-z_]*"' | head -1 | grep -o '"[a-z_]*"$')
echo "scan hits: ${hits:-none} | CI sha match: $([ "$sha" = "$head" ] && echo yes || echo NO) | CI conclusion: ${con:-none yet}"
if [ -z "$hits" ] && [ "$sha" = "$head" ] && [ "$con" = '"success"' ]; then
  git checkout -q main && git merge --ff-only "$br" && git push origin main && git checkout -q "$br" && echo PUBLISHED && git log --oneline origin/main | head -1
else echo "NOT PUBLISHED"; exit 1; fi
