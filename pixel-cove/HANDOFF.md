# pixel-cove — Audit Handoff Manifest
Generative-art NFT factory + marketplace on Kaspa testnet-10 (SilverScript covenants,
KIP-20 lineage, KCC-1 codec). Built and operated entirely from Termux/Node v26 with a
pure-JS stack (@noble/hashes, @noble/secp256k1, ws). kaspa-wasm is broken on this host.

## On-chain manifest (testnet-10)
- Art Factory (LIVE): 29552108f08989318180ee34216e83a8b9303b6952f604623693a0e465f630aa
  genesis tx f2da640923fea1e836122705107ff416b0fd75a9e11eb967d693a453a824f40f, counter=2
- Edition #0: 6f5669db1311c7b6a1dd24e1fe6b484ca0d21d0cb1c0f6923528caa752398aa0
  mint 10b79901…4009 | list 9be734a6…53db | buy 4682066b…4009
- Edition #1: 941292d2721daf843cb21aee0f02ed3019f8ff86469a14c6b422b25098e40f69
  mint cbe52d79…6d78 | OTC sell 2c1d48c2…dd5e
- Retired placeholder factory: e37e5868903c20bf67843bc7b1586f4c5bbca301a698c4e73ce51b60bca1854a
- Art program_hash (blake2b of art-program.bin, 2048 B):
  93e87b071619614e6840b2f244b4b093f2d11a7e3896fc88501f1e91533652de
- Dispatch tags: mint faa8e7a2 | buy 9909be01 | list 5703f99d | sell 616a2258 | spend 2b00e75d
- Wallet pubkey 33fe25d1…cc68 (addr kaspatest:qqeluf…j3kd).
  SECURITY: testnet privkey is hardcoded in mint-art.js / marketplace.js / sell-edition.js.
  Rotate + externalize before any mainnet work.

## File tiers
T0 audit target: SeriesFactory.sil, Edition.sil, factory-abi-art.json, edition-abi.json,
   factory-args-art.json, art-program.bin/.hex
T1 money-moving: kaspa-sighash-v1.ts, mint-art.js, marketplace.js, sell-edition.js, lib.rs.txt (codec spec)
T2 live state: factory-ledger-art.json, editions-ledger.json
T3 specs: DECL.md (declaration lowering), TUTORIAL.md (language), agent brief (endpoints/gotchas), mint-v2.ts
T4 harness: verify-factory-edition.js, check-edition.js, check-factory-spk.js, preflight-next.js

## Hard-won consensus rules (verify against these first)
1. wRPC JSON is strict camelCase; submit flattens scriptPublicKey to '0000'+hex; value/gas Numbers; allowOrphan:true; headers User-Agent + Origin wallet.kaspanet.io.
2. v1 sighash = keyed BLAKE2b(key='TransactionSigningHash'); preimage EXCLUDES sigOpCount/computeBudget; outputs hash commits covenant bindings (u8 flag‖u16 authInput‖32B id).
3. KIP-20 genesis id = keyed BLAKE2b(key='CovenantID') over auth outpoint‖le64(count)‖per-output(le32 idx‖le64 value‖le16 ver‖le64 len‖script).
4. P2SH state lives in redeem preimage: push prefix‖current-state‖suffix, NEVER constructor bytecode.
5. KIP-9: pad covenant/royalty outputs to MIN_DUST=1e8 sompi; contract checks >= so overpay is valid. buy economics: seller gets full price, buyer funds price+royalty.
6. kascov indexer lags ~60 s: poll /c/<id>.json until live utxo script_hex == computed spk; deploy ONCE then poll (rate-limited). kascov 'program_hash' label = P2SH hash, not a state field.
7. computeBudget 60 (covenant) / 10 (P2PK). Termux bash: never put bare ! inside double-quoted node -e.

## Endpoints
kascov https://kascov.io/data/testnet-10/{deploy,preflight,c/<id>.json,tx/<id>.json}
UTXOs  https://api-tn10.kaspa.org/addresses/<addr>/utxos
wRPC   wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json (fallback vector-10.kaspa.green)
## Audit addendum
- T0 edition source = Edition.sil; ArtEdition.sil/ArtFactory.sil are dead drafts.
- v1 lineage FROZEN (buy scheme-brick + royalty overflow): no third-party v1 buy traffic; use sell or tooling-hardcoded scheme=0.
- v2 lineage canonical; spend tag changed; buy/list/sell tags unchanged; state layout identical.

## Audit remediation addendum (v2 lineage) — CLOSED
Findings: (1) MEDIUM buy scheme-brick; (2) LOW royalty i64 overflow; (3) cosmetic spend witness; (4) defense-in-depth OpCovInputCount.
v2 sources (T0 now): Edition-v2.sil (buy/sell scheme gating, overflow-free royaltyFloor, spend(sig) tag bf4a1660),
SeriesFactory-v2.sil (royalty_bips<=10000 at mint, explicit OpCovInputCount==1).
v2 factory 0c2ce37edb08f842a3960d3efaa7afb336f7cdd3427f8fddb63aaf5db4256b95 (genesis 28465804ede9c138c2532c633645d6be2f0be325d3229a194c94c887c535257e).
v2 edition #0 594faea4d28efb0e27799966c5c22b37b6ed2198d02c6377d097aff2fae563ba (mint 5b3719b3a0c057980a39fba98f8c71368008f01c3b6935ff7efe607700082aa5).
Tags: buy 9909be01 / list 5703f99d / sell 616a2258 UNCHANGED; spend 2b00e75d -> bf4a1660.
v1 lineage FROZEN (factory 29552108..., editions 6f5669db.../941292d2...): no third-party v1 buy traffic; v1 trades via sell or tooling-hardcoded scheme=0.
Proofs: positive = mint + drift ✅ + events genesis->transition; negative = preflight buy(scheme=1) => will_fail, input0 pass:false @2774 units (early gate).
