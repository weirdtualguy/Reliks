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

SeriesFactory v5 — multi-chunk generative art architecture (2026-09-17)
Breaks the 2048-byte on-chain art limit by splitting the art program into 2KB P2SH data cells (ArtChunks).
Architecture: Genesis tx creates 1 P2SH factory + N P2SH ArtChunks. Reveal tx spends ArtChunks to expose raw data in sigscripts and reclaim mass. Mint tx only spends the lightweight factory (art payload removed from state, replaced by 32-byte blake2b program_hash).
v5 factory covenant: f4e14debfdbfdc4fe3c18627acbdb156f4f7e0eea020fb041ba217992167c733
genesis/deploy 80aa4c3e9e276d53c11828410709a6bf3c24d34c9fe8f46bcf7da9c39808ebeb
mint #0 0392720cc80dd4dc70801a3d8e2c9eb79b984a9cf38ed905c5e1311adc3d983b (edition 883a96c9...)
reveal 80bb6efb5763713ba75ceb26e4e09b4af9db616a04378d7b344fb97e5aed6eb0 (art data permanently on-chain, mass reclaimed).
PROOFS: lightweight mint passes (factory state reduced from 6419 to 4398 bytes), reveal exposes 2x 2048B chunks in sigscripts.
Versioning rule reaffirmed: logic change ⇒ new major version + fresh genesis; old instances remain as
on-chain proof artifacts (v1, v2 closed-by-design, v3-cap2 closed, v3 live, v4 proof-closed, v5 multi-chunk proven).

SeriesFactory v5 — 16 KB scaling proof (2026-09-17)
Art program scaled to exactly 16384 bytes = 8 × 2048-byte P2SH chunks.
genesis 7703ce68abcd476931ce78b647a0be61b9f001c72a7695ff06bf7ae69573bdc6
factory covenant 0c3cab42cad1c4cacd3f0e906f2bd837493d537b56de550bfa6228e4d86a3f5c
mint #0 a609cac9ed0ce1d0f29e0502ed72e33af796f7865e71b633ca1a1f1059b3b40b (edition b45687e1…)
reveal 054ebf9ced44d3c309131ef80cf7dfdc0ea376a1555f982327f5b0ddfd6f63c9 — 8 inputs, 2155 B sigscripts each, 17240 B total revealed (16384 B art).
program_hash d425b2e1150e665d6ae672b87d3c875cde611c9eebc5178b9e32cdb58bb60fa6.
OPERATIONAL NOTE: reveal fee must scale with chunk count (8-input reveal rejected at 0.02 KAS, accepted at 1 KAS). Standardness floor is mass-dependent.
SCALING LAW CONFIRMED: total_art = N_chunks × chunk_size; per-chunk cap 65535 B (OP_PUSHDATA2), per-sigscript cap 250000 B (MAX_SIGNATURE_SCRIPT_LEN). The 2048-byte wall is gone.
dApp v5 retrieval — Genesis Link Pattern proven trustless (2026-09-17)
web/v5-gallery.html + web/v5-registry.json (pointer-only hint) + web/factory-abi-v5.json.
Flow: registry hint -> kaspad REST reveal tx -> per-input sigscript pushes -> last push = P2SH redeem
-> first redeem push = 2048B chunk -> concat 8 chunks -> blake2b(dkLen 32) compared against program_hash
extracted FROM CHAIN: factory kascov live utxo outpoint -> mint tx -> input0 sigscript -> last push =
factory redeem -> slice state_span -> first state push = program_hash (d425b2e1...).
Tampered chunk or wrong pointer => mismatch => hard failure; the registry carries no trust weight.
Proof pair: mint a609cac9 (factory 0c3cab42) on-chain program_hash == gallery-computed d425b2e1...;
reveal 054ebf9c.

v5 REVEAL FEE DISCOVERY & CHUNKING (2026-09-17)
Revealing N chunks in a single tx hits Kaspa's mass-dependent standardness fee floor (e.g. 8 chunks
rejected at 0.02 KAS, accepted at 1 KAS hardcoded). 
FIX: reveal-v5.js now supports chunked reveals (`node reveal-v5.js <groupSize>`) and node-authoritative
fee discovery. It builds with a conservative pin (1000 sompi/byte), broadcasts, and on rejection parses
the exact required fee from the node's error message (`required fee of X`), adding a 10% margin.
Bounded at 5 attempts.
PROOF: 8 chunks revealed in 4 groups of 2. Fee converged at 4,490,000 sompi (0.0449 KAS) per group.
Total fee 0.1796 KAS (vs 1 KAS for single-tx). Chunking keeps tx size small and fee discovery prevents
overpaying or guessing consensus mass formulas.
Registry (`web/v5-registry.json`) now supports `revealTxIds: [...]` arrays; gallery fetches all txs
sequentially and concatenates chunks before the trustless blake2b check.

v5 GALLERY 1b GUARD + architectural pin (2026-09-17)
A v5 factory's runtime state (incl. program_hash) is readable on-chain ONLY after its first spend
(mint or close) reveals the P2SH redeem; pre-mint the state exists solely as the P2SH commitment.
Incident: on un-minted factory f2d49526 (genesis 1c794c86), 1b parsed the genesis wallet signature as
a redeem and extracted garbage ("504759" = accidental 3-byte push inside a schnorr sig); the blake2b
gate correctly refused to render. Guard added: redeem length must equal factory bytecode length
(prefix+state+suffix) else throw "factory state not revealed on-chain yet".
Multi-reveal proof: series f2d49526 revealed in 4 groups of 2 (441774b1/cb250647/9b40e643/007a5c4c),
fee discovered at 4490000 sompi/group; gallery concatenates across revealTxIds before hashing.

v5 MULTI-REVEAL & GALLERY REDEEM GUARD (2026-09-17)
PROOF: Series f2d49526969464f4d641c5d8bce457b89ce4ac75fa00863632a1490d7ec8e888 (genesis 1c794c86).
Mint a82c85b5 (edition 1c0fa373). Reveal split into 4 groups of 2 chunks (441774b1/cb250647/9b40e643/007a5c4c).
Fee discovered at 4,490,000 sompi/group. Gallery fetches all 4 reveal txs, concatenates 8 chunks (16384 bytes),
verifies blake2b(32B) d425b2e1... against on-chain factory state, and renders.
INCIDENT & FIX: Pre-mint, the factory's state (including program_hash) is hidden in the P2SH commitment.
The gallery's 1b step originally parsed the un-minted genesis tx's wallet signature as a redeem script,
extracting garbage ("504759" from an accidental 3-byte push inside the schnorr sig). FIX: added a redeem-length
guard in web/v5-gallery.html (patch-gallery-redeem-guard.js) requiring the parsed redeem script length to
exactly match the factory's compiled bytecode length, else throw "factory state not revealed on-chain yet".

