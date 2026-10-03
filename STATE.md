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
- 2026-10-02 check.sh now covers marks3 + dispatch tags; npm test passes in full mode; git bundle backup in ~/storage/downloads/reliks-backup
- 2026-10-03 cleanup step 1: series-dummy.json archived; retired local leftovers moved to ~/storage/downloads/reliks-backup/retired; check.sh passes
- 2026-10-03 vm/check.js path fixed (105 vectors pass); check.sh now runs vm vectors (JS + Python regen-identical). Probe, cleanup step 1 done.
- 2026-10-03 v13/SPEC-GAPS.md written (VM spec vs code done; protocol docs pending)
- 2026-10-03 marks3 edition 0 sales 3: tx 86860766c7a1 is mined (its wallet outputs idx1/idx3 are in the node UTXO set, amounts match a 1 KAS self-sell); ledger entry passes consistency vs .bak3. Edition script on chain NOT independently confirmed: REST and node address lookups cannot see covenant outputs (old-series control also returned 0) and kascov tip is stale and not advancing. Do not mint while kascov is stale (mint reads the lane from it)
- 2026-10-03 marks3 edition 0 sales-3 sell: tools/tx-status.js says MINED at block DAA 586417951 (about 350 min before that check at 10 DAA/s) with both wallet outputs present; the script's 10 min confirmation wait still timed out and a retry got 'already in the mempool'. That timeline is not reconciled: the wait may have missed a tx mined inside its window. Never resubmit after a timeout; run tools/tx-status.js first
- 2026-10-03 v13-lineage pushed to origin (weirdtualguy/Reliks), 106 commits; history scanned: no env/key files committed, zips hold code/ledgers only. Handoff steps 1-3 done; next: SDK read half
- 2026-10-03 sdk/read.js + sdk/selftest.js (read half v0: program hash, anchor render, edition render; no network/key); check.sh runs it on both ledgers
- 2026-10-03 sdk/read.js verifyEditionScript: rebuilt edition script == ledger spk for all 4 editions (offline; ledger spk is hex-of-ASCII, normalized). On-chain existence still needs kascov
- 2026-10-03 sdk verifyEditionOnChain (statuses: confirmed/spent/absent/live_other_outpoint/unreachable/ledger_mismatch), mock-tested; live run pending kascov
- 2026-10-03 marks3 edition 0 sales 3: ledger txId 86860766c7a1 is the tx tx-status.js reports MINED (~528 min ago; both wallet outputs present). Edition output script at idx0 still not readable: kascov tip age ~31 h, api-tn10 answers 404. Earlier 'confirmed' results for the VM series came from the same stale index (valid as of its last update only). Still: no mint, no resubmit.
- 2026-10-03 sdk/verify-live.js (read-only live verifier; freshness-gated). With kascov tip age ~31 h every edition returns index_stale. Rerun when 'node tools/kascov-status.js' shows a small tip age.
- 2026-10-03 sdk/plan.js (planMint invariants, checkSigned, classifyRejection) + sdk/test-plan.js: 37 offline checks incl. 10 tamper cases. Only 'already in the mempool' is an observed node error string; other classifier patterns are guesses, unknown = fatal. Size is an estimate, mass unmeasured.
- 2026-10-03 sdk/submit.js submitSafe (injected node.submit + node.lookup): identical-bytes retry only on transient+absent; any ambiguity stops; fee errors -> needs_rebuild with nextFee (required+10%+1, as in reliks-lib.js); 20 mock tests incl. the sales-3 timeout-but-mined case. Real lookup adapter not written yet.
- 2026-10-03 sdk/node-lookup.js: node.lookup for submitSafe. absent only if every node clean AND a wallet-signed input still unspent AND mempool empty; mined/mempool need a txid hint; any doubt = unknown. 17 mock tests + live smoke (sdk/lookup-smoke.js, read-only) matched. Without a txid a mined-after-timeout tx ends ambiguous: run tools/tx-status.js.
- 2026-10-03 sdk/submit-node.js: wRPC submitTransaction adapter for submitSafe. Dry run unless send:true; prepare() validates offline (safe-integer values, signature present, covenant bounds); allowOrphan defaults false (reliks-lib sends true; whether covenant spends need it is UNTESTED). 29 mock tests; never sent a real tx.
- 2026-10-03 sdk/flow.js confirmMined (mined only when outputs seen in a node UTXO set, no depth) + sdk/test-e2e.js: plan -> fake-sign -> checkSigned -> prepare -> submitSafe -> confirmMined, 20 checks, mocks only. Ledger writes only after confirmMined.mined === true. No real tx sent through any SDK path.
- 2026-10-03 FIX: kascov staleness was tip age only; it missed a 34 h sync lag (tip age 440 s, lag 1.2M DAA). sdk/read.js kascovTipAgeSec now = tip age + lag/10; unreadable = stale. sdk/test-tipage.js (8 checks). sdk/README.md added. Staleness was 96250 s at last check and falling; rerun verify-live.js when it is under ~600 s.
- 2026-10-03 kascov catch-up measured (60 s sample): ~177 DAA/s vs chain 10/s; processed_daa 586030310, 387641 DAA short of the sales-3 tx (DAA ~586417951). ETA: sales-3 visible in index ~37 min, gate-fresh (<600 s) ~86 min. Recheck: PC_NET=testnet node sdk/verify-live.js [v13/ledger-marks3-v13.json]. Still no mint / no resubmit until all four editions read confirmed.
