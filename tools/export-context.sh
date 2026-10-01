#!/bin/sh
# Copies the AI context files to a folder you can upload to a public GitHub repo from the phone.
cd "$(git rev-parse --show-toplevel)" || exit 1
OUT="${1:-$HOME/storage/downloads/reliks-ai-context}"
if grep -Eq 'PC_PRIV=[0-9a-fA-F]{64}' AI-CONTEXT.md STATE.md; then echo "REFUSING: a key-like string is in the context files"; exit 1; fi
mkdir -p "$OUT" && cp AI-CONTEXT.md STATE.md "$OUT"/
cat > "$OUT/README.md" <<'EOT'
Context bundle for AI assistants working on Reliks (Kaspa generative-art covenants).
Give a new AI the raw URL of AI-CONTEXT.md (stable rules, model and map) and paste the owner's current STATE.md.
EOT
echo "exported to $OUT"; ls -l "$OUT"
