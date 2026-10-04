# sdk/ (Reliks, testnet, work in progress)

Pure-function helpers for reading Reliks editions and building mint transactions. No key is ever read. **No real transaction has been sent through any path here.** Everything below the read half is tested with mocks only.

## Read half
- `read.js`: `verifyEdition` (program hash + render through `v13/vm/rvm.js`), `verifyAnchor` (serial 1, zero lineage, sales 0), `verifyEditionScript` (rebuild the edition script from template + ledger state, offline), `verifyEditionOnChain` (compares against kascov, freshness-gated).
- `verify-live.js`: read-only CLI. `PC_NET=testnet node sdk/verify-live.js [ledger.json]`.

`verifyEditionOnChain` statuses: `confirmed`, `spent`, `absent`, `live_other_outpoint`, `ledger_mismatch`, `unreachable`, and `index_stale`. The index counts as stale when tip age plus sync lag exceeds 600 s, or when that number cannot be read. A stale index returns `index_stale` and keeps what it showed in `observed`; it never reports `confirmed` or `absent`.

## Write half (planning and safe submission)
- `plan.js`: `planMint` wraps `web/reliks-chain.js` `buildMint` and checks value conservation, next-state lane script, covenant bindings, edition script, serial, artist payout and fee. `checkSigned` verifies a wallet-returned transaction against the reviewed draft. `classifyRejection` returns `duplicate`, `fee`, `transient`, `stale` or `fatal`; only "already in the mempool" is an observed node message, the other patterns are guesses, and unknown text is `fatal`.
- `submit.js`: `submitSafe` retries identical bytes only after a transient error and a lookup that says `absent`. Any ambiguity stops. Fee errors return `needs_rebuild` with a `nextFee` (required fee + 10% + 1, as in `reliks-lib.js`); the caller must re-plan and re-sign.
- `node-lookup.js`: `absent` only if every node answers cleanly, a wallet-signed input is still unspent on every node, and the mempool is empty. `mined` and `mempool` need a txid hint. Anything else is `unknown`.
- `submit-node.js`: wRPC `submitTransaction`. Dry run unless `send: true`. `allowOrphan` defaults to false; `reliks-lib.js` sends true, and whether covenant spends need it is untested.
- `flow.js`: `confirmMined`. Write ledger entries only after `mined === true`. "Mined" means the outputs were seen in a node UTXO set; there is no confirmation depth.

## Known limits
- `estimateSize` is a byte estimate, not network mass.
- Without a txid, a transaction that mined after a timed-out submit ends as `ambiguous`; check it with `tools/tx-status.js`.
- The public indexers used here (kascov, the REST API) can lag by many hours and cannot read covenant outputs of recent transactions.
- Browser use of wRPC from a deployed origin is untested; the probe in `v13/ws-probe.html` only ran from `localhost`.

## Tests
`sh tools/check.sh` runs everything. Tests that need the author's gitignored ledgers skip without them. `npm test` (and CI) does not run `sdk/`.

## Mainnet v12 (read-only)
`PC_NET=mainnet PC_MAINNET_WRPC=wss://placeholder.invalid node sdk/verify-v12.js` checks the mainnet series: engine hash, offline edition script rebuild, gated on-chain status. `network.js` demands PC_MAINNET_WRPC on mainnet, but this script never opens a wRPC connection. It does not verify the rendered art (v12 engines are JS; the SDK has no JS runner).

## Escrow (read half)
`escrow.js`: encode the 161-byte escrow state, rebuild the escrow script from `v13/out/escrow-v6.json`, and check it against a recorded script (`verifyEscrowScript`). Offline, no key. No escrow transaction building yet.

## Claims
`claim.js`: `verifyClaim` checks a claimed edition state (format in PROTOCOL.md section 11) against an index of the chain. Statuses: current, stale_state, absent, index_stale, unreachable, invalid_claim, program_mismatch, series_mismatch, outpoint_mismatch, ambiguous, history_conflict. "current" proves the state is the committed state of a live output of that covenant; it does not prove provenance (that the edition came from a factory mint) or that the presenter owns the key. CLI: `PC_NET=testnet node sdk/claim-live.js <claim.json> | --ledger <ledger.json>`.
