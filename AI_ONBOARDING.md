# pixel-cove — AI onboarding primer (READ FIRST; state as of 2026-09-09, testnet-10)

## 0. What this is
Generative-art marketplace for SOLO artists on Kaspa Toccata covenants (SilverScript),
fxhash/Art Blocks class but: program fully on-chain, editions cap-enforced in consensus,
5% artist royalty enforced in-contract on every secondary sale, gallery renders from
chain state client-side. No backend, no IPFS. Device: Android/Termux.

## 1. Environment
- Repo root ~/pixel-cove — run ALL scripts from here (they read state JSONs from cwd).
- SilverScript CLI: ~/opt/silverscript/target/release/cli-debugger
  Contracts: ~/opt/silverscript/contracts/Series.sil (factory), NftInstance.sil (legacy).
- Deps installed: ts-node, @noble/secp256k1, @noble/hashes, ws.
- Gallery: `python -m http.server 8158` → http://localhost:8158/gallery3.html
- Endpoints: kascov https://kascov.io/data/testnet-10 (POST /deploy {program_hex,value};
  POST /preflight; GET /c/<cov>.json; GET /tx/<id>.json) — FLAKY on mobile, retry always.
  UTXOs: https://api-tn10.kaspa.org/addresses/<addr>/utxos
  Broadcast: wRPC submitTransaction → wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json
  (fallback wss://vector-10.kaspa.green/…), headers UA+Origin wallet.kaspanet.io, allowOrphan:true.
- Wallet: USER=33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68 (x-only pubkey);
  addr kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd;
  key = $PRIVATE_KEY_HEX (hardcoded testnet default in builders). TESTNET ONLY.

## 2. Live chain ledger (chain is truth; this is cache)
- v1 pixel series 0ccce75b… gen 890b1b16… revealed db77127c… (slot marker 0xFE)
- v1 factory 5bf4da9f… gen bfc2c42e… counter 1; ed#0: mint 5c9a118e… list 4ebbf019… buy b13e3a52…
- v2 VECTOR factory (LIVE): 04036ec3… gen a24ccffa… counter 34 (eds #0–#33); #0 acbd1143…;
  last 3df65e38…; cap 64 → 30 headroom; slot marker 0xFF, 266 B pcove-v2 program.
- MONUMENTS (locked, never spend): e62527d8…, eced90d7…
- State files: factory2.json = live v2 ledger {covenantId, genesis, counter, lastMint, slotHex};
  factory2-program.hex = counter-0 genesis program ONLY (see rule 2).

## 3. ABI invariants (authoritative reference: lib.rs.txt in vault/00-docs)
- sigscript = [entry params in ABI order] + [4-byte dispatch tag] + [redeem-script push by caller].
- State[] is COLUMNAR: ONE push per runtime-state field, declaration order
  (slot byte[568], artist byte[32], price int, cap int, role byte, counter int,
  ownerIdentifier byte[32], identifierType byte); each push = that field's values for ALL
  elements concatenated; Int elements = 8-byte fixed LE script-num; Byte = 1 B; FixedBytes raw;
  NO length prefix; element order = bound-output order (child, continuation).
- Scalars: int = minimal script-num; byte = 1 B; byte[32] raw; sig = 65 B (+0x01 hashtype in builders).
- Runtime state span: canonical data pushes only; Int = 8-byte fixed LE.
- template_hash = blake3(len8(prefix) ‖ prefix ‖ len8(suffix) ‖ suffix).
- Sighash v1 MUST include covenant bindings in outputs_hash: u8(1)+u16LE(authInput)+covenantId
  per bound output else u8(0) — src/kaspa-sighash-v1.ts is proven correct.
- Tags: mint 42c6a550 (State[],byte[32],byte,int) · list 5703f99d (sig,int) ·
  buy 9909be01 (byte[32],byte,int,int) · sell 951976a2 (sig,byte[32],byte,int,int) · spend 2b00e75d (sig,int).
- Units: mint 40,270 · list 119,430 · buy 19,650 · checkSig input 100,001.
  computeBudget: mint covenant-in 60; list/sell/buy 15; wallet-in 10. Fee ≈2,000,000 sompi.

## 4. Proven runbook
- Mint five editions: `npx ts-node src/edition-run.ts` (recompiles factory program at counter=k
  per iteration; updates factory2.json; regenerates editions2.json).
- Single mint: `npx ts-node src/mint-v2.ts`. List+buy w/ royalty: `src/edition-trade.ts`.
- New vector series: `src/series-v2.ts` (kascov deploy; OVERWRITES factory2.json — parametrize
  for a second series) then mint-v2. Render self-test: `npx ts-node src/render2.ts`.
- Backup: vault/ + releases/ (see HANDOFF); zip + /sdcard/Download copy.

## 5. Invariant rules (scars — violations cost hours)
1. Preflight trusts YOUR utxo body; the node trusts the chain. Cross-check spent-status and
   spk against chain before broadcast (symptom: preflight ready + node "false stack entry").
2. Factory redeem program is COUNTER-DEPENDENT: recompile compileSeries(role 0, counter=k)
   per mint; stale program → require-fail ≈10,362u or P2SH reject.
3. Freeze loop bounds before mutating the state they read (runaway incident: 34 mints).
4. Never persist state with empty genesis; poll kascov with retries, abort otherwise.
5. Never put `!` inside double-quoted `node -e` in bash (history expansion) — use heredoc patch files.
6. kascov is flaky + capped (20 deploys/day): retry loops mandatory everywhere.
7. Copied builders carry hardcoded paths (PROG file, write targets): audit after every cp/patch.
8. Columnar element order = bound-output order (child first).

## 6. File map
Core: src/kaspa-sighash-v1.ts · src/bridge3.ts (compileSeries) · src/gen2.ts (pcove v2 VM+compiler+SVG)
· src/genvm.ts+src/gencompiler.ts (v1 pixel) · src/bridge2.ts (legacy NftInstance).
Builders: mint-b.ts (proven columnar mint) · mint-v2.ts · edition-run.ts · edition-trade.ts ·
series-v2.ts · factory-deploy.ts · reveal.ts · recover-v2prog.ts · render2.ts.
Contract: Series.sil (mint/list/buy/sell/spend; royalty in buy). State: factory2.json,
factory2-program.hex, factory.json, series.json, editions2.json, edition0.json.
UX: gallery3.html (vector browser, witness-verified) · gallery2.html · gallery.html.
Docs: HANDOFF.md (scars) · vault/MANIFEST.md (map+ledger) · lib.rs.txt (codec truth) · examples/*.pco.

## 7. Roadmap (next actions + acceptance)
1. M1 own birth builder (KIP-20 genesis covenantId local compute) → accept: series born w/o /deploy.
2. VPS node+indexer (~$40/mo) → accept: full mint flow with zero kascov calls.
3. dApp mint studio (browser .pco editor → compile → deploy → trade).
4. Series v3: variable `bytes` slot (>561 B programs) + size-scaled mint price.
5. Mainnet prep: fresh keys, fee policy, Series.sil audit, own-indexer provenance.

## 8. Context self-test (first three commands)
cat factory2.json
curl -s https://kascov.io/data/testnet-10/c/$(jq -r .covenantId factory2.json).json | jq '[.events[].kind] | length'
npx ts-node src/render2.ts

## M8 addition (2026-09-08): JS series live
- factory3 94d22e8d… gen 77cef8b6… counter 1, ed#0 ae36bc97…; markers 0xFE/0xFF/0x4A.
- New files: src/jsrender.ts, src/series-js.ts, src/render3.ts, gallery4.html, gen-editions.js,
  examples/bloom3.js (+ bloom3.readable.js twin; on-chain copy is the minified one).
- mint-v2.ts is parameterized: `npx ts-node src/mint-v2.ts factoryN.json` (reads factoryN-program.hex).

## V4 addition (2026-09-09): byte[2048] JS series live
- factory4 e6597754… gen 4db3cb2c… counter 6, ed#0 8d936ce8…; mint tag b8a2310c.
- Marker 0x4A, cap 2045 B (minified). Repo keeps `.readable.js` twins.
- Mint tag is state-dependent: extracted via PUSH4 scan on deploy, saved to factoryN.json.
- Builders read mintTag from ledger: `npx ts-node src/edition-run.ts factory4.json`.

## M8 studio addition (2026-09-09): no-terminal mint studio
- src/studio-server.ts (port 8160) + studio.html = browser dApp.
- /api/deploy {js} and /api/mint {factory} wrap series-v4 + mint-v2 logic.
- Markers 0xFE/0xFF/0x4A; v4 = byte[2048] `art` slot, cap 2045 B minified JS.
- mintTag is per-factory (factoryN.json.mintTag); probe-v4.ts re-cracks it on state-shape change.
- Series.v4.sil is the live contract (ctor `program_art` → field `art`, DISTINCT names).
- Run: `npx ts-node src/studio-server.ts` → http://localhost:8160

## ABI codec deep-dive (from vault/00-docs/lib.rs.txt)
- State-span vs witness: `Bytes`/`Text`/`DynamicArray` are legal in runtime state spans
  (`encode_state_payload`) but illegal in columnar mint witnesses (`encode_fixed_payload`
  rejects them). Mint slots must be `FixedBytes` (e.g. `byte[2048]`).
- Dispatch tags: `SilEntryArtifact.dispatch_tag` is in the ABI JSON. If the compiler
  emits an ABI JSON, read tags from it instead of using the `probe-v4.ts` PUSH4-walker.
