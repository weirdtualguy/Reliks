# STATE (volatile: update at each checkpoint with `echo "- $(date +%F) <what changed>" >> STATE.md`)

Updated 2026-10-01. Branch `v13-lineage` (local only).

## Live testnet-10 VM series (details come from `sh tools/ctx.sh`)
- Plain DAG-City clean port, 1567 B, 3 editions minted: #0 sales 1, #1 sales 3, #2 sales 0 (all owned by the operator key). All three verified on chain with JS/Python render MATCH.
- 5 mints left in the lane.

## Done
- Standalone browser demo (v13/gen-demo-v13.js) works in Kiwi.
- Wear-wash cap 14 built and cross-checked (v13/dagcity-wear14.hex) but visually imperceptible; NOT deploying a new factory for it.
- mint-v13.js lane-lookup patched; kascov lag documented.

## Decisions
- Priority: make Reliks genuinely useful and unique, not DAG-City art. Show a wallet-less demo first; browser buy flow deferred (blocked, see AI-CONTEXT).
- Patina (roof recolour from lineage) is the only per-sale visible change; it reads as random recolour, not aging. Needs a design decision.

## Next (in order)
1. Per-card provenance timeline on the demo (history from kascov /c/<cov>.json; look at the JSON shape first).
2. Decide how patina should read / pick a different aging mechanism before any new program or factory.
3. Fix the generator (make-v13-scripts.js) for the mintTxId lookup and the unlist/transfer ledger-path bug.
4. Idea backlog: provenance passport, living tickets, game items, credentials, fusion (burn two), VM Studio, embeddable verifier.

## Open from v13
- spend/burn verification and escrow-accept negative test on testnet; site VM rendering for the mainnet site; third VM implementation; docs update.
- 2026-10-01 added AI-CONTEXT.md, STATE.md, tools/ctx.sh; demo label fix committed
- 2026-10-01 tools/check.sh (all pass) and tools/export-context.sh added; context bundle exported
- 2026-10-01 demo shows per-edition history (run tools/fetch-history.js after any mint or sale, then rebuild the demo)
- 2026-10-01 generator fixed (mintTxId lane lookup, RELIKS_LEDGER in unlist/transfer); regen output identical for mint/deploy; check.sh passes
- 2026-10-01 marks3 series deployed on testnet-10: lane C ca4f4820..., genesis 4fef24e9..., program_hash ce0f4fc0..., ledger v13/ledger-marks3-v13.json, 1 edition minted (7 mints left), verify-vm-render MATCH. Marks3 replaces patina; exports needed: RELIKS_FACTORY_ABI=v13/out/factory-marks3-v13.json RELIKS_ARGS=v13/factory-args-marks3-v13.json RELIKS_ENGINE=$PWD/v13/vm-engine-shim3.js RELIKS_LEDGER=v13/ledger-marks3-v13.json
- 2026-10-01 marks3 series deployed on testnet-10: program_hash ce0f4fc0..., 1 edition minted, 7 mints left, verify-vm-render MATCH. Patina decision closed: marks3 replaces it. Gitignored files (ledger, args, ABI, shim) backed up to ~/storage/downloads/reliks-backup. Env: RELIKS_FACTORY_ABI=v13/out/factory-marks3-v13.json RELIKS_ARGS=v13/factory-args-marks3-v13.json RELIKS_ENGINE=$PWD/v13/vm-engine-shim3.js RELIKS_LEDGER=v13/ledger-marks3-v13.json
- 2026-10-01 demo + fetch-history take RELIKS_LEDGER/RELIKS_HISTORY; marks3 demo built (history in v13/history-marks3-v13.json, gitignored). After any mint/sale: fetch-history then gen-demo with the marks3 exports
- 2026-10-01 marks3: list+buy on edition 0 verified on chain (sales 1, render MATCH); demo and history refreshed; ledger backup updated
- 2026-10-01 marks3 escrow: negative test (seller short by 1 sompi) rejected by nodes, no spend; honest offer/accept verified on chain (sales 2, render MATCH). Escrow ledger v13/escrow-ledger-marks3-v13.json (gitignored, backed up). Closes 'escrow-accept negative test' from v13 open list
- 2026-10-02 Mission changed: Reliks is now infrastructure for third-party marketplaces. Read INFRA-HANDOFF.md first.
