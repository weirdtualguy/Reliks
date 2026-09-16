# pixel-cove — condensed handoff
ENV: Android/Termux, ts-node; Rust cli-debugger at ~/opt/silverscript (NEW silverc: entry + macros). Studio = OLD compiler (entrypoint function).
GENESIS (TN10): playful-copper-panda eca53f21bac8f99662629d74a7713e4c482bc9baa36021ad980d317da40601cb
genesis tx b31e1b172cbef4afffb1692ccd628fe7a5f53849ba960d838e7cf68110e6daa4 | program_hash e621e41064ab5bb2c328a009e0dd0d128e010d98493ba0cf645908c6023ee445 | 10 TKAS
deploy#1 (no art): steady-cobalt-ferret 493e715293c4dca3f39897de63e900679fc9a2b5f5d52079b700df1d6531757f
PIPELINE: npx ts-node src/print-program.ts > program.hex
curl -s -X POST -H 'content-type: application/json' https://kascov.io/data/testnet-10/deploy -d "{\"program_hex\":\"$(cat program.hex)\",\"value\":1000000000}"
verify: curl -s https://kascov.io/data/testnet-10/c/<id>.json | proof+render: npx ts-node src/render-art.ts
RULES: v1 tx => computeBudget>=10 per input committed PRE-signature (sighash-covered), sigOpCount=0; REST strips computeBudget; kascov /compile args <=200 chars; silverc DROPS unused ctor args (keep reveal entry); wRPC JSON envelope unsolved — use kascov.
KEYS/constants (testnet-only): src/mint.ts. Art encoding authority: src/encoder.ts (568B = 48B palette + 4 layers; renderer stride/nibble order to reconcile with real art).

## BROADCAST PROTOCOL (proven 2026-09-07, tx 34f71fa8…)
- wRPC JSON envelope: {"id":N,"method":"<bareOpName>","params":{…}} — bare names (getInfo, submitTransaction). Nodes: electron-10.kaspa.stream / vector-10.kaspa.green / *-10.kaspa.blue, path /kaspa/testnet-10/wrpc/json.
- Node-native tx JSON (serde of rpc-core RpcTransaction): outputs use "value" (number) and FLAT hex scriptPublicKey = u16-LE version prefix + script ("0000aa20…87"); inputs need sigOpCount(number)+computeBudget(number, survives!); top level needs gas(number), payload(hex string), mass or storageMass(number); covenant = {authorizingInput, covenantId} camelCase.
- REST api-tn10 STRIPS computeBudget (limit=9999); proxy.kaspa.ws backend was partitioned (orphan loop). wRPC is the only path that carries Toccata budgets.
- v1 sighash EXCLUDES sigop/budget hashes (master sighash.rs) but INCLUDES output covenant bindings → sign AFTER bindings are final.
- kascov /preflight = offline engine verdict; /deploy = birth only (no generic broadcast).

## BROADCAST PROTOCOL (proven 2026-09-07, tx 34f71fa8…)
- wRPC JSON envelope: {"id":N,"method":"<bareOpName>","params":{…}} — bare names (getInfo, submitTransaction). Nodes: electron-10.kaspa.stream / vector-10.kaspa.green / *-10.kaspa.blue, path /kaspa/testnet-10/wrpc/json.
- Node-native tx JSON (serde of rpc-core RpcTransaction): outputs use "value" (number) and FLAT hex scriptPublicKey = u16-LE version prefix + script ("0000aa20…87"); inputs need sigOpCount(number)+computeBudget(number, survives!); top level needs gas(number), payload(hex string), mass or storageMass(number); covenant = {authorizingInput, covenantId} camelCase.
- REST api-tn10 STRIPS computeBudget (limit=9999); proxy.kaspa.ws backend was partitioned (orphan loop). wRPC is the only path that carries Toccata budgets.
- v1 sighash EXCLUDES sigop/budget hashes (master sighash.rs) but INCLUDES output covenant bindings → sign AFTER bindings are final.
- kascov /preflight = offline engine verdict; /deploy = birth only (no generic broadcast).

## COLLECTION LEDGER
#1 Genesis  cov a0a5b2e8b4c97acb1c76656708ce5cfa2477f0354155c8b1f99fe58d67ee4809 | genesis 16e5672e… | revealed 34f71fa8… (block 3ae1f3d8…)
#2 the Face cov 4783a3d844a2cc356e54a821865174dc571f9e014ee7eae27ac926e1e56c4435 | P2SH aa2077d8…e87 | token_id 2 | born via kascov /deploy
mint loop: src/mint-token2.ts (matrices → encoder → compileNftInstance → kascov /deploy) — reuse with new matrices/token_id for #3+

