# AUDIT2 DELTA PACKAGE

This package contains ONLY the files that changed or were generated as a result of applying the audit2 recommendations and running the Series E/F rehearsals.

## Contract Patches (Consensus-Enforced)
- `sil/SeriesFactory-v11.sil`: Added `require(buyerScheme == IDENTIFIER_PUBKEY)`, `require(royalty_bips >= 1)`, and `require(program_hash == blake2b(engine_code))`.
- `sil/OfferEscrow-v4.sil`: Added `MAX_PRICE` constant, upper bound check in `accept()`, and pairwise-distinct output index checks.

## Tooling & Transport Patches
- `network.js`: Mainnet wRPC endpoints removed; now strictly env-driven via `PC_MAINNET_WRPC` to prevent silent testnet host reuse.
- `offer-lib.js`: `feeLoop` patched to surface REST fallback errors alongside wRPC errors (previously swallowed the REST message).
- `verify-render-v10.js`: Added a hard-stop provenance guard that fails fast if `RELIKS_ENGINE` hash != ledger `program_hash`.

## Rehearsal Records (Proven on Testnet-10)
- `data/factory-abi-f-audit2.json` & `data/factory-args-f-audit2.json`: The exact compiled template and args for Series F (DAG-city engine on audit2 templates).
- `data/factory-ledger-f-audit2.json`: The on-chain genesis and mint records for Series F.
- `data/escrow-abi-v4-audit2.json` & `data/escrow-ledger-f-audit2.json`: The patched escrow template and its on-chain offer/accept records.
- `reliks-gallery-f-audit2.html`: The trustless browser gallery verifying Series F 12/12.

## Key Findings During Rehearsal
1. **REST Broadcast Limitation**: Discovered that Kaspa REST broadcast drops `compute_budget` (limit=9999), meaning REST *cannot* carry covenant spends. wRPC is strictly mandatory for all covenant transactions. This is pinned in `HANDOFF.md`.
2. **Provenance Drift**: During the audit2 shuffle, Series E was accidentally baked with the v10 engine instead of the mainnet candidate. The new `verify-render` guard caught this instantly. Series F was then deployed with strict inline ABI-embed assertions to guarantee the DAG-city engine was baked.

All audit2 `require` statements executed successfully on-chain during the Series F mints and secondary market (list/buy/offer/accept) smoke tests.
