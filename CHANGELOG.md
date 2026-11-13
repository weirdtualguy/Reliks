# Changelog

## 12.1.1: public-release audit fixes & v13 Reliks-VM genesis readiness (2026-11-13)
- **Public-Release Audit Fixes (F-01 through F-13):**
  - **F-01:** Fixed `README.md` reference to superseded contract versions (`v13-lineage` branch and annotated freeze tags instead of removed `sil/legacy/` and `data/legacy/` directories).
  - **F-02:** Replaced all string-concatenated `innerHTML` assignments in `web/reliks-gallery-runtime.js` with a text-only DOM helper (`h()`), guarded by `test/vm-conformance-test.js`, and added `Content-Security-Policy` `<meta>` headers to generated pages (`tools/gen-site.js`, `cli/gen-gallery.js`, `tools/gen-studio.js`, `cli/reliks-lens.js`).
  - **F-03:** Documented the pre-announcement live Kaspire Extension mint checklist in `docs/WALLET.md`.
  - **F-04:** Ported the `needAtLeast` (`price + CARRIER + initialFee`) funding UTXO balance check and UTXO-compounding error message into `cli/mint-v12.js`.
  - **F-05:** Marked the public-endpoint `Origin` / `User-Agent` headers in `lib/reliks-lib.js` as a fallback, surfaced a clear error when all wRPC endpoints fail, and documented the `PC_MAINNET_WRPC` / `PC_TESTNET_WRPC` operator recommendation in `docs/ENGINEERING-NOTES.md`.
  - **F-06, F-07, F-09:** Cleaned stale `V11` / `Model B` / `secondary-v4.js` labels in `cli/secondary-v12.js`, removed dead `origPickUtxo` and duplicate `buildFn(fee)` calls in `lib/reliks-lib.js`, and updated the default `25641`-byte PUSHDATA2 cap comment in `cli/reliks-lens.js`.
  - **F-08:** Switched `.github/workflows/test.yml` to `npm ci`, added `npm audit --omit=dev --audit-level=high`, and wired the RVM JS/C99/ASan/UBSan conformance suites into CI and `npm test`.
  - **F-10, F-11, F-12, F-13:** Reconciled `docs/STATE.md` and `STATUS.md` branch/tag notes (adding annotated tag `v13-freeze-2026-10-06`), froze the `engine_lang` mapping (`2` required for all new/mainnet Reliks-VM series) in `PROTOCOL.md` §6, documented the `engineBaked()` compiler constant-folding guard in `sil/SeriesFactory-v12.sil` and `v13/SeriesFactory-v13-draft.sil`, and added concrete vulnerability reporting channels and RVM scope to `SECURITY.md`.
- **Reliks-VM & Decentralization Readiness (`v13/`):**
  - **CI & C99 Sanitizer Cleanliness:** Fixed a LeakSanitizer path-buffer leak on `longjmp` faults and added OOM guards in `v13/vm/rvm.c`; all 135 C program vectors now pass under `-fsanitize=address,undefined` (`test/vm-conformance-test.js` and `tools/check.sh`).
  - **Verification Site RVM & Offline Mode (`docs/index.html`, `tools/gen-site.js`, `web/site-app.js`):** Embedded `v13/vm/rvm.js` into `docs/index.html` and the Web Worker so the main site verifies and renders both v12 JS series and v13 Reliks-VM (`engine_lang = 2`, `RVM\x01`) series; added multi-source agreement reporting (REST + kascov) and an **Offline & Air-Gapped Verifier** that verifies and renders provenance bundles with zero network calls.
  - **Offline Provenance Bundles (`tools/gen-provenance-bundle.js`):** Added per-series provenance bundle generator and standalone offline verifier (`npm run bundle`, `npm run bundle:verify`), shipping `data/provenance-v12-genesis.json` and `v13/provenance-v13-demo.json`.
  - **RVM Artist Tooling (`cli/reliks-lens-vm.js`, `web/studio-vm-app.js`, `web/rvm-asm.js`):** Added `stats` collection to `v13/vm/rvm.js`, built `cli/reliks-lens-vm.js` (`npm run lens:vm`) to sweep serials × `(pat, wear)` corners against machine limits and the `25,641`-byte PUSHDATA2 baking ceiling, wired **Run gates** into `docs/studio.html`, and added source line numbers to assembler error messages in `web/rvm-asm.js` and `v13/vm/rvm.py`.
  - **Specifications (`v13/RELIKS-VM-SPEC.md`, `PROTOCOL.md`, `sdk/claim.js`):** Froze RVM v1 (`0x01`) opcode space, documented the formal stdin/stdout Conformance Harness Protocol (§12), added the Minimal Conforming Indexer API Contract (`PROTOCOL.md` §10.1), and specified + implemented `ReliksOwnerChallengeV1` signed ownership challenges (`PROTOCOL.md` §11.1, `sdk/claim.js`, `sdk/test-claim.js`).

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
