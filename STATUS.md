# Reliks: project status

Everything below is committed and verified by `npm test`, `node tools/verify-contract.js`, and `node tools/check-deprecated-hashes.js`.

## Canonical contracts

Deploy only from `contracts/`. Pinned hashes, SHA-256 digests, and state spans live in `TEMPLATE-HASHES.json`; `tools/verify-contract.js` hard-fails on any mismatch.

- `contracts/SeriesFactory.sil` (state span `144 B`, 8 fields) — template hash `029512ea7fa65643f5bc82f125cd23eb09b4ed5b2fe8fc9d33e5769cc3eb1014`
- `contracts/ReliksEdition.sil` (state span `203 B`, 10 fields) — template hash `9106b1426f4bb67ba4133d040b5258a9f177939c338266d249a1f8780e0ea2e5`
- `contracts/OfferEscrow.sil` (state span `161 B`, 8 fields) — template hash `18e3d59aa9403539ccb8bd04ef2c9c81fe21f0602f3ff55e9e6f0ce375d17a2b`

See `docs/MAINNET-RUNBOOK.md` for the deployment sequence.

## What exists and is verified

- **Audited Covenants (`contracts/`):** Static review, on-chain exploit/negative suite on `testnet-10`, `kaspa-redteam` consensus fuzzing, and mainnet rehearsal all passed (`docs/AUDIT-SUMMARY.md`).
- **Reliks-VM (`RVM\x01`):** Deterministic bytecode machine producing canonical SVG. Three independent implementations (JavaScript `vm/rvm.js`, Python `vm/rvm.py`, C99 `vm/rvm.c` under ASan/UBSan), 142 shared vectors (`vm/check.js`), 135 C program vectors (`vm/check3.js`), and 1,329 assembler/DSL cases (`test/asm-test.js`) agree.
- **Browser Studio & 1-Click Publishing (`docs/index.html`, `docs/studio.html`):** Supports High-Level Reliks-Script DSL (`.vars`, `seedrng`, `bg`, `for/endfor`, `if/else/endif`, `rand`), raw RVM assembly, patina/wear preview with `Enable wear` toggle, 6-gate determinism sweep, and 1-click `SeriesFactory` deployment via Kaspire (`C.buildDeploySeries`, synthesizing `029512ea…` byte-for-byte in the browser).
- **In-Browser Gallery, Secondary Market & Offline Verifier (`docs/index.html`):** Verifies Reliks-VM series across REST + kascov, supports primary **Mint**, **List for Sale**, **Buy**, **Cancel Listing**, **Transfer**, and **2-Party Atomic Bids/Offers** (`ReliksEdition.sell` via PSKT) with automatic multi-UTXO coin selection, portfolio filters, and an air-gapped Provenance Bundle verifier.
- **GitHub Actions Marketplace (`.github/workflows/`, `tools/`):** `submit-series.yml` (`tools/verify-and-add-series.js`) verifies submitted Series Anchor JSON against `RVM\x01` and Kaspa mainnet; `sync-marketplace.yml` (`tools/sync-marketplace.js`) discovers new editions and updates `docs/marketplace-index.json` every 15 minutes.
- **SDK & Specifications (`PROTOCOL.md`, `vm/RELIKS-VM-SPEC.md`, `sdk/`):** Full state/script codecs, counter-serial and lineage derivations, minimal conforming indexer API (`PROTOCOL.md` §10.1), and `ReliksOwnerChallengeV1` signed ownership proofs (`sdk/claim.js`).

## To verify locally

- Full offline test suite (10 suites): `npm test`
- Contract hash & recompile gate: `node tools/verify-contract.js`
- Deprecated hash grep gate: `node tools/check-deprecated-hashes.js`
- Verify provenance bundles offline: `npm run bundle:verify`
- Run VM lens on a program: `node cli/reliks-lens.js web/vm-templates/iso.txt`
