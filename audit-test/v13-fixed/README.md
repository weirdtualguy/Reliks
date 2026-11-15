# audit-test — audit evidence suite (testnet-10 only)

This directory holds the evidence for the Reliks audit (phases 1–10) and the
testnet-10 test scripts. **Nothing here deploys to mainnet.** The deployable
contracts live in `contracts/` at the repo root; the mainnet builders
(`deploy-mainnet.js`, `mint-mainnet.js`, `secondary-mainnet.js`,
`gen-factory-args-fixed.js`) load their ABIs from `contracts/`.

## Testnet ledgers — DEPRECATED

Every `ledger*.json`, `escrow-*.json`, `escrow-ledger*.json`, and
`series-fixed*.json` in this directory is **testnet-10 state — deprecated**.
They record the testnet series (serials 0–3, artist key1) and the test offers
used to prove IN-01 and IN-03. They must never be used for a mainnet deploy.
They are gitignored and uncommitted on purpose. The mainnet ledger is
`ledger-mainnet.json` (created by `deploy-mainnet.js` on the user's device).

## Evidence scripts (committed)

The `*-fixed.js` builders are the testnet scripts that proved each audit
finding and fix on-chain (accept, cancel, expire, combined buy+accept, the
IN-03 attack script, the fork/double-mint negatives, and the decoy-mint
negative). They are testnet-only: they refuse to run unless
`PC_NET=testnet`. They read keys only from `process.env` (`PC_PRIV`,
`PC_WALLET`); no key or seed is hardcoded in any of them.

## Canonical ABIs

`out/{factory,edition,escrow}.json` are the compiled ABIs of the canonical
contracts. `contracts/*.json` at the repo root are copies of the same ABIs —
the builders load those. `tools/verify-contract.js` checks both copies
against the pinned hashes in `TEMPLATE-HASHES.json`.
