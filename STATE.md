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
