# DEPRECATED — DO NOT DEPLOY

Every contract in this directory is deprecated, vulnerable, or superseded.
**Do not deploy, mint, list, or build offers from any file here.**

## Why these are retired

- `sil/` and `v13/` hold the v12 contracts, the escrow v5, and the pre-fix v13
  contracts. They carry the audit findings C1, H1, M1, M2 (and the escrow
  findings IN-01 and IN-03) that the canonical set fixes.
- `data/` holds the pre-fix ABIs. The v12 ABIs that the one live mainnet series
  (genesis-dag-city) still needs were NOT archived — they remain in `data/`
  (`factory-abi-v12.json`, `edition-abi-v12.json`) and are flagged "legacy,
  unsafe" by the indexer.

## Deprecated template-hash prefixes

These must never appear outside `archive/` and the audit docs (enforced by
`tools/check-deprecated-hashes.js`):

- `dcdcd59b` — pre-fix v13 edition
- `d3374ca5` — pre-fix v6 escrow
- `8eff7679` — v13 escrow, original
- `07362054` — escrow, IN-01 fix only (IN-03 vulnerable)
- `9fb49e51` — escrow, broken covenant-id count form (nested)
- `b37aa685` — escrow, broken covenant-id count form (two-line)
- `26d35f48` — legacy contract hash (deprecated)

## The canonical set (the only deployable contracts)

Deploy only from `contracts/`:

- `contracts/SeriesFactory.sil` — template hash `029512ea…`
- `contracts/ReliksEdition.sil` — template hash `9106b142…`
- `contracts/OfferEscrow.sil` — template hash `18e3d59a…`

See the root `TEMPLATE-HASHES.json` and `tools/verify-contract.js`.
Any change to a contract needs a fresh audit.
