# Reliks
**Trustless generative art on Kaspa Toccata.**

Reliks is a UTXO-native generative art protocol. The artwork's genome (an
integer-only JavaScript engine) is baked into the covenant template and rendered
deterministically from chain state — no IPFS, no servers, no sigscripts.

## Why Reliks
- **Chain-anchored genomes:** engine bytes live inside the factory template;
  pruning the art means pruning the chain.
- **Trustless verification:** the browser gallery recomputes every edition from
  the live UTXO set with a 14-gate lineage suite.
- **Deterministic PRNG:** seeded xorshift + integer math give byte-identical SVG
  on Node and in every browser, forever.
- **Model B economics:** on-chain artist royalties, 1% escrow premium,
  permissionless secondary markets — all enforced by covenant logic.

## Architecture
- `sil/SeriesFactory-v11.sil` — mint / fork / close; stores the engine;
  consensus guards: buyerScheme==PUBKEY, royalty_bips>=1,
  program_hash==blake2b(engine_code).
- `sil/ReliksEdition-v11.sil` — list / unlist / buy / sell / transfer / spend;
  dual-field lineage (immutable mint anchor + live outpoint).
- `sil/OfferEscrow-v4.sil` — offer / accept / expire; MAX_PRICE bound and
  pairwise-distinct output indices.

## Repository layout
- `sil/` frozen Silverscript sources (the three contracts above)
- `data/` canonical series JSON + compiled ABIs (ledgers are gitignored)
- `web/` browser runtime: blake2b, gallery, studio, Kaspire WalletConnect
- `docs/` GitHub Pages hub (Gallery + Studio + Protocol) + ARCHITECTURE.md
- builders: deploy-v11, mint-v11, secondary-v11, offer-v4, accept-v4
- tooling: reliks-lens, verify-render-v10, gen-factory-args-v11,
  gen-gallery-v10, gen-studio, gen-site, reliks-audit-loop
- engines: reliks-engine-v10.js (3.9 KB), reliks-engine-titan.js (~25 KB)
<!-- EOF-README-1 -->

## Artist quickstart
1. Open the Studio (hub → Studio tab, or `node gen-studio.js` locally).
2. Write `function reliks(L, serial){ ... }` using only the integer R.* API.
3. Export engine .js + series .json (Kaspire connect auto-fills artist pubkey).
4. Gate it: `node reliks-lens.js my-engine.js` → ALL GATES PASS.
5. Bake, compile, deploy:
   RELIKS_ENGINE=./my-engine.js RELIKS_ARGS=data/factory-args-mine.json \
     node gen-factory-args-v11.js data/series-mine.json
   silverc sil/SeriesFactory-v11.sil \
     --constructor-args data/factory-args-mine.json -o data/factory-abi-mine.json
   node deploy-v11.js && node mint-v11.js && node verify-render-v10.js

## Collector quickstart
- Verify: hub Gallery recomputes each edition against the live UTXO set.
- Trade: `node secondary-v11.js list <idx> <sompi>` then `buy <idx>`;
  offers: `node offer-v4.js <idx> <sompi> <premium>` then `node accept-v4.js`.

## Prerequisites
Node 18+; `npm i @noble/hashes @noble/secp256k1 ws`; `silverc` in PATH.

## Mainnet transport requirement
REST broadcast drops compute_budget (limit=9999), so covenant spends MUST use
wRPC. `PC_NET=mainnet` without `PC_MAINNET_WRPC` hard-exits, and feeLoop refuses
REST fallback for covenant spends. See docs/ARCHITECTURE.md.

## Security, audits, engine ceiling
Consensus-enforced invariants and the audit history live in SECURITY.md.
Engine ceiling: PUSHDATA2 caps one push at 65535 B and the mint sigscript
carries the engine twice (suffix + engineBaked anchor), so the practical cap is
about 25.6 KB; reliks-lens gate L1 enforces it.

## License
MIT
<!-- EOF-README-2 -->
