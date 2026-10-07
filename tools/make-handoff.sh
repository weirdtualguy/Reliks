#!/bin/sh
# Builds a small, curated zip of the CURRENT Reliks design for handing to other AI assistants.
# Only git-tracked files are included (ledgers, keys and local files can never leak); the copy is scanned for key-like strings.
# Usage: sh tools/make-handoff.sh [full]       Output: $HANDOFF_OUT (default ~/storage/downloads)/reliks-handoff-<mode>-<date>.zip
cd "$(git rev-parse --show-toplevel)" || exit 1
MODE=${1:-lite}; OUT_DIR=${HANDOFF_OUT:-$HOME/storage/downloads}; STAMP=$(date -u +%Y-%m-%d)
W=${TMPDIR:-/tmp}/reliks-handoff-$$; D=$W/reliks-handoff
rm -rf "$W"; mkdir -p "$D" "$OUT_DIR" || exit 1
printf '# Manifest (%s, %s)\n\nApproximate tokens = bytes / 4. Read HANDOFF-AI.md first.\n\n| file | ~tokens | what it is |\n|---|---|---|\n' "$MODE" "$STAMP" > "$D/MANIFEST.md"
add() {
  f=$1; why=$2
  git ls-files --error-unmatch "$f" >/dev/null 2>&1 || { echo "SKIP (not tracked or missing): $f"; return; }
  mkdir -p "$D/$(dirname "$f")" && cp "$f" "$D/$f" || return
  sz=$(wc -c < "$f"); printf '| %s | ~%s | %s |\n' "$f" "$((sz/4))" "$why" >> "$D/MANIFEST.md"
}
add HANDOFF-AI.md "READ FIRST: what Reliks is, status, rules, facts that bite"
add STATUS.md "one-page status of what exists and what does not"
add PROTOCOL.md "protocol spec: state, derivations, edition/factory/escrow rules, reading model, claims"
add v13/SPEC-GAPS.md "numbered findings and open issues (read only the items you need)"
add v13/RELIKS-VM-SPEC.md "Reliks-VM rev 2, the art VM (for VM or art-program work)"
add sdk/README.md "SDK overview and CLI usage"
add v13/SeriesFactory-v13-draft.sil "factory contract (mint, fork, close)"
add v13/ReliksEdition-v13-draft.sil "edition contract (list, unlist, buy, sell, transfer, spend)"
add v13/OfferEscrow-v6-draft.sil "offer escrow contract (accept, expire)"
add web/reliks-chain.js "codec: state encoding, derivations, mint builder, address and covenant-id helpers"
add web/kaspire.js "browser wallet connector (extension and WalletConnect), signPskt, broadcast"
add sdk/read.js "verify editions: program hash, render, script rebuild, on-chain status"
add sdk/claim.js "claim format and verifyClaim, with provenance"
add sdk/lane.js "resolve a lane's state from kascov"
add sdk/templates.js "per-series templates from a factory ABI"
add sdk/plan.js "mint planning and invariants, signed-tx check, rejection classifier"
add sdk/sign.js "signature hash and wallet signing"
add sdk/submit.js "submitSafe: never blindly resubmit"
add sdk/submit-node.js "wRPC submit adapter (dry run by default)"
add sdk/node-lookup.js "node lookup used to decide whether a transaction landed"
add sdk/flow.js "confirmMined"
add sdk/mint-flow.js "staged mint orchestration and ledger rules"
add sdk/mint.js "CLI: dry run, sign, send with a typed serial"
add sdk/escrow.js "escrow state encoding and script rebuild"
add v13/vm/rvm.js "reference VM interpreter (JavaScript)"
add v13/vm/dagcity.py "example VM program (DAG-City) in assembly"
add tools/check.sh "the health check: shows what is verified and how"
add tools/verify-contract.js "recompiles contract sources and compares them with the deployed ABIs"
add package.json "dependencies and scripts"
if [ "$MODE" = full ]; then
  add v13/vm/rvm.py "second VM interpreter (Python)"
  add v13/vm/rvm.c "third VM interpreter (C)"
  add v13/vm/gen_vectors.py "VM test-vector generator"
  add v13/vm/vectors.json "VM test vectors"
  add sdk/ref_protocol.py "independent Python reference for state and derivations"
  add sdk/protocol-vectors.json "protocol test vectors"
  for f in $(git ls-files 'sdk/test-*.js' 'test/*.js'); do add "$f" "test"; done
fi
hits=$(grep -rIiE '(priv|secret|seed|mnemonic|wif)[A-Za-z_]*["'"'"' :=]+[0-9a-f]{64}|BEGIN [A-Z ]*PRIVATE KEY|PC_PRIV=[0-9a-f]{20,}' "$D" | sed -E 's/[0-9a-f]{40,}/<hex>/g' | cut -c1-120)
[ -z "$hits" ] || { echo "ABORTED: key-like strings found:"; echo "$hits"; rm -rf "$W"; exit 1; }
tot=$(find "$D" -type f ! -name MANIFEST.md -exec cat {} + | wc -c)
printf '\nTotal: about %s tokens (bytes / 4).\n' "$((tot/4))" >> "$D/MANIFEST.md"
OUT="$OUT_DIR/reliks-handoff-$MODE-$STAMP"
python3 -c "import shutil,sys; shutil.make_archive(sys.argv[1],'zip',sys.argv[2],'reliks-handoff')" "$OUT" "$W" || { echo "zip failed"; exit 1; }
echo "wrote $OUT.zip | $(wc -c < "$OUT.zip") bytes zipped | about $((tot/4)) tokens if everything were read"
python3 -c "import zipfile,sys; print(len(zipfile.ZipFile(sys.argv[1]).namelist()), 'files in the zip')" "$OUT.zip"
echo "heaviest files (bytes):"; find "$D" -type f ! -name MANIFEST.md -exec wc -c {} + | sort -rn | sed -n 2,7p
rm -rf "$W"
