# Changelog

## 12.1.0: verified site, Kaspire wallet
- New site (`docs/index.html`, built by `gen-site.js`): one self-contained file, no external scripts, styles or fonts. Recomputes engine hash, image hash, serials, contract scripts and covenant ids in the browser and withholds art on any mismatch. Fails closed when the chain is unreachable (shown as not fully verified, never as verified).
- Wallet: Kaspire Extension (`window.kaspire`, default) and Kaspire Mobile (WalletConnect, pinned, loaded only on demand). Post-signature verification before broadcast. Never sees a key.
- Mint builder in the browser (`web/reliks-chain.js`), tested against `mint-v12.js` semantics. Fixes two defects in the previous browser builder: it pushed the successor lane's redeem script instead of the current one, and it asked the wallet for `kaspa_signTransaction`, which Kaspire does not offer.
- Site data now comes from `data/mainnet-anchors.json` (claims verified on load) and `reliks-templates.js` (templates derived from the compiled ABIs) instead of hand-pasted blobs.
- Claims corrected: no "zero-fee" (network fees and a 1 KAS carrier apply), no "survives pruning", royalty scope stated, mainnet genesis described as a sold-out single edition at 1 KAS. Removed unverifiable "gates 12/12" and "market: proven" cards.
- One shared zero-dependency BLAKE2b (`web/blake2b.js`, keyed mode added, cross-checked against Python hashlib) replaces two copies.
- Removed: `gen-studio.js`, `web/mint-codec.js`, `web/mint-builder.js`, `web/mint-flow.js`, `web/tx-lifecycle.js`, `web/studio-wallet.js`, `refresh-mint-codec.js`. The Studio is now the site's Studio tab.
- Tests: `chain-test.js`, `wallet-test.js`, `site-test.js` (drift, self-containment, wording). CI workflow added. No contract or template changes.

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
