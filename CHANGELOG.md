# Changelog

## 1.0.0 (2026-11-15)
- **Canonical Silverscript Covenants (`contracts/`, `TEMPLATE-HASHES.json`):**
  - `contracts/SeriesFactory.sil` (`029512ea…`, 8 fields, `144 B` state span): monotonic `next_serial` counter serials, `5%` minimum royalty (`500..2000` bips), contiguous artist payout (`artistOutIdx == editionOutIdx + 1`), and `1 KAS` floor per forked lane.
  - `contracts/ReliksEdition.sil` (`9106b142…`, 10 fields, `203 B` state span): contiguous payment outputs (`base + 1`, `base + 2`), `0.05 KAS` (`5,000,000` sompi) royalty mineability floor, carrier conservation, provenance `lineage`, and `sales` wear.
  - `contracts/OfferEscrow.sil` (`18e3d59a…`, 8 fields, `161 B` state span): authorized edition output binding, input adjacency (`activeInputIndex == editionInIdx + 1`) in `accept`, offerer-signed `cancel`, and 2-input index-bound `expire`.
- **Visual No-Code Studio Builder, Reliks-VM (`vm/`) & High-Level Reliks-Script DSL (`web/rvm-asm.js`):**
  - Added the interactive **Visual No-Code Layer & Parameter Builder** (`RvmAsm.compileLayers`, `RvmAsm.VISUAL_PRESETS`) with 8 composable generative layer types, color palette controls, patina/wear toggles, and live two-way DSL compilation.
  - Deterministic stack-based SVG bytecode runtime (`RVM\x01`) with JS, Python, and C99 (ASan/UBSan) interpreters verified across 142 shared vectors and 135 C program vectors.
  - High-Level Reliks-Script DSL (`.vars`, `seedrng`, `bg`, `set`, `inc`, `rand`, `for/endfor`, `if/else/endif`) and optional `Enable wear` toggle in Studio.
- **Browser Studio, Secondary Market & GitHub Actions Indexer (`web/`, `tools/`, `.github/workflows/`):**
  - In-browser `SeriesFactory` synthesis (`C.buildFactoryRedeem`) and 1-click deployment via Kaspire without `silverc`.
  - In-browser Mint, List, Buy, Cancel Listing, Transfer, 2-Party Atomic Bids/Offers (`ReliksEdition.sell` via PSKT), multi-UTXO coin selection, portfolio filters, and air-gapped Provenance Bundle verification.