KCC20 era — covenant-composed fungible token (PixelToken + PixelMinter), testnet-10 (2026-09-17)
Contracts: PixelToken.sil (KCC20-shaped: leader __leader_transfer 43997099, inert __delegate 7f28fad6),
PixelMinter.sil (controller: init 11961d2f, mint e8753734; template metadata baked as constructor params).
Lifecycle proofs: minter genesis f867f412 (C=030582e0…); asset genesis+init ab8f2fee (A=1a1ff247…,
C binds A via OpOutputCovenantId(0)); mint a823db4d (1000 PCRT → 33fe25d1…, allowance 1000000→999000);
recipient transfer b346047c (1000 PCRT → d6450547…, supply conserved on non-minter branch);
over-mint 999001>999000 rejected by consensus (rejection = certificate, no txid).
Abandoned bootstrap artifacts: aaee623b (orphan-rejected), 9b08854b with dangling C=b1652a79 (unspent).
Codec pins (KCC1): struct-array args grouped per field (owners|types|amounts|isMinter); sig args use
PushMinimal (byte 0x02→OP_2, 0x00→OP_DATA_1 00, empty→OP_0) while state uses PushExplicit + 8-byte ints;
tag push = OP_DATA_4; newStates = SUCCESSOR states ordered by covenant-family output position (transfer
bug: pushing the prior owner fails validateOutputState); ScriptPubKeyP2SH returns byte[37] → compare via
byte[](…); byte used as index needs unsigned(…); kascov does NOT index v1 covenant bindings → REST
/transactions fallback gate; /info/daa-score absent on this api-tn10 build → blockDaaScore presence filter.

DECL ERA — SeriesFactory-v6 macro-lowered mint proven (2026-09-17)
Refactored SeriesFactory-v5.sil (fully hand-written OpAuth* routing) into SeriesFactory-v6.sil using
modern #[covenant(...)] macros. The `mint` entrypoint became an auth-bound singleton transition policy:
`#[covenant(binding = auth, from = 1, to = 1, mode = transition, name = mint)]`.
The compiler-generated wrapper injects `prev_state`, enforces `OpAuthOutputCount == 1`, and runs
`validateOutputState` on the continuation, replacing the manual `OpCovInputCount/OpCovOutputCount`
bookkeeping. The policy body retains royalty bounds, cap checks, and the foreign-template Edition
spawn via `validateOutputStateWithTemplate` (DECL explicitly permits manual cross-template routing).
ABI COMPATIBILITY PROVEN: `diff-factory-v5-v6.js` confirmed TAGS IDENTICAL (`mint faa8e7a2`, `close
53422444`), PARAMS IDENTICAL, and STATE FIELDS IDENTICAL. Because the public ABI is byte-identical,
`mint-art-v6.js` required zero codec changes.
ON-CHAIN PROOF: v6 factory genesis `01f90235` (Covenant ID `de2943ed...`). Edition #0 minted via
`f0777598` (Edition ID `fa37c93f...`). The macro-lowered wrapper successfully enforced cardinality
and continuation checks on the BlockDAG.

