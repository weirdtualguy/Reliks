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

## Audit remediation v3 (Gemini findings integrated)
Findings evaluated: (A) remove spend, (B) add transfer, (C) conditional royalties, (D) UTXO value conservation, (E) 2KB state removal, (F) factory close.
ACCEPTED & PROVEN:
 - (B) `transfer` entrypoint (tag 694374e4): Royalty-free custody moves, force-clears price. Proven OUT/BACK round-trip.
 - (C) Conditional royalties: `if (royalty > 0 && owner != artist)` allows 0% mints and primary sales without dust outputs.
 - (F) `close` entrypoint (tag 53422444): Terminal spend when counter >= cap. Proven on cap-2 factory (faef97a7...), reclaiming 5 TKAS storage mass and cleanly terminating lineage.
 - In-contract `blake2b(art)` hashing in factory mint, removing trust in the minter script.
REJECTED (with rationale):
 - (A) Removing `spend`: Kept. It is the mandatory dust-recovery escape hatch for KIP-9 0.1 TKAS padding. Without it, dust is permanently locked.
 - (D) UTXO Value Conservation: Rejected. Kaspa covenants are value-agnostic by design; forcing output==input traps accidental overpayments forever.
 - (E) Eliminating 2KB State: Rejected. Moving art off-chain destroys the fully trustless, on-chain promise. Mint mass cost is identical either way, but on-chain state guarantees permanent availability.

## V3 Lineages on Testnet-10
- Main V3 Factory (64 cap): 1d2a18a7344eec8d2a849c7518f5c0fc94e15e16dc474ae9ad383f718b06f519 (genesis 85d2af8335330dd18fd569c259912ce5101e0e434653d7df4d7d6f1cf80abf66)
- Cap-2 V3 Factory (proven closed): (genesis 85d2af... wait for indexer to confirm exact cap-2 genesis from deploy-cap2 ledger)
- V3 Edition #0 (Main): cd6a4eb5acf2ec6e285fbdecf0a4f95b8b0d8b12e45a13bef952fc0fc283d7bb (proven transfer OUT/BACK)

## dApp era addendum (browser-native marketplace, testnet-10)
Pinned facts (each cost us at least one debugging round):
- Kaspa bech32: charset qpzry9x8gf2tvdw0s3jn54khce6mua7l, separator ':', data = conv8to5(version||payload);
  checksum feed = (hrp bytes & 0x1f) ++ [0] ++ data5 ++ [0;8]; polymod 40-bit state (mask 0x07ffffffff, top = c >> 35)
  with generators [0x98f2bc8e61, 0x79b76d99e2, 0xf33e5fb3c4, 0xae2eabe2a8, 0x1e4f43e470]; result ^ 1,
  take low 40 bits as 5 big-endian bytes, conv8to5 -> 8 symbols. Verified vs rusty-kaspa vectors + REST.
- Kaspa txid EXCLUDES signature scripts (identical txid before/after a sigscript framing fix).
- Version-1 transactions: sigOpCount must be 0 on every input (v0-only field).
- Public nodes do not chain mempool: children of unconfirmed parents are orphans and the orphan pool is
  disabled ("orphan where orphan is disallowed"). Gate consecutive actions on block confirmation
  (kascov live outpoint == expected <last-tx>:0) before signing the next spend.
- Data-source division: kascov = covenant lineages + live spks (NO sigscripts in tx json);
  kaspad REST (api-tn10) = full transactions WITH sigscripts + address UTXOs; browser wRPC broadcast
  works with the page's native Origin header (no relay needed).
- On-chain art extraction is schema-proof: regex /4d0008([0-9a-f]{4096})/ over the raw tx JSON
  (OP_PUSHDATA2 + LE length of the 2048-byte art push), then blake2b-check vs program_hash.
- Browser proof txids: mint 0fc4c90b / 270e1267, list 47d23ac1, buy e78cf3a5 (royalty to artist key),
  transfer 35191d35. Termux v3 proofs: mint d0939fa5, transfer 37a89dc9/4ca950b0, close faef97a7, 3-out buy (owner==artist) 0d4761ae.

## SeriesFactory v4 — external audit remediation record (2026-09-17)
Audit source: Gemini review of Edition-v3.sil / SeriesFactory-v3.sil. Findings & dispositions:
1. [HIGH] close() gated on counter>=cap → permanently locked storage mass on unsold series.
   DISPOSITION: ACCEPTED FIX. Gate removed in v4; artist may cancel/close at any time.
   PROOF: early close at counter=1/cap=64 accepted; lineage genesis→transition→burn, live utxos 0
   (close tx 27504b7750c21ec8d8aaa4f192d9fa1cf5fb7c00f4706c443c58ee7b63f67807, factory 7ede0e9d…).
2. [MEDIUM] mint() did not conserve factory output value → first minter could drain an over-funded
   genesis deposit. DISPOSITION: ACCEPTED FIX.
   require(tx.outputs[factoryOutIdx].value >= tx.inputs[this.activeInputIndex].value).
   PROOF: legitimate mint passes with exact value preservation (tx fe2e3f27…); negative test deferred.
3. [LOW] royalty_bips unbounded below. DISPOSITION: ACCEPTED FIX. require(0 <= royalty_bips <= 10000).
4. [INFO] buy() mempool sniping (front-running underpriced listings).
   DISPOSITION: ACCEPTED RISK, documented. Inherent to open single-UTXO listing covenants without
   commit-reveal or permissioned taker; seller always receives the full listed price.
   Revisit only if a taker-authentication scheme is designed.
Compatibility guarantees (structural diff v3→v4): dispatch tags, state span and runtime state fields
identical; template hash differs; Edition contract untouched (v3). The dApp's JS codec therefore needs
no change for a v4 factory — only the ABI/ledger file pointers change.
Versioning rule reaffirmed: logic change ⇒ new major version + fresh genesis; old instances remain as
on-chain proof artifacts (v1, v2 closed-by-design, v3-cap2 closed, v3 live, v4 proof-closed).