## M2 MILESTONE: ATOMIC SELL (proven 2026-09-08, tx 3b683545…)
- v2 contract (NftInstance.sil) supports stateful transitions with `price` and `royalty` fields.
- The `sell` entrypoint tag is `951976a2` (blake3 of `__covenant_entrypoint_auth_sell(sig,byte[32],byte,int,int)`).
- Atomic sell requires 2 inputs: [NFT UTXO (owner sig), Buyer Funding UTXO].
- Relay fee policy on TN10 requires ~2,000,000 sompi (1M coin side + 1M buyer side) to clear the mempool floor.
- The v2 dispatcher expects the exact same sigscript stack layout as v1: `[args..., tag, program]`.

## M2.5 MILESTONE: TRUSTLESS LIST & BUY (proven 2026-09-08, tx a65946cf…)
- `list` dispatcher tag: `5703f99d` (blake3 of `__covenant_entrypoint_auth_list(sig,int)`).
- `buy` dispatcher tag: `9909be01` (blake3 of `__covenant_entrypoint_auth_buy(byte[32],byte,int,int)`).
- The `buy` entrypoint requires NO signature (9,929 units vs 109k for sigs). It relies purely on tx introspection.
- CRITICAL HACK: To avoid the 500k storage mass consensus limit, combine Seller and Royalty payouts into a single output, and pass `paymentOutIdx = 1` and `royaltyOutIdx = 1` so the contract checks the same output twice. This keeps the tx at 3 outputs.
- Relay fee requires ~2,000,000 sompi (1M coin side + 1M buyer side) to clear the TN10 mempool floor.

## REVEAL MECHANIC PROVEN (2026-09-08)
- Coin #2 "sleepy-jade-hare" (4783a3d8…) born hidden; reveal tx 0e1166a4c525d6801a04d0fb357112b5dfe652aba0a60f3a9ca14ed48a4b30f3 (v1 sell path, 106,682 units).
- gallery.html: single-file viewer; fetches kascov c/<id>.json + tx jsons, scans hex runs for 568B art via layer-type markers at byte offsets 48/178/308/438, decodes palette+nibble layers, renders canvas. Unrevealed coins correctly report "hidden".
- Serve locally: python -m http.server 8158 (kascov CORS allows browser fetch).

## M6.3 FACTORY MINT PROVEN (2026-09-08, tx 5c9a118e…)
Multi-state verification ABI — AUTHORITATIVE, transcribed from silverscript-abi lib.rs:
- sigscript push order = entry.params order:
  1. State[] new_states → COLUMNAR: for each runtime-state field in declaration order
     (slot, artist, price, cap, role, counter, ownerIdentifier, identifierType):
     ONE canonical push = concat over array elements, where
       Int element  = 8-byte fixed LE script number (serialize_script_i64(v, Some(8)))
       Byte element = 1 byte;  FixedBytes element = raw bytes
  2. scalar params: byte[32] = raw 32B push; byte = 1B push; int = MINIMAL script number
  3. 4-byte dispatch tag; 4. redeem-script push appended by caller.
- Element order = bound-output order (child first, continuation second).
- mint dispatch tag = 42c6a550; mint ≈ 40,270 script units; computeBudget 60 safe.
- Factory lineage: ONE covenant id; cells = factory (role 0) + editions (role 1).
- Monuments (locked tuition): e62527d8…, plus empty-genesis deploys — never spend
  a factory.json whose genesis field is empty (fix-genesis.js pattern mandatory).

## M6.4 ROYALTY LOOP PROVEN (2026-09-08)
- edition #0: mint 5c9a118e… (40,270u) → list 4ebbf019… (119,430u, tag 5703f99d,
  sigscript [sig, int price, tag, program]) → buy b13e3a52… (19,650u, tag 9909be01,
  sigscript [buyerId, scheme, payIdx, royIdx, tag, program], NO owner sig).
- buy enforces: outputs[pay].value >= price && spk==seller; outputs[roy].value*20 >= price
  && spk==artist. Separate royalty output proven (seller 1 TKAS + artist 0.05 TKAS).
- Unit economics: mint≈40k, list≈120k (checkSig), buy≈20k (introspection only).
- Edition seed for rendering = state.counter (deterministic, gallery-renderable).
- PREFLIGHT TRUST BOUNDARY: kascov preflight validates against the utxo data YOU supply;
  the node validates against chain truth. For existing on-chain cells, always recompute
  FSPK from the SAME bytecode file the sigscript pushes, and cross-check against the
  deployed covenant before broadcasting. Symptom of mismatch: preflight ready +
  node "false stack entry at end of script execution" (P2SH hash reject).

