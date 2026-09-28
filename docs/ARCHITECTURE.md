# Architecture

## Model
State lives in P2SH redeem scripts (`prefix || state || suffix`); covenant IDs (32 B) track lineage across changing script hashes. No IPFS, no servers, no state in sigscripts.

## Contracts
- **SeriesFactory-v12** (`mint` handwritten, `fork`/`close` DECL-lowered; state span 135). `mint(buyer, buyerScheme, editionOutIdx, artistOutIdx)`: requires `mints_left > 0`, scheme 0, `price == 0 || price >= 1 KAS`, `1 <= royalty_bips <= 2000`; pays `artistCut == price` to the artist; spawns an Edition via `validateOutputStateWithTemplate`; continues the lane with `mints_left - 1`. Serial derives from the consumed lane outpoint. Engine bytes are baked into the template and anchored by `program_hash == blake2b(engine_code)`.
- **ReliksEdition-v12** (span 161). Routes: `list`, `unlist`, `buy`, `sell`, `transfer`, `spend`. Owner is a Schnorr pubkey. `checkPayments`: `owner >= salePrice - roy`, `artist == roy`, distinct output indices. Carrier value never decreases (except `spend`, the dust-recovery exit).
- **OfferEscrow-v5** (span 161). `accept` (owner sig, 2-input): owner receives exactly `askPrice - roy`, artist exactly `roy`, edition passes to the offerer; `expire` refunds the offerer in full after `expireAge`. Royalty and artist are bound to the edition's authenticated state.

## Lineage
- Immutable: `mintTxId`, `mintIndex` (serial recomputation, engine containment).
- Mutable: `txId`, `index` (live outpoint for spending and live-UTXO anchoring).

## Determinism
`seed = serial mod 2^32`; `lanes = blake2b("ReliksSeedV10" || le64(seed))` as 8 int32 LE; engines are integer-only and emit SVG. `render_hash = blake2b(render(1))` is anchored at genesis.

## Fees and limits
Mempool fee is about 200 sompi per tx byte; `feeLoop` discovers it from rejections. The mint sigscript carries the engine twice, so engines are capped by PUSHDATA2 at roughly 25.6 KB. Details in [ENGINEERING-NOTES.md](ENGINEERING-NOTES.md).

## Transport
Covenant spends are wRPC-only. `network.js` profiles: testnet by default; mainnet requires `PC_MAINNET_WRPC` (hard exit otherwise). Confirmation uses REST, then kascov.

## Verification surface
- Browser: gallery gates, per-edition lineage checks, live-UTXO anchoring via bech32 P2SH addresses (`web/reliks-gallery-runtime.js`).
- Node: `verify-render.js` (lineage, serial, spk, F1 engine containment) and `reliks-lens.js` (L0-L10).
- Offline: `npm test`.
