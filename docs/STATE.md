# STATE (volatile: update at each checkpoint with `echo "- $(date +%F) <what changed>" >> STATE.md`)

Updated 2026-11-13. Branch `main` / `v13-lineage` (pushed to origin `weirdtualguy/Reliks`).

## Live testnet-10 VM series (details come from `sh tools/ctx.sh`)
- Plain DAG-City clean port, 1567 B, 4 editions minted (4th via `sdk/mint.js` on 2026-10-06): #0 sales 1, #1 sales 3, #2 sales 0, #3 sales 0 (all owned by the operator key). Verified on chain with JS/Python/C render MATCH.
- Marks3 series (`ce0f4fc0...`), 1 edition minted (sales 3), verified on chain.

## Done
- Standalone browser demo (`v13/gen-demo-v13.js`) works in Kiwi.
- Wear-wash cap 14 built and cross-checked (`v13/dagcity-wear14.hex`) but visually imperceptible; NOT deploying a new factory for it.
- `mint-v13.js` lane-lookup patched; kascov lag documented.
- Public-release & RVM audit items completed (2026-11-13): F-01 through F-13 resolved, RVM vectors + C99 harness (with ASan/UBSan) wired into `npm test` and CI, RVM runtime + offline bundle/claim verification + multi-source agreement integrated into `docs/index.html`, `cli/reliks-lens-vm.js` and `tools/gen-provenance-bundle.js` added, VM Studio gates wired into `docs/studio.html`.

## Decisions
- Priority: make Reliks genuinely useful and unique, not DAG-City art. Show a wallet-less demo first; browser buy flow deferred (blocked, see AI-CONTEXT).
- Patina decision closed: Series A uses clean DAG-City (`v13/vm/dagcity_wear.py`), Series B uses `marks3` (`v13/dagcity_marks3.py`).
- `engine_lang` mapping frozen in `PROTOCOL.md` §6: `2` required for all new and mainnet Reliks-VM v1 series.

## Next (in order)
1. Deploy v13 Reliks-VM mainnet genesis (`engine_lang = 2`) and run one live browser mint through Kaspire Extension with a low-value wallet (`docs/WALLET.md`, F-03).
2. Browser secondary market (OfferEscrow flows in `docs/index.html`) and SDK secondary planners.
3. External review of `silverc` template internals and independent fourth RVM implementation (Rust/Zig) against the formal §12 conformance harness (`node v13/vm/check3.js`).

## Checkpoint log
- 2026-10-01 added AI-CONTEXT.md, STATE.md, tools/ctx.sh; demo label fix committed
- 2026-10-01 tools/check.sh (all pass) and tools/export-context.sh added; context bundle exported
- 2026-10-01 demo shows per-edition history (run tools/fetch-history.js after any mint or sale, then rebuild the demo)
- 2026-10-01 generator fixed (mintTxId lane lookup, RELIKS_LEDGER in unlist/transfer); regen output identical for mint/deploy; check.sh passes
- 2026-10-01 marks3 series deployed on testnet-10: lane C ca4f4820..., genesis 4fef24e9..., program_hash ce0f4fc0..., ledger v13/ledger-marks3-v13.json, 1 edition minted (7 mints left), verify-vm-render MATCH. Marks3 replaces patina; exports needed: RELIKS_FACTORY_ABI=v13/out/factory-marks3-v13.json RELIKS_ARGS=v13/factory-args-marks3-v13.json RELIKS_ENGINE=$PWD/v13/vm-engine-shim3.js RELIKS_LEDGER=v13/ledger-marks3-v13.json
- 2026-10-01 demo + fetch-history take RELIKS_LEDGER/RELIKS_HISTORY; marks3 demo built (history in v13/history-marks3-v13.json, gitignored). After any mint/sale: fetch-history then gen-demo with the marks3 exports
- 2026-10-01 marks3: list+buy on edition 0 verified on chain (sales 1, render MATCH); demo and history refreshed; ledger backup updated
- 2026-10-01 marks3 escrow: negative test (seller short by 1 sompi) rejected by nodes, no spend; honest offer/accept verified on chain (sales 2, render MATCH). Escrow ledger v13/escrow-ledger-marks3-v13.json (gitignored, backed up). Closes 'escrow-accept negative test' from v13 open list
- 2026-10-02 Mission changed: Reliks is now infrastructure for third-party marketplaces. Read INFRA-HANDOFF.md first.
- 2026-10-02 check.sh now covers marks3 + dispatch tags; npm test passes in full mode; git bundle backup in ~/storage/downloads/reliks-backup
- 2026-10-03 cleanup step 1: series-dummy.json archived; retired local leftovers moved to ~/storage/downloads/reliks-backup/retired; check.sh passes
- 2026-10-03 vm/check.js path fixed (105 vectors pass); check.sh now runs vm vectors (JS + Python regen-identical). Probe, cleanup step 1 done.
- 2026-10-03 v13/SPEC-GAPS.md written (VM spec vs code done; protocol docs pending)
- 2026-10-03 v13-lineage pushed to origin (weirdtualguy/Reliks), 106 commits; history scanned: no env/key files committed, zips hold code/ledgers only.
- 2026-10-03 sdk/read.js + sdk/selftest.js + verifyEditionScript + verifyEditionOnChain + verify-live.js + plan.js + submit.js + node-lookup.js + submit-node.js + flow.js + lane.js + sign.js + mint.js + claim.js + escrow.js implemented and tested.
- 2026-10-03 third VM implementation in C (v13/vm/rvm.c + check3.js): 135/135 program vector cases agree with Python and JS (142 total vectors); differential fuzz across 3 implementations: 0 disagreements.
- 2026-10-03 FIRST REAL SDK MINT (sdk/mint.js --send) on the testnet VM lane: tx c7fc689f54f404e0a770ddb4d303b861592d1d508c779c545a64407fccf72846, serial 8715364964266827834, edition covenant eb58c8528232c211..., fee 0.0313 KAS, price 1 KAS paid to the artist key.
- 2026-10-06 date correction: the freeze, the first real SDK mint and the cleanup happened on 2026-10-06; entries above dated 2026-10-03 span 10-03 to 2026-10-06. Tag `v13-freeze-2026-10-03` kept for history alongside corrected annotated tag `v13-freeze-2026-10-06`. Public main published at 37941b5.
- 2026-10-06 reopened the browser path for one fix: web/kaspire.js wrpcSubmit now sends a top-level mass: 0. docs/index.html regenerated. test/kaspire-mass-test.js added to npm test.
- 2026-11-04 Restructure: root scripts moved to lib/ cli/ tools/; handoff docs to docs/history/; audit-log moved to the pushed audits branch; keys moved to ~/reliks-private.
- 2026-11-05 Studio (docs/studio.html, tools/gen-studio.js) is live; web/rvm-asm.js is the JS port of rvm.py assemble(), byte-identical to Python on 1329 corpus cases.
- 2026-11-13 v12.1.1 & v13 genesis release readiness: resolved audit findings F-01..F-13, fixed LeakSanitizer path-buffer leak in `v13/vm/rvm.c`, wired RVM JS/C99/ASan/UBSan vectors into `npm test` and CI, embedded RVM runtime + offline bundle/claim verification + multi-source agreement into `docs/index.html`, added ` stats` to `rvm.js`, built `cli/reliks-lens-vm.js` and `tools/gen-provenance-bundle.js`, and wired VM Studio gates into `docs/studio.html`.