## THE RUNAWAY FACTORY INCIDENT (2026-09-08)
- edition-run loop: `for (k = F.counter; k < F.counter + 5; k++)` with body
  `F.counter = k + 1` → sliding finish line → 34 mints before Ctrl+C.
- Rule: freeze loop bounds BEFORE mutating the state they read
  (`const START = F.counter; const END = min(START+5, 64)`).
- Fallout: harmless (cap held, cells recoverable). Silver lining: 34-mint load
  test passed with identical unit cost per mint.
- Factory2 ledger: counter 34, lastMint 3df65e38…, 30 editions of headroom.

## M8 ON-CHAIN JAVASCRIPT SERIES (2026-09-08)
- factory3 94d22e8d… genesis 77cef8b6… slot marker 0x4A (559 B JS = examples/bloom3.js)
- edition #0 mint ae36bc97… (40,270u — contract is art-language agnostic)
- Renderers: src/jsrender.ts (node vm) + gallery4.html (Web Worker). Sandbox law: bare realm,
  Date/self/fetch/importScripts shadowed, Math.random seeded from chain seed, 5s timeout +
  worker kill, 20k prim cap, 500k rng-call guard.
- lib.rs law: encode_array_payload REJECTS variable-width columns (Bytes in State[]) ⇒ slot must
  stay FixedBytes. Longer scripts ⇒ Series v4 byte[2048], or factory-holds-program +
  edition-holds-programHash(byte[32]) split.
- Marker table: 0xFE pixel v1 · 0xFF vector v2 · 0x4A JavaScript v3.

## SERIES V4 + TAG VARIABILITY (2026-09-09)
- byte[2048] art slot proven (factory4 8d936ce8…, genesis 4db3cb2c…, 984 B JS on-chain).
- Silverscript namespace rule: ctor params and state fields share one namespace.
  Use DISTINCT names (e.g. `program_art` param → `art` field) to avoid
  "variable already defined" compilation errors.
- Mint tag variability: the verification-mode `mint` dispatch tag covers the
  flattened State leaf types (driven by `flatten_struct_types` in lib.rs).
  Widening a slot (byte[568] → byte[2048]) or renaming a field changes the
  mint tag (v3: 42c6a550 → v4: b8a2310c). Singleton tags (list/buy/sell/spend)
  don't mention state and remain stable.
- Rule: mintTag MUST live in the factory ledger JSON, not hardcoded in builders.
  Probe the template's PUSH4 constants to extract the new tag on deploy.
- Witness math: v4 mint ≈ 87,630 units (heavier state pushes); sigscript ~8 KB.

## M8 dApp MINT STUDIO (2026-09-09)
- studio-server.ts (port 8160): POST /api/deploy {js} → minify→slot→compile→kascov deploy→
  genesis poll→factoryN.json; POST /api/mint {factory} → columnar witness→sign→preflight→
  broadcast; GET /api/factories. Static server doubles as gallery host.
- studio.html: code editor + live Web-Worker sandbox preview (seed/frame), minify budget
  meter (≤2045 B for v4), deploy/mint buttons, rolling log. No terminal needed to launch a series.
- Artist workflow: edit → preview → minify → deploy → mint → gallery4.html?f=factoryN.json.
- The ONLY browser-impossible step is SilverScript compilation (cli-debugger), hence the
  thin local server. Everything else (preview, minify, budget) runs client-side.

## ABI CODEC DEEP-DIVE (from lib.rs.txt)
- STATE-SPAN vs WITNESS ENCODING: Variable-width types (`Bytes`, `Text`, `DynamicArray`)
  are LEGAL in the runtime state span (`encode_state_payload` handles them) but strictly
  ILLEGAL in the columnar mint witness (`encode_fixed_payload` / `encode_array_payload`
  reject them with `UnsupportedType`). This is the exact reason the `art` slot must stay
  `FixedBytes` (e.g. `byte[2048]`), not variable `bytes`.
- DISPATCH TAGS IN ABI: `SilEntryArtifact.dispatch_tag` is compiler-emitted and stored in
  the ABI JSON artifact. If `cli-debugger` can emit the ABI JSON (e.g. `--emit-abi`),
  read the mint tag directly from the JSON instead of using the `probe-v4.ts` PUSH4-walker
  heuristic. The walker is a robust fallback for when only raw bytecode is available.
