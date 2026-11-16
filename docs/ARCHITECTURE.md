# Architecture

## Model
State lives in P2SH redeem scripts (`prefix || state || suffix`); KIP-20 covenant IDs (32 B) track lineage across changing script hashes. No IPFS, no servers, no state in signature scripts.

## Canonical Contracts (`contracts/`)
- **`contracts/SeriesFactory.sil` (template hash `029512ea…`, state span 144 B, 8 fields):** `mint` handwritten, `fork`/`close` DECL-lowered. Pays 100% of `price` to the artist, spawns a 10-field `ReliksEdition` with `serial = next_serial` and `lineage = blake2b("ReliksGenesisV2" || factory_covid || le64(next_serial))`, and continues the lane with `mints_left - 1` and `next_serial + 1`.
- **`contracts/ReliksEdition.sil` (template hash `9106b142…`, state span 203 B, 10 fields):** Routes: `list`, `unlist`, `buy`, `sell`, `transfer`, `spend`. Enforces `MIN_ROYALTY_OUT = 5,000,000` sompi (`0.05 KAS`), contiguous payment outputs (`base + 1`, `base + 2`), carrier value conservation, provenance `lineage`, and `sales` wear.
- **`contracts/OfferEscrow.sil` (template hash `18e3d59a…`, state span 161 B, 8 fields):** Routes: `accept` (owner sig, `activeInputIndex == editionInIdx + 1`, `editionOutIdx == OpAuthOutputIdx(editionInIdx, 0)`), `cancel` (offerer sig immediate withdrawal), and `expire` (2-input permissionless refund after `expireAge` sequence lock).

## Reliks-VM Determinism (`vm/`)
Host inputs derive from `blake2b("ReliksSeedV2" || le64(serial))` (8 int32 LE lanes), `serial32 = int32(serial mod 2^32)`, `pat = blake2b("ReliksPatinaV2" || lineage)[0] & 63`, and `wear = min(sales, 255)`. Programs are integer-only `RVM\x01` bytecode and emit canonical SVG.
