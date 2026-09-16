# pixel-cove vault manifest — testnet-10 (updated M8 + studio)

## Crown jewels (minimum reproducible project)
- 02-core/kaspa-sighash-v1.ts — covenant-aware sighash (bindings in outputs_hash)
- 02-core/bridge3.ts — Series compile ABI (compileSeries, positional ctor-args)
- 02-core/gen2.ts — pcove VM v2 (vector, resolution-free, animated) + compiler + SVG
- 02-core/jsrender.ts — node `vm` sandbox renderer for on-chain JavaScript series
- 02-core/minify.js — whitespace-collapse JS minifier (repo keeps .readable twins)
- 02-core/genvm.ts + gencompiler.ts — pcove v1 (16×16 pixel) legacy renderer
- 01-contracts/Series.v4.sil — factory covenant, byte[2048] `art` slot (current)
- 01-contracts/Series.v3.sil — byte[568] `slot` variant (preserved)
- 03-builders/series-js.ts / series-v4.ts — JS factory deploy (persist-id-first)
- 03-builders/mint-v2.ts — parameterized mint (`npx ts-node src/mint-v2.ts factoryN.json`)
- 03-builders/edition-run.ts — capped production line (`… factoryN.json`), bound-fixed loop
- 03-builders/edition-trade.ts — list + trustless buy w/ separate 5% royalty output
- 03-builders/probe-v4.ts — PUSH4-walker dispatch-tag cracker (state-shape changes re-tag mint)
- 03-builders/render3.ts — render any factoryN.json JS slot to SVG (frames)
- 03-builders/studio-server.ts — dApp backend: /api/deploy, /api/mint, /api/factories + static
- 04-gallery/studio.html — dApp mint studio (editor, live sandbox preview, deploy, mint)
- 04-gallery/gallery4.html — JS edition browser (?f=factoryN.json), Web Worker sandbox
- 05-state/factory4.json + factory4-program.hex — LIVE v4 ledger (art slot, mintTag, counter)
- 06-art/bloom4.* — "orbital garden" JS source + minified + SVG renders
- 00-docs/HANDOFF.md — scar archive · 00-docs/lib.rs.txt — silverscript-abi codec truth

## Chain ledger (testnet-10)
- v1 pixel series 0ccce75b… gen 890b1b16… reveal db77127c… (marker 0xFE)
- v1 factory 5bf4da9f… gen bfc2c42e… counter 1 · trade 4ebbf019…/b13e3a52… (royalty proven)
- v2 vector factory 04036ec3… gen a24ccffa… counter 34 (eds #0–#33, marker 0xFF)
- v3 JS factory 94d22e8d… gen 77cef8b6… 559 B JS (marker 0x4A, byte[568] slot)
- v4 JS factory e6597754… gen 4db3cb2c… 984 B JS, mint tag b8a2310c, ed#0 8d936ce8…
- MONUMENTS (locked, never spend): e62527d8…, eced90d7…, + any empty-genesis deploys

## Marker table
0xFE = pcove v1 pixels · 0xFF = pcove v2 vector · 0x4A = JavaScript (v3/v4)

## Laws encoded in scars (see HANDOFF.md)
- preflight trusts your utxo body, node trusts chain — cross-check before broadcast
- factory redeem program is COUNTER-DEPENDENT — recompile compileSeries(role 0, counter=k) per mint
- mint dispatch tag covers flattened State leaf types — state-shape change re-tags mint;
  singleton tags (list/buy/sell/spend) are state-stable; mintTag lives in the factory ledger
- Silverscript shares one namespace for ctor params + state fields — use DISTINCT names
- columnar State[]: one push per field, ints 8-byte LE, element order = bound-output order
- mint slot must stay FixedBytes (encode_array_payload rejects variable-width columns)
