# Changelog

## 12.0.0: zero-fee protocol
- Removed treasury and marketplace premium. Artist receives 100% of primary sales; secondaries enforce royalty-only exact splits.
- Contracts: `SeriesFactory-v12` (span 135), `ReliksEdition-v12` (161), `OfferEscrow-v5` (161).
- Tooling cleanup (no contract or template changes):
  - Rewrote `bech32-kaspa.js` as a direct implementation (was a brute-force calibration).
  - `reliks-lib.js` now verifies `PC_WALLET` against the address derived from `PC_PRIV`; removed five copies of an eval-based check from the builders.
  - Renamed `verify-render-v10.js` to `verify-render.js` and `gen-gallery-v10.js` to `gen-gallery.js`; defaults now target v12 data and the mainnet engine.
  - `mint-v12.js` uses the network's kascov URL instead of a hardcoded mainnet one.
  - New `gen-factory-args.js` (v12 args generator) and `test/self-test.js` (`npm test`, network-free).
  - Studio no longer exports the obsolete `treasury` field.
  - Removed dead `vendor-crypto.js` and the `esbuild` devDependency; dropped the stale lockfile (run `npm install`).
  - Archived superseded ABIs/contracts under `data/legacy/` and `sil/legacy/`.
  - `secrets.env.example` now lists the variables the code reads.
  - Docs: rewrote ARCHITECTURE and MAINNET-RUNBOOK, added AUDIT-SUMMARY and ENGINEERING-NOTES.

## History (v1 to v11)
- v1 to v4: art in factory state; audit fixes (close gate, value conservation, royalty bounds).
- v5 to v7: multi-chunk art, macro-lowered mint, parallel mint lanes with outpoint-derived serials.
- v8 to v10: engine baked into the template; art recomputed from `(engine, serial)`, prune-independent.
- v11: royalty-only secondaries, escrow, dual-field lineage. Superseded by v12.