DECL BOUNDARY — Heterogeneous Spawners require handwritten entrypoints (2026-09-17)
Experimented with lowering SeriesFactory-v5 into DECL macros (SeriesFactory-v6.sil) using
`#[covenant(binding = auth, from = 1, to = 1, mode = transition)]`.
FATAL LIMITATION DISCOVERED: The auth singleton macro generates `require(OpAuthOutputCount == 1)`.
Because the Factory input must authorize BOTH its own continuation AND the spawned Edition output
(to establish the Edition's Covenant ID lineage), `OpAuthOutputCount` evaluates to 2, causing the
macro wrapper to abort the transaction.
ARCHITECTURAL RULE: Per DECL.md "Homogeneous-template assumption", covenants that spawn foreign
templates (heterogeneous families) MUST use handwritten validation (`entry mint`) with
`validateOutputStateWithTemplate`. They cannot use the `auth` singleton macro.
DECISION: SeriesFactory-v5.sil (handwritten) remains the production standard. v6 is archived as
a boundary probe. Edition-v3.sil (homogeneous 1:1) remains a perfect candidate for future DECL
macro lowering if desired.

OFFER ESCROW ERA — liveness certificates complete (2026-09-17)
Positive expire: offer 020a1c47:0 (1 KAS, expireAge 30) refunded permissionlessly via 3158320e
(fee 3000000): escrow input sigscript carries NO signature — args + tag 2526eb97 + redeem only;
authority is this.ageDaa >= expire_age plus the input sequence lock.
Negative expire: offer 3f6dde00:0 (expireAge 3000); immediate expire attempt c9ee9e9d rejected with
"one of the transaction sequence locks conditions was not met" — consensus sequence-lock layer
rejects before script execution; a sequence=0 spender would instead fail the in-script CSV emitted
by this.ageDaa. Two-layer liveness enforcement confirmed.
Accept recap: offer 5474112b:0 (5 KAS) accepted via b08f2ee2 (fee discovered 4000000): owner paid
exactly 500000000, royalty 25000000 (500 bips) enforced by Edition __covenant_entrypoint_auth_sell,
edition continuation to offerer e9292c95 validated via validateOutputStateWithInputTemplate.
Chess-derived patterns now proven in Pixel-Cove: permissionless timeout (this.ageDaa + sequence),
exact-value payment equality (ChessSettle style), foreign-state read + input-template validation.
Files: OfferEscrow.sil (accept 6e9e6d3e, expire 2526eb97), offer-escrow-abi.json, offer-lib.js,
deploy-offer.js, accept-offer.js, expire-offer.js. Stranded negative-test offer 3f6dde00:0
recoverable after ~3000 DAA via expire-offer.js.

FACTORY V7 ERA — parallel mint lanes proven (2026-09-17)
SeriesFactory-v7.sil: immutable series fields (program_hash, artist, price, royalty_bips) plus
per-lane mints_left; NO global counter. Genesis lane starts mints_left = CAP; artist-signed fork
splits allowance conservatively (left+right == mints_left); mint decrements only its own lane and
spawns one Edition (foreign template) authorized by the buyer wallet input, keeping
OpAuthOutputCount(lane) == 1. Serials are outpoint-derived: LE63 of
blake2b("PixelCoveSerialV7" || lane outpoint txid || le32 index), computed in-contract as an
unsigned(byte) polynomial with the top bit masked — globally unique without shared state.
PROOF: fork 2+2 from a 4-allowance lane; two independent mints with disjoint UTXO sets confirmed:
lane0 d78241b2 serial 990001533881847873 edition 93c88978…; lane1 0bcc4c36 serial 7775655960477380558
edition ec8849f4…; fees 3000000 each; serials unique ✓. Cap invariant: total minted = CAP − Σ(live lanes).
Lineage: Chess/League registration-lane pattern (immutable lane + outpoint-derived IDs + admin fork).
Files: SeriesFactory-v7.sil, factory-abi-v7.json, factory-ledger-v7.json, v7-lib.js, deploy-v7.js,
fork-v7.js, mint-v7-parallel.js.

REGISTRY KEY FIX + VERSION-AGNOSTIC GALLERY (2026-09-17)
gen-v5-registry.js tolerates ledger key drift (l.covenantId || l.C), skips ledgers without reveal
txs, and emits a mintTx hint per series (last lane tx for v7 ledgers, ledger.txId otherwise).
web/v5-gallery.html 1b resolves the factory/lane redeem via kascov live-utxo first, falling back to
REST /transactions/<mintTx hint> when kascov 404s; program_hash is extracted version-agnostically as
parsePushes(redeem)[0] (state field 0 in v5/v6/v7 factories), with a 64-hex-char guard replacing the
old bytecode-length check.
PROOF: gallery renders 0c3cab42 (v5 16KB, 1 reveal tx) and e9ae4dbf (v7 parallel-lane series,
4 reveal txs from art-commit 088af6da) — both TRUSTLESS CHECK PASSED against on-chain program_hash
d425b2e1 with zero v7-specific client code. Registry holds 3 series; v6 (de2943ed) skipped (unrevealed).
Art-commit decoupling pinned: chunks need not live in the factory genesis; reveal spends the
standalone art-commit outputs; the only trust anchor remains blake2b(chunks) == program_hash.

PRE-MAINNET AUDIT CLOSED (2026-09-18)
F-01 KEY HARDENING: config.js refuses to load without PC_PRIV (strict 64-hex). 22 builders patched.
F-02 TRUST ANCHOR: @noble/hashes@1.4.0 + @noble/curves@1.6.0 vendored to web/vendor/. Self-tested
against canonical BLAKE2b-256 empty-input vector. Gallery no longer imports from esm.sh.
F-03 ROYALTY POLICY: Documented Edition.transfer as custody-only; UI must route secondary sales
through sell/buy to enforce on-chain royalties. Covenant unchanged to preserve genesis.
F-04 NETWORK ABSTRACTION: network.js exposes {rest, wrpc, kascov, hrp} via PC_NET=testnet|mainnet.
Double-guard: PC_WALLET required on mainnet. Gallery accepts ?net=mainnet.
F-05 CONFIRMATION MARGIN: pickUtxoSafe() sorts by oldest DAA score first, avoiding orphan-window
rejections ("orphan where orphan is disallowed").
F-06 FEE LOOP: Centralized feeLoop() with regex-based required-fee extraction.
F-07 CONFIRMATION GATE: waitForConfirmation() polls REST API before writing to ledger, preventing
orphan-ledger desyncs. Patched into deploy-v7.js, deploy-offer.js, etc.

RELIKS AUDIT PHASES 1-2 (2026-09-18)
PHASE 1 ECONOMICS: all-in pricing verified. MIN_PRICE 1000000 sompi yields roy 50000 / fee 10000
(non-dust). Rounding: floor; secondary remainder to seller (owner out >=), mint remainder to artist
(artistCut ==). Free mints skip payment checks (indices unconstrained, F-A4). Fee-free sale routes:
transfer (custody) + off-chain consideration only. Escrow exits: accept + permissionless expire only.
UI listing floor recommended 0.1 KAS (covenant floor stays 0.01).
PHASE 2 ABI: Factory-v8 state == v7 order (gallery first-push trick safe); Edition-v4 state == v3
order (escrow struct mirror + decoders safe); OfferEscrow-v2 template metadata non-state, no spend
entry, edition bound in accept. Tags: mint a643ab34, fork 99ec7fba, close 53422444, buy 0fdac8d2,
list 58838fa1, sell 96fece90, transfer d2b6f4f2, spend bf4a1660, accept 0f6d002c, expire 12ab1c61.
FLAGS: F-A1 package.json name (fixed via npm pkg set); F-A2 terminology lane->mint branch in docs
(KIP-21 lanes are subnetwork-scoped per agent brief); F-A4 free-mint unconstrained indices;
F-A5 expire refund hardcoded to outputs[0].

F-B14 STORAGE MASS (2026-09-18)
Kaspa storage mass scales ~inversely with output value; the exact piecewise constant could not be
fitted from two rejections (10.9M at 0.1 KAS price; 1.002M at 5 KAS price with 0.1 KAS carriers),
so Reliks parameters are chosen for margin under ALL plausible constants:
- covenant carriers (lane, edition) >= 1 KAS (DUST = 100000000n);
- separate 1% platform-fee output only at price >= 50 KAS (fee >= 0.5 KAS);
- below that, the merged-creator-cut template variant is the mass-safe design (mainnet decision);
- MIN_PRICE covenant floor stays 5 KAS; rehearsal series price = 50 KAS.
Evidence: rejected txs 7b363b66/cb6f0088/52457bdf (storage mass 10.8-10.9M and 1.002M vs 500k cap);
identical txid across retries proves builder determinism.

RELIKS REHEARSAL PROOF (2026-09-18, testnet-10)
F-B14 resolved empirically: storage mass ~1/value makes small carriers/fee outputs prohibitive;
mass-robust set = DUST >= 1 KAS carriers, separate 1% fee output at price >= 50 KAS (fee >= 0.5 KAS).
GENESIS: 87142754e2872dcd0d9f77660774ed51e71c211a733532939910645bb4f47db8 | lane C c04f9e16...
MINT: 0978bb180c0a5af23a6b727f92be746609c98714c663270f877001c515c149b2 | serial 975712004904810359
| artistCut 4950000000 | platformFee 50000000 (distinct UTXO, same key) | edition 6e99ab24...
Fee stack enforced at primary sale by SeriesFactory-v8 exact-equality checks; MIN_PRICE 5 KAS
covenant floor; waitForConfirmation 10s anti-orphan gate active on all builders.

SECONDARY TRIO PROVEN (2026-09-18, testnet-10)
list 1b128529be01f37bab8abe934a1411ca52a70af3fcd0271280d0b84bade601f6 (price 5 KAS)
buy  8326c4a7c4e4e839a7afb79552d17e6b4e02108768677a5623b164b4dd54fb52 (ownerNet 4.7 / roy 0.25 / fee 0.05)
sell 6eb850d3a522d3d3c37fb432f178cce1a60fdfa6ebd1a7ca30dcc287a2bc02d4 (same split)
Explorer confirms single-covenant-ID lineage across transitions (1 smart coin moved per tx).
Edition-v4 buy/sell enforce three-way split with exact equality; ledger maintains spk per
transition (F-B18); drift guard compares ledger spk vs recomputed redeem before signing.

PHASE 3 CLOSURE (2026-09-18, testnet-10)
All 7 routes proven on testnet under the mass-safe parameter set (DUST 1 KAS, MIN_PRICE 5 KAS).
offer-deploy c63308db... | offer-accept 48137a63... (ownerNet 4.7 / roy 0.25 / fee 0.05)
offer-expire c2939697... (F-B6 exact-equality refund to outputs[0], fee funded by wallet input).
verify-editions-v8.js confirms on-chain P2SH == blake2b(ledger-state redeem) for all tracked editions.
Off-chain builders (deploy-v8, mint-v8, secondary-v4, offer-v2) maintain ledger spk across transitions (F-B18)
and assert template drift before signing (F-B17). feeLoop dynamically discovers compute-mass fees (F-06).

MAINNET GENESIS PROVEN (2026-09-19, Kaspa Mainnet)
Factory Genesis: f6ebb717e04384770a833e87c8c7b5c3b8ff57adf4c1cda0f6c1aa097af2dc55
Lane Covenant C: 63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb
Art Commit:      6b806a6e741e1fbbdba286787fb8663195b512b1eff7fc7fb828a4de75ff0cae
Art Reveal:      f28990f7918778b519aa113a8108d40cf0b2ac231cd1f4e7ec9b94ec62ab7042
Genesis Mint:    4490949a4b60571b5be9a2efb5b32104dee4af7864d53a8cfc505fad8330919b
Edition Cov ID:  23b4157d1ae02951...
Serial:          1643293157957497133
Program Hash:    5b6a913b5640f4841573a24f03fd66895309002cfd54be228673aa7fcb30571f

Parameters: Price 10 KAS, Supply 1, Royalty 5%, Protocol Fee 1%.
On-chain split verified: 9.9 KAS artistCut + 0.1 KAS platformFee.
Ledger <-> Chain consistency verified via verify-editions-v8.js.
All v1 covenant fields (compute_budget, covenant bindings) successfully broadcast via Kaspa REST API after reverse-engineering the exact camelCase schema.

PHASE 4 CLOSURE — GALLERY, REGISTRY, ORGANIZATION (2026-09-19, Kaspa mainnet)
GALLERY: reliks-gallery.html (emitted by gen-gallery-mainnet.js with inlined registry).
  Trustless render chain verified on-device: REST-fetch reveal tx f28990f7…, parse each
  input sigscript push -> redeem -> first push = chunk payload (2 chunks), concat = 2885
  bytes, blake2b == 5b6a913b5640f4841573a24f03fd66895309002cfd54be228673aa7fcb30571f
  == SeriesFactory-v8 baked program_hash. Render is gated: refuse-on-mismatch.
  Fee-disclosure panel rendered: price 10 KAS -> seller 9.4 / artist royalty 0.5 (5%) /
  Reliks protocol 0.1 (1%); exact-equality covenant checks; no intermediary holds funds.
  Artwork inscription panel carries the seven testnet proof txids (256a6f25 1b128529
  8326c4a7 6eb850d3 36675063 48137a63 c2939697) — the piece certifies its own audit trail.
REGISTRY: web/reliks-registry-mainnet.json — network=mainnet, series{program_hash, artist,
  price 1000000000, royalty_bips 500}, factoryCovenantId 63fccd99…, editions[0]{covenantId
  23b4157d1ae02951…, serial 1643293157957497133, owner 25aafe0266…, price 0, txId
  4490949a4b60…, index 1, spk}.
ORGANIZATION: root holds only active builders/libs/utilities + secrets.env + HANDOFF.md.
  data/ (27 artifacts, legacy protocol history in data/legacy/), archive/ (96 patch/probe
  scripts + releases/ + art-legacy/), docs/, web/, sil/legacy/. All builders read data/
  paths; verify-editions-v8.js and gen-reliks-registry-mainnet.js green post-move.
LANE DECISION: DO NOT CLOSE. Factory lane 63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb
  remains at mints_left 0 with its 1 KAS carrier dust as a permanent on-chain monument
  to the Reliks Genesis factory.
AUDIT STATUS: ALL PHASES CLOSED. Testnet rehearsal 7/7 routes (mint, list, buy, sell,
  offer-deploy, offer-accept, offer-expire); mainnet genesis f6ebb717…, art commit
  6b806a6e…, reveal f28990f7…, mint 4490949a… all proven; ledger<->chain consistency
  proven (verify-editions-v8.js); gallery trustless render proven.
OPEN (non-blocking) FUTURE WORK: fork-v8 builder for parallel lanes at supply > ~50;
  merged-creator-cut template variant if a sub-5-KAS price floor is ever required;
  v9 upgradeable-template design (state-held expected_template_hash + artist-signed
  rotate entry) only if cross-template migration is ever needed.

RELIKS V10 GENERATIVE-SEED FACTORY (2026-09-19)
Compiled SeriesFactory-v10.sil: state span {1,93} identical to v8; tags mint a643ab34 / fork 99ec7fba /
close 53422444 unchanged (builders zero-codec); bytecode 4129 = v8 + baked engine_code (~900 B) +
render_hash + engine_lang in the template. engine_hash 00528c66..., render_hash 41cdf124...,
engine 900 B integer-only SVG (ENGINE_CAP 4096 client policy). Seed = edition serial only
(immutable-fields-only rule; art invariant under resale). Pruning-resistance: art is recomputed from
(authenticated template engine + authenticated serial), never retrieved from reveal sigscripts.
NAMING PIN: brand is Reliks (relik/reliks); never "relic/relics". Files: reliks-engine-v10.js,
gen-engine-args-v10.js, sil/SeriesFactory-v10.sil, data/factory-abi-v10.json.

RELIKS V10 GENERATIVE-SEED TESTNET PROOF COMPLETE
- SeriesFactory-v10: span {1,135} (program_hash, artist, price, royalty_bips, mints_left, engine_lang,
  render_hash), tags v8-identical (mint a643ab34 / fork 99ec7fba / close 53422444), bc 5186.
- COMPILER PINS: silverc drops unreferenced constructor params AND constant-folds pure expressions over
  them (require(blake2b(engine_code)==program_hash) folded to tautology, engine elided, bc unchanged).
  Fix: runtime-mixed bake anchor blake2b(engine_code + OpOutpointTxId(...)) != zeros forces materialization.
  validateOutputState REJECTS byte[] state fields (fixed-width only) — engine must be template data.
- Testnet: genesis 287685e3… lane C 128a26d7…, mint 5d1c5b57… serial 2316573588301712809,
  split 4.95/0.05 TKAS. engine_hash 8ad0717d…, render_hash 41cdf124… (stable across rename — anchor
  tracks output, not source). Serial domain ReliksSerialV10; seed domain ReliksSeedV10; engine fn reliks().
- BROADCAST TRUTH: testnet REST SubmitTxInput schema has NO compute_budget → v1 covenant txs always die
  with script-units limit=9999. wRPC full nodes work; SEEDERS (seeder1/2.kaspad.net:18110) reject valid
  deep-confirmed spends as orphans — never broadcast via seeders. network.js testnet wrpc now
  wss://electron-10.kaspa.stream/… + wss://testnet-10.kaspa.org/wrpc.
- FUNDING PIN: pick deepest-DAA confirmed UTXO with amount floor (DUST+fee headroom); REST /utxos lags
  mempool (ghost UTXOs); always include sequence:0 in hand-built wIn objects.
- verify-render-v10.js: 5/5 PASS. Nuance: spks currently fetched via /transactions/ (archival); switch to
  UTXO-set endpoints while outputs are unspent for full prune-independence.
- NAMING PIN: Reliks (relik/reliks). Never "relic/relics".

RELIKS V10 TESTNET SERIES 2/2 FULLY VERIFIED
- Editions: #0 serial 2316573588301712809 (mint 5d1c5b57…), #1 serial 1926707513164653245
  (mint 7d180a7c…), lane exhausted mints_left=0. Both splits exact 4.95/0.05 TKAS.
- verify-render-v10.js: ledger-driven, parameterized, 11 checks (3 global + 4/edition:
  lane linkage, serial recomputation from consumed outpoint, edition spk, continuation spk).
  ALL PASS. Registry is a pure hint; every field re-anchored against chain spks.
- CONVENTION PIN: render seed = serial mod 2^32 via exact BigInt (BigInt(serial) & 0xFFFFFFFFn).
  The old Number(serial) path double-rounded 61-bit serials — deprecated.
- feeLoop (offer-lib.js): wRPC-first, REST fallback; fee-discovery parses first-attempt msg
  (restRes.msg). REST SubmitTxInput lacks compute_budget on testnet-10 — never broadcast
  covenant txs via REST there.
- Pending hardening: verifier fetches spks via /transactions/ (archival); switch to UTXO-set
  endpoints while outputs are unspent for full prune-independence.

LEDGER spk DOUBLE-HEX QUIRK (v8-era, hit again by v10 gallery)
- Mint builders store editions[].spk via hex(V.p2sh(...)); V.p2sh returns a hex STRING and
  hex() utf8-encodes strings, so ledger spk = hex-of-hex (utf8-decode the hex bytes to get raw spk).
- Chain-anchored checks are unaffected; only local self-consistency comparisons trip.
- Consumers must normalize (gallery runtime spkClaimMatches now tolerates both encodings).
- factory-ledger-v10.json editions[].spk normalized to raw hex; v8 ledger left as-is (historical).

GALLERY SVG VIEWPORT WRAPPER (v10)
- Engine SVG emits viewBox only (no width/height): renders as XML doc root or in sized
  containers, but degenerates to height 0 as inline SVG inside an srcdoc HTML document.
- Gallery assigns srcdoc = wrapper doc with svg{width:100vw;height:100vh}. Presentation
  layer ONLY: ENGINE_SRC bytes and engine_hash/render_hash unchanged, no redeploy.
- RULE: display adapters live outside the anchored artifact; never churn anchored bytes
  for rendering-context bugs.

RELIKS V10 GALLERY COMPLETE (testnet)
- reliks-gallery-v10.html (self-contained ~30.9 KB): 3 gates + 5 checks/edition + sandboxed
  iframe renders; registry = untrusted hint; art withheld on any mismatch.
- DISPLAY PINS: viewBox-only SVG degenerates to height 0 as inline SVG in an srcdoc HTML doc;
  wrapper doc (svg{width:100vw;height:100vh}) + width/height injected on the DISPLAY copy only;
  iframe square via aspect-ratio:1/1. Anchored engine bytes never modified for display bugs.
- BUILD GATES (gen-gallery-v10.js): 324 blake2b vectors vs @noble + full runtime parity
  (serials, encState, spks, engine hash, conformance, renders); aborts on any drift.

RELIKS V10 GALLERY COMPLETE + KASPA ADDRESS CODEC PIN
- reliks-gallery-v10.html: gates + per-edition checks; UNSPENT outputs anchored against the
  LIVE UTXO set via /addresses/{addr}/utxos; SPENT outputs fall back to archival with explicit
  labels. Testnet series 2/2 fully verified (edition #1 continuation also live-anchored).
- KASPA ADDRESS CODEC (rusty-kaspa crypto/addresses/src/bech32.rs; verified vs wallet vector):
  * prefix5 = [c & 0x1f for c in hrp] — NO >>5 upper half, NO lower-bits append.
    Neither BIP-173 nor CashAddr expansion; 144-variant brute force of standard combos fails.
  * payload = [version] + body (v0 = P2PK 32B schnorr x-only; v8 = P2SH 32B script hash), conv8to5 padded.
  * polymod input = prefix5 + [0] + payload5 + [0;8]; init c=1; CashAddr 40-bit GEN
    [0x98f2bc8e61,0x79b76d99e2,0xf33e5fb3c4,0xae2eabe2a8,0x1e4f43e470]; result ^ 1.
  * checksum chars = conv8to5(polymod_u64.to_be_bytes()[3..]) → 8 chars; standard bech32 charset; ':' separator.
  * kaspatest P2PK address = 71 chars. web/gallery-blake2b.js + runtime bech32 block implement this;
    gen-gallery-v10.js parity-asserts the wallet vector at build time.

SERIES-2 (AUDITED) TESTNET IDS
- genesis 1535eb4b45d2723ac97af50d782c472798ce5d0c3e6b3d3ff6d3db4b3d299afc,
  lane C efd4f02eb6fc4c28380c443f8f0be97bda6ed324381c1a546a8b6cef38d5a2b6.
- edition #0 cov c877b6249eab8f82…, mint 0f073ff47d82…, serial 2959878540489260705.
- edition template v10 (index-distinctness guards): prefix 1 / suffix 2058 / hash 3022e9db…64020.
- factory bc 8222 B; span/tags unchanged; mints_left=1 live after edition #0.
- F1 gate live: verifier confirms ENGINE_SRC bytes inside the on-chain redeem.

DECL PARAM-ORDER TAG ROTATION (list failure, series-2 market rehearsal)
- Dispatch tags = blake3("entryName(type1,type2,...)")[0..4] AFTER lowering, from final
  public name + exposed param types. Reordering policy params rotates the tag AND the
  sigscript stack order. v4 list = (sig,int) tag 58838fa1; v5 list = (int,sig) tag 674a8ea4.
- Cloned builders that hardcode push order silently bind wrong slots: "script ran, but
  verification failed" with correct tag, correct state, correct covenant id.
- RULE: builders must derive sigscript arg order from the ABI entry params at runtime,
  never from memory of an older ABI. Covenant-id drift was ruled out first (ledger==chain).

SECONDARY MARKET REHEARSAL (AUDITED TEMPLATE, testnet series-2)
- list d3800564… (block 7a55b10e…) after v4→v5 arg-order fix ([newPrice, ownerSig]).
- buy 2b774355… (block 05a12124…): splits 470M/25M/5M on 500M price; roy 500 bips to
  artistSpk, fee 100 bips to artistSpk, ownerNet >= to ownerSpk; distinct idx (1,2,3).
- v4-clone bugs fixed: buy paid artist/platform to buyer spk; buy/sell sigscript arg order
  stale (v4 [sig-first] vs v5 ABI order); sell roy math /10000000*1000 drift.
- NEGATIVE: aliasing buy (artistOutIdx == platformOutIdx) rejected on-chain —
  distinctness guard is first failing require in checkPayments.
- Market ops run on parallel ledger data/factory-ledger-v10-market.json; canonical
  factory-ledger-v10.json untouched (gallery lineage checks stay valid; spent editions
  fall back to archival labels fail-closed).

ALIASING NEGATIVE TEST + SELL ZERO-PRICE GAP (audit closure)
- POSITIVE buy 2b774355… idx(1,2,3) accepted; NEGATIVE buy 79073135… idx(1,2,2) rejected
  ("script ran, but verification failed") — distinctness guard proven both directions.
- Negative required re-list 96804bc5…; edition left listed at 5 KAS in market ledger until cleanup.
- BUILDER GAP: secondary-v10.js sell guard rejected askPrice==0 although sellPolicy allows
  salePrice==0 signed free handoff; zero-price sell needs conditional payment outputs
  (else zero-value dust). Patched via patch-sell-zeroprice.js; cleanup alt = self-buy.
- Audit status: ALL findings closed with on-chain or build-gate evidence. Contract set
  (factory v10 + edition v10 + engine + gallery + builders) is MAINNET-READY.

V11 ECONOMICS LIVE (TESTNET)
- Two parallel v11 series deployed (same args, distinct genesis outpoints):
  A: genesis 47672d61…, C aa08f09b…, mint b5359c82…, serial 7224044837501613102 (funded-key path)
  B: genesis a9b06055…, C 00d10b64…, mint 0b977f67…, serial 449271923980672019 (legacy-wallet path)
- Mint split verified on-chain: artistCut 0, platformFee 100000000 -> treasury fb2c0901…
  (zero-cut branch of patched factory executed; no dust output demanded).
- factory-ledger-v11.json tracks series B (owner != artist => meaningful royalty rehearsal).
  Series A lane (mints_left 7) untracked; retire later via close() with artist sig.
- CONFIG HYGIENE: stale exported PC_WALLET across sourced secret files cross-wires funding
  (pickUtxo) and signing (PC_PRIV) => "false stack entry" CHECKSIG failures. secrets-v11.env
  now pins PC_WALLET; deploy/mint v11 carry a gallery-codec wallet/priv preflight guard.

REST ENDPOINT HYGIENE
- api-tn10.kaspa.org is the live testnet-10 REST host; kaspad REST returns 422 for
  prefix-less addresses (always include "kaspatest:" in /addresses/{addr} paths).
- ENOTFOUND on a previously-working host is usually a transient VPN/DNS blip: re-probe
  with curl before patching config. api-testnet-10.kaspa.org does NOT exist (000).
- electron-*.kaspa.stream hosts are wRPC-only (404 on REST routes).

INIT_MINTS SERIES BINDING
- verify-render/gen-gallery source INIT_MINTS from data/factory-args-v<N>.json[4].value.
  Retargeting ABI/ledger paths without retargeting the args path silently encodes the
  PREVIOUS series' supply: genesis + continuation spk checks fail with off-by-series
  mints_left (label math reveals it: printed = staleInit - (i+1)).
- Canonical initial supply = ledger series.mints_left (deploy-written, mint never
  decrements it); args[4] must agree. Check both when switching series generations.

RUNTIME ENCODER MUST TRACK ABI STATE FIELDS
- web/reliks-gallery-runtime.js hardcodes factory/edition state push order (encFactoryState,
  encEditionState); gen-gallery parity asserts byte-equality vs Node ABI-driven encState.
  Adding a state field (v11: treasury) silently desyncs browser vs Node until parity fails.
- Checklist for any state-field change: contract source -> ABI -> builders -> verifier
  state objects -> runtime enc*State + *Spk helpers -> REG embed -> parity re-run.

MODEL B SECONDARY MARKET PROVEN (testnet series-B)
- list 33fa760a… at 2 KAS (proves v11 MIN_PRICE 1 KAS; old floor was 5 KAS).
- buy cb32282c…: ownerNet 190000000 (>=) to owner 33fe…, royalty 10000000 (==, 500 bips)
  to artist ec7a…, platformFee 0 — royalty-only checkPayments, no platform output.
- Royalty arrived as a single 10000000-sompi UTXO at a key that never signed the buy.
- Economics summary: mint = fixed 1 KAS treasury cut (artistCut 0 at 1 KAS price);
  secondary = artist royalty on-chain, universal; marketplace 1% = escrow buyer
  premium (OfferEscrow-v4, pending), never deducted from owner/artist proceeds.
- secondary-v11.js = v10 clone retargeted (ledger-v11, edition-abi-v6) with v11 branch
  splice: buy[buyer,1,2], sell[buyer,salePrice,1,2,ownerSig], outputs owner+artist only.

MODEL B ESCROW PROVEN (testnet series-B, OfferEscrow-v4)
- list 41240861… (3 KAS) -> offer 82935af3… (locked ask+mktFee=303000000)
  -> accept a514a886…: ownerNet 285000000 (>=), royalty 15000000 (==), mktFee 3000000 (==).
- Edition co-spent via permissionless buy route; escrow terminated (OpAuthOutputCount==0);
  bait-and-switch guard prevEd.price==askPrice held; edition template hash unchanged.
- Treasury fb2c… final testnet state: 3 utxos (3000000 premium + 2x100000000 mint cuts).
- FULL REVENUE PROOF COMPLETE: mint cut (factory v11), royalty (edition v11),
  marketplace premium (escrow v4). Contract set is MAINNET-READY.

DUAL-FIELD LINEAGE MODEL (post-trade verification)
- ed.mintTxId / ed.mintIndex: IMMUTABLE. Written once at mint. Used by verifier/gallery
  for lineage (lane consumption), serial recomputation, mint-output spk checks, and
  the F1 engine-containment gate (reads factory redeem from mint tx input 0 sigscript).
- ed.txId / ed.index: MUTABLE. Updated on every transfer (buy/sell/accept). Used by
  builders for spending and by the gallery for live-UTXO anchoring (proves the current
  state's spk matches the never-pruned UTXO set).
- Builders (secondary-v11, accept-v4) only mutate txId/index/owner/price/spk; they
  preserve mintTxId/mintIndex automatically.
- Without this split, a traded edition's verifier lineage points at the transfer tx
  (whose input 0 sigscript is the edition redeem, not the factory redeem) => F1 gate
  fails, serial recomputation fails, mint-output spk equality fails.

LIVESPK LOCATION SEMANTICS (gallery runtime)
- liveSpk(spk, txId, idx) proves "the UTXO at (txId,idx) is unspent AND equals spk".
- Edition current state: probe (ed.txId, ed.index) — the current location.
- Lane continuation: probe (ed.mintTxId, 0) — the lane lives at the MINT tx output 0
  forever; probing ed.txId post-trade yields the edition successor and falls back to
  archival labeling (valid but weaker).
- Archival fallback remains the safety net for genuinely spent outputs.

RELIKS V11 TESTNET REHEARSAL COMPLETE (closure record)
- Series-B tracked: genesis a9b06055…, C 00d10b64…, mint 0b977f67… (serial 449271923980672019).
  Trades: list 33fa760a (2K) -> buy cb32282c -> list 41240861 (3K) -> offer 82935af3
  (locked 303000000) -> accept a514a886 (owner 285M / artist 15M / mkt 3M).
- Series-A untracked: genesis 47672d61…, C aa08f09b…, mint b5359c82… (serial 7224044837501613102);
  retire later via close() with artist sig if desired.
- Revenue proofs: treasury fb2c… = 2x1K mint cuts + 3000000 premium; artist ec7a… =
  10000000 + 15000000 royalties, collected without ever signing.
- Verification: Node 8/8 (mintTxId lineage, covenant-ID mint binding, F1 full-redeem
  engine containment); gallery all gates PASS with edition AND lane LIVE-UTXO anchored
  post-trade (dual-field lineage + liveSpk location semantics).
- Templates frozen: factory-abi-v11 (span 168), edition-abi-v6 (span 161), escrow-abi-v4 (span 194).
- MAINNET-READY. Runbook: env-scoped ledgers (RELIKS_LEDGER/RELIKS_ARGS/RELIKS_ESCROW),
  secrets.mainnet.env offline keys, series-mainnet-1.json economics, deploy->mint->verify->gallery.

E-1 FIX (audit, tooling-only): gen-factory-args-v11.js refuses royalty_bips == 0
(zero-value artist output is consensus-invalid, so listed 0% editions are unsellable);
range [1,2000] enforced; --allow-otc-only bakes 0% with a loud warning (OTC-only:
transfer / sell-at-0). Templates/ABI/ledgers untouched. Backup: gen-factory-args-v11.js.bak-e1.

F-M1 FIX (audit, tooling-only): mint-v11.js now asserts V.USER is a valid 32-byte
x-only pubkey hex and explicitly binds BUYER_SCHEME=0 (IDENTIFIER_PUBKEY) before
building the mint sigscript. The factory contract does not validate buyerScheme,
so passing != 0 or a garbage pubkey bricks the edition (all owner routes require
scheme==0). Templates untouched. Backup: mint-v11.js.bak-fm1.

F-M2 FIX (audit, tooling-only): gen-factory-args-v11.js now validates price (must
be 0 or >= 100000000 sompi; 0 < price < 1 KAS or negative price bakes a series
where every mint reverts) and mints_left (integer >= 1). Combined with the E-1
royalty guard, all dead-series configurations are rejected at the only writable
entry point; free-series (price=0) path preserved. Templates untouched.
Backups: gen-factory-args-v11.js.bak-e1 / .bak-fm2.

ESC-INFO FIX (audit, tooling-only): secondary-v11.js, offer-v4.js, and accept-v4.js
now carry the same gallery-codec wallet/priv preflight guard as deploy/mint (prevents
stale PC_WALLET cross-wiring). offer-v4.js additionally asserts BigInt(ed.price) === askPrice
before locking funds, preventing offers against stale ledger entries (which would
otherwise trap funds until expireAge). Templates untouched. Backups: *.bak-esc.

OPTION A MASS/FEE PROBE CLOSED (testnet-10, three live probe mints):
LAW: transient mass = 2 x tx_bytes; required fee = 100 sompi/mass = 200 sompi/tx-byte;
tx_bytes = mint sigscript + 546; sigscript = factory bc + 46; bc = engine S + ~7109 B.
POINTS: S=16384 mass 48170 fee 4817000; S=24576 mass 64554 fee 6455400;
S=32768 mass 80950 fee 8095000 (paid 8904501 via feeLoop +10% margin).
compute_budget 100 suffices through S=32768 (engineBaked blake2b over 32 KB).
CEILING: consensus max tx mass 100000 => engine ~42 KB; MAX_SIGNATURE_SCRIPT_LEN
250000 not binding. ENGINE_CAP client policy RAISED 4096 -> 32768 (policy only;
frozen templates, codec, builders untouched).
PROBE TXIDS: 16K genesis 64f848ae mint 81352538 (lane d0bee9cb);
24K genesis 509ee8b1 mint cb4b2e7c (lane 48de70dd);
32K genesis 04e9ad2e mint cab82d13 (lane a83de0fe).
Probe lanes left at mints_left 0 as 1 KAS dust monuments (close-able via artist sig).
BEYOND 42 KB: Option B (shard covenants + assembly co-spend, ChessSettle pattern)
or Option C (layer federation, ChessMux route-table pattern) required.

SERIES C REHEARSAL (testnet-10, DAG-city engine reliks-engine-mainnet.js):
genesis <TXID> lane C <COVID>; mints <TX0> <TX1>; verify 11/11; gallery VERIFIED.
Env-scoped: RELIKS_ENGINE/ARGS/FACTORY_ABI/LEDGER = *-c* paths; canonical v11
artifacts untouched. verify-render + gen-gallery now honor RELIKS_FACTORY_ABI
(probe-era gap closed). Mint fees matched the fitted mass law (~2.3-3.0 M sompi).
Series C = community proof-of-concept drop; mainnet genesis next.

SERIES C REHEARSAL COMPLETE (testnet-10, DAG-city engine reliks-engine-mainnet.js):
engine "Reliks Genesis City v3" integer-only iso BlockDAG, ~3.9 KB (< raised 32768
policy); series-c.json price 1 KAS / bips 500 / mints 8.
genesis 85d41d788b9913653631d310dcb7bf1354a6a8be00cdd145d27f6fe5f1a69def
lane C  e2a15dc5ff70fc04cc2d252a8ea5ea46212fa9a3121c34fa0138caae4af07cb4
factory-abi-c bc 10997 template 0e42dc7d1e54d7a561bb1b370a6452e99f50f4d1b86aef6fc6b067015256cf54
mint #0 8f0cc8c0c121cd3dbf004298d7818d026bfdc596bc4db11b96d111d73ed01723
        serial 5056484704985813865 (edition b3c684d6…)
mint #1 1e80012f3276828394316a38c80c758fd5d5046f809f4ad7aced4df9c182a106
        serial 2977287238847657467 (edition 9f14982e…)
verify-render 12/12 PASS incl. F1 full-redeem engine containment; gallery gates +
Node/browser parity OK; edition #0 LIVE-UTXO anchored, spent continuations
archival-labeled (liveSpk location semantics proven again).
DUAL-FIELD CLOSURE: mint-v11.js writes mintTxId/mintIndex natively at push;
ledger-c needed no retroactive patch; lineage green on both editions.
Mint fees passed first-attempt 3M at ~11 KB bc, matching the fitted mass law.
COMMUNITY PoC: reliks-gallery-c.html (self-contained, 51680 B, 2 editions).
MAINNET CANDIDATE ENGINE: this DAG-city engine; §9.A runbook unchanged.

RELIKS LENS (tooling): reliks-lens.js = pre-deploy engine gate suite (L0-L10:
module shape, size<=RELIKS_ENGINE_CAP(32768), banned constructs (Math.random/
transcendentals/Date/fetch/eval/env), double-render determinism, bare-vm-realm
parity with independent ReliksSeedV10 pipeline, seed mod-2^32 convention, hash
recompute, seedLanes parity, SVG sanity, fitted mass/fee law + 100000 mass
ceiling, optional features() rarity buckets). `html` subcommand emits an
interactive lens page (serial scrubber + 3-compile determinism check).
Policy: NO ENGINE BAKES WITHOUT A GREEN LENS. Season-2 artist uploads gate here.

RELIKS LENS CLOSED (tooling gate): reliks-lens.js gates L0-L10 (module shape,
size<=RELIKS_ENGINE_CAP, banned constructs, double-render determinism x6,
bare-vm-realm parity + canonical ReliksSeedV10 pipeline, mod-2^32 seed
convention, hash recompute, seedLanes parity, SVG sanity, fitted mass/fee vs
100000 ceiling, optional features()). `html` subcommand = interactive lens
(serial scrubber + 3-compile determinism + in-page blake2b cross-check).
PROVEN: v10 901 B, mainnet DAG-city 3888 B, probe 32768/32768 B all PASS;
Math.random-poisoned engine FAILS L2-L6 exit=1. POLICY: NO ENGINE BAKES
WITHOUT A GREEN LENS.
MAINNET CANDIDATE ENGINE ANCHORS: reliks-engine-mainnet.js 3888 B,
engine_hash 16440384b2b00579d67e1366e8aa9c835e276fbf84a711d4920e87b134d7eaa4,
render_hash 836c15aecc078e0c19ae71467ff12cdd85a904d1c965a991af095a246dcc403c.
Matches deployed Series C factory bc 10997 (testnet genesis 85d41d78...) - no drift.

SERIES C SECONDARY MARKET REHEARSAL COMPLETE (testnet-10, DAG-city engine):
Edition #0 (serial 5056484704985813865, mint 8f0cc8c0...):
  list 95a408b7... (2 KAS) -> buy a3842fd7...
  Split: ownerNet 190M / royalty 10M (500 bips) / platformFee 0.
  Proves direct secondary route (Model B royalty-only).
Edition #1 (serial 2977287238847657467, mint 1e80012f...):
  list e93d0956... (3 KAS) -> offer 50477416... (locked 303M, escrow aa20b234...)
  -> accept 407b23b5...
  Split: ownerNet 285M / royalty 15M / mktFee 3M (1% buyer premium).
  Proves escrow secondary route (Model B + marketplace premium).
DUAL-FIELD LINEAGE PROVEN: mintTxId (8f0cc8c0 / 1e80012f) remains immutable
for F1 engine-containment and serial recomputation; current txId updates to
buy/accept txids (a3842fd7 / 407b23b5) for live-UTXO anchoring. Price resets
to 0 (unlisted) post-trade.
FULL REVENUE STACK PROVEN ON MAINNET-CANDIDATE ENGINE:
1. Mint cut (1 KAS to treasury)
2. Artist royalty (5% on-chain, universal)
3. Marketplace premium (1% escrow buyer-side)
SERIES C REHEARSAL STATUS: 100% COMPLETE. MINT, VERIFY, GALLERY, DIRECT
SECONDARY, ESCROW SECONDARY ALL GREEN. MAINNET-READY.

LENS L4 FIX (studio-era): bare-realm parity gate wrapped ENGINE_SRC in
(function(){...return reliks;})() which cannot evaluate PRELUDE_V1's top-level
IIFE (})(L,serial)) -> "L is not defined". L4 now compiles inside the vm realm
with the PRODUCTION wrapper shape: (function(L,serial){SRC\nreturn reliks(L,serial);})
via vm.runInContext completion value, so R rebuilds per call and host-global
isolation is preserved. Proven: studio-exported my-engine.js (engine_hash
fbf130712caf9462...) 12/12; v10 / DAG-city / probe-32768 unchanged all-PASS.
RULE: any new engine *packaging* (preludes, wrappers) must be tested through
gen-studio-mirror.js + lens before bake; the mirror exists to surface
packaging/codec drift, exactly as it did here.

LENS L4 FIX VERIFIED (matrix): post-fix wrapper
(function(L,serial){SRC\nreturn reliks(L,serial);}) via vm.runInContext completion
value passes 12/12 on: studio-export my-engine.js 1200 B (fbf13071...), v10 901 B,
DAG-city 3888 B, probe 32768/32768 B - no regressions on prelude-less engines.
Lens L9 fee estimates match the on-chain fitted mass law (200 sompi/tx-byte).
STUDIO->LENS PARITY: browser hash panel must equal lens engine_hash for the same
template (circles: fbf130712caf9462...). gen-studio-mirror.js remains the
download-independent parity harness.

SERIES D REHEARSAL COMPLETE (testnet-10, STUDIO-BORN ENGINE):
engine = PRELUDE_V1 (894 B) + Studio circles template = 1200 B ENGINE_SRC;
engine_hash fbf130712caf9462b0613a63978152fd95a66ab40eddb7ab2ee7753d0b06acd1
render_hash 4f2b9ac67323222dfe127e52b2ee612a7cfc88111065d53fdd3bef675edbfc19.
FIRST RELIKS SERIES AUTHORED ENTIRELY IN THE BROWSER STUDIO:
Studio export -> gen-studio-mirror -> lens 12/12 -> bake -> silverc -> chain.
series-D factory bc 8309 (=1200+7109, fitted law exact), span {1,168},
template f0df600f2ccdd545ce7ec785df5054ec8be5e5f76f26a860969365dd90706879.
genesis 1df95faa89288e79b3d7fe41ac5b2cea1613d1915f5e52ab0a7d3066c29ed035
lane D  9e29c638aa04e33adefbc15c9d66385c135fbdca29ea8b592603031a2c402e91
mint #0 34db71a6c77c... serial 1046690524652801491 (edition 4818a63c...)
mint #1 1a845f7705e8... serial 1665126013277412593 (edition bdc4fab7...)
Mints first-attempt 3M fee (required ~1.78M per fitted mass law).
verify-render 12/12 incl. F1 containment of PRELUDE_V1+circles bytes in the mint
redeem; gallery gates + Node/browser parity OK; editions LIVE-UTXO anchored.
ARTIST PIPELINE CLOSED END-TO-END: Studio(browser) -> export -> mirror -> lens
-> bake -> silverc -> deploy -> mint -> verify -> gallery, hashes identical at
every hop. Testnet rehearsal surface now complete: protocol v11 (Series B),
mass/fee probes (16/24/32K), DAG-city + secondary direct/escrow (Series C),
studio-born engine (Series D). ONLY HORIZON LEFT: mainnet §9.A.
