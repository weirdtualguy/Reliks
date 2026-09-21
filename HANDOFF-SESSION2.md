# RELIKS ON KASPA TOCCATA — SESSION 2 HANDOFF
Status: TESTNET REHEARSAL COMPLETE — MAINNET-READY. Do not re-litigate settled design
decisions; they are recorded below with their on-chain evidence.

## 1. Mission
Prune-proof generative-art NFT protocol + marketplace on Kaspa L1 covenants (Toccata /
SilverScript). Artwork = integer-only deterministic engine rendered from serial; engine
bytes anchored on-chain; every edition verifiable trustlessly from any node; gallery HTML
proves lineage output-by-output. Three consensus-enforced revenue streams (Model B):
fixed mint cut (treasury), artist royalty (on-chain, universal), marketplace premium
(escrow-only, buyer-side).

## 2. Environment
- Termux (Android), node v26.3.1, project dir ~/pixel-cove.
- Native compiler: ~/bin/silverc (built from ~/opt/silverscript). Build notes: workspace
  needed `lto = "thin"` in [profile.release] to avoid OOM on 16 GiB device; cargo registry
  patched to rsproxy.cn sparse (github raw TLS resets on this network).
- VPN/DNS flaps: ENOTFOUND on a previously-working REST host is usually transient —
  re-probe with curl (prefixed address!) before patching config.
- noble libs: builders use `@noble/secp256k1` v1 shape (`secp.schnorr.signSync`); scripts
  carry a `@noble/curves` fallback wrapper. blake2b from `@noble/hashes`.

## 3. Contract set (frozen templates)
### SeriesFactory-v11 (sil/SeriesFactory-v11.sil → data/factory-abi-v11.json)
- State (span {offset:1,len:168}): program_hash, artist, price, royalty_bips, mints_left,
  engine_lang, render_hash, treasury.
- Entries/tags: mint a643ab34, fork 99ec7fba, close 53422444 (unchanged across v10→v11).
- Economics: MINT_FEE = 100000000 (1 KAS) fixed to treasurySpk; artistCut = price − MINT_FEE
  required ONLY if > 0 (zero-cut branch); require(price == 0 || price >= MINT_FEE);
  require(royalty_bips in [0,2000]) at mint; artistOutIdx != platformOutIdx guard.
- engineBaked(): require(blake2b(engine_code + OpOutpointTxId(activeInputIndex)) != 0)
  defeats constant-folding elision (F1); engine bytes therefore live in the redeem.
- mint spawns edition via validateOutputStateWithTemplate(prefix,suffix,hash); lane
  continuation via validateOutputState; OpAuthOutputCount==1 cardinality.
### ReliksEdition-v11 (sil/ReliksEdition-v11.sil → data/edition-abi-v6.json)
- Template hash 5e7a19469a40f813dfb491aefa237bd14cdead9a36dfc5a74d53445c7699924b
  (prefix 1 B / suffix 1952 B). State span {1,161}: ownerIdentifier, identifierType,
  price, artist, royalty_bips, program_hash, factory_covid, serial.
- DECL auth-singleton routes: list[newPrice,ownerSig] / unlist[ownerSig] /
  buy[buyer,ownerOutIdx,artistOutIdx] / sell[buyer,salePrice,ownerOutIdx,artistOutIdx,
  ownerSig] / transfer[newOwner,ownerSig] / spend[ownerSig, termination=allowed].
- checkPayments royalty-only: roy = price*bips/10000; owner >= price−roy (spk ownerSpk);
  artist == roy (spk artistSpk); require(ownerOutIdx != artistOutIdx). NO platform output.
- MIN_PRICE 100000000 (1 KAS), MAX_PRICE 922337203685477; sell allows salePrice == 0
  (signed free handoff, checkPayments skipped).
### OfferEscrow-v4 (sil/OfferEscrow-v4.sil → data/escrow-abi-v4.json)
- Span {1,194}; bc 1244; tags accept 0f6d002c, expire 12ab1c61.
- State: ownerIdentifier, identifierType, edition_covid, askPrice, expireAge, artist,
  royalty_bips, offerer, marketplace.
- Model B: offerer locks askPrice + mktFee (MKT_BIPS=100); accept requires owner sig,
  input value >= ask+mkt, outputs owner >= ask−roy / artist == roy / marketplace == mktFee,
  co-spends edition (OpCovInputCount(edition_covid)==1), bait-and-switch guard
  prevEd.price == askPrice, validateOutputStateWithInputTemplate(edition successor →
  offerer), OpAuthOutputCount(active)==0 (escrow terminates). expire: ageDaa lock,
  full refund to offerer.
- Constructor args 10–12 (edition_prefix_len, edition_suffix_len, expected_template_hash)
  are CONSTANT-FOLDED LITERALS — must be real edition-v11 values at compile time
  (data/escrow-args-v4.json: dummies for state fields, real literals).
### Engine (reliks-engine-v10.js)
- program_hash 8ad0717df91abe588dba3237a874285e3c9928694e8cffdb56a84e88831bb1d9
- render_hash  41cdf1240f72cf8a0eb212fc2cf699cc863e208b516a5f87ad536adf62ebd468
- Integer-only; render(seed) deterministic; serial mod 2^32 seeds.

## 4. Codec / consensus facts (do not re-derive)
- Dispatch tags = blake3("entryName(type1,type2,...)")[0..4] AFTER lowering; param-order
  changes rotate tags AND sigscript stack order (v4→v5 list incident).
- State encoding: push-per-leaf in ABI runtime_state order; ints = 8-byte fixed
  (serialize_script_i64(v, Some(8))); byte[32] = 33 B push; byte = 2 B push.
- covIdGenesis(authTxIdHex, authIdx, outs[]) = keyed blake2b(key="CovenantID") over
  H(txId) ‖ le32(authIdx) ‖ le64(len(outs)) ‖ ∀out: le32(idx)‖le64(value)‖le16(0)‖
  le64(scriptlen)‖script. Lives in v7-lib.js; genesis covenant IDs are creator-chosen
  (binding field taken verbatim) — proven by market rehearsals.
- v1 txid = BLAKE3 payload/rest (excludes sigscripts): same txid can be rejected then
  accepted after a sigscript fix (list d3800564 incident).
- V1 inputs use compute_budget (lane input 100, wallet 10); v1 sighash excludes
  compute_budget; covenant bindings committed by txid/tx::hash.
- REST: /addresses/{hrp-prefixed addr}/utxos; 422 = missing prefix; api-tn10.kaspa.org
  (testnet), api.kaspa.org (mainnet); electron-*.kaspa.stream = wRPC only.

## 5. Keys & secrets (TESTNET ONLY — all burned by chat exposure)
- secrets.env: old wallet/artist 33fe25d181460cec… addr kaspatest:qqelufw3s9… (PC_WALLET
  pinned there).
- secrets-v11.env: PC_PRIV eb66eb95…2eee → pubkey ec7a4c67eb8c26c1… (v11 artist; ~19 996.94
  KAS left), PC_WALLET pinned to ITS address (stale-PC_WALLET lesson), PC_TREASURY_PRIV
  appended (treasury pubkey fb2c09011bb6d770…f90f, receive-only).
- CONFIG TRAP: config.js prefers env PC_WALLET over deriving from PC_PRIV → always
  `unset PC_WALLET PC_PRIV PC_NET` before sourcing a secrets file; deploy/mint v11 carry
  a gallery-codec wallet/priv preflight guard.
- MAINNET: generate offline, never paste; secrets.mainnet.env same three vars.

## 6. Testnet chain record
Series B (TRACKED, data/factory-ledger-v11.json):
- genesis a9b060558832155d8c61997ac5003e02b192380e8c4cfb188e02115bb6c90a04
- lane C   00d10b645ed5e1081d9f6f2b76467e7922ee662494d90650914fad2fac9c16c9 (mints_left 7 live)
- mint     0b977f677b5c7749e8f90955832f4e4e50625f775b0d5cbfbc93885a5ba853f3
  serial 449271923980672019, edition cov 1b26f6367d2ffa4d…
- list 33fa760a… (2 KAS) → buy cb32282cd1509fac… (ownerNet 190000000 / roy 10000000 / plat 0)
- list 41240861… (3 KAS) → offer 82935af3df2623d5… (locked 303000000)
  → accept a514a886deb278b6… (ownerNet 285000000 / roy 15000000 / mktFee 3000000;
     edition → ec7a4c67…)
- Treasury fb2c… holds 3 utxos: 3000000 + 100000000 + 100000000.
Series A (UNTRACKED — second deploy overwrote ledger): genesis 47672d61c29b6caf…,
C aa08f09b85954138…, mint b5359c8244eab9f4…, serial 7224044837501613102,
edition 8688023502a02e24…; lane live with 7 mints; retire via close() + artist sig if desired.
Historic v10 series-2 (ledger data/factory-ledger-v10.json): genesis 1535eb4b…,
C efd4f02e…, editions c877b624…/68026e13…; market proofs: list d3800564…, buy 2b774355…,
NEGATIVE aliasing reject 79073135… ("script ran, but verification failed"),
relist 96804bc5…, zero-price sell 6ee70b62….

## 7. Tooling map (~/pixel-cove)
- v7-lib.js/v8-lib.js: codec (V.parts, V.encState, V.p2sh, covIdGenesis, serialOfV10).
- offer-lib.js: feeLoop (wRPC-first, REST fallback, non-fee rejection throws), pickUtxo,
  sighash(inputs,outputs,idx), waitForConfirmation, hex/pushMin/pushMinInt/H/B/le32/le64.
- network.js: per-net {rest, wrpc[], hrp}; testnet hrp kaspatest, mainnet kaspa.
- deploy-v11.js / mint-v11.js / secondary-v11.js (list|buy|sell) / offer-v4.js /
  accept-v4.js: builders; ALL honor RELIKS_LEDGER / RELIKS_ARGS / RELIKS_ESCROW env
  overrides with testnet defaults (patch-env-ledgers.js).
- gen-factory-args-v11.js <series.json> [out.json]; gen-escrow-args-v4.js.
- verify-render-v10.js: 8 Node checks (genesis lane spk; engine anchor; render
  conformance; mint consumes lane; serial recomputes; edition covenant_id ==
  mintTx.outputs[1].covenant_id; continuation spk; F1 ENGINE_SRC in FULL redeem extracted
  via F.prefix/F.suffix indexOf/lastIndexOf from mintTxId-fetched sigscript).
- gen-gallery-v10.js + web/reliks-gallery-runtime.js: parity asserts (Node encState vs
  browser), REG embed, per-edition browser checks; live-UTXO anchoring via bech32 P2SH
  addresses; liveSpk(spk,txId,idx) proves UTXO at (txId,idx) unspent AND equals spk.
- DUAL-FIELD LINEAGE: editions[i].mintTxId/mintIndex IMMUTABLE (lineage, serial, F1);
  editions[i].txId/index MUTABLE (spending, live anchoring). Builders preserve mintTxId.
  Runtime lane live-probe uses (ed.mintTxId, 0); edition live-probe (ed.txId, ed.index).
- Ledgers: data/factory-ledger-v11.json (tracked), data/escrow-ledger-v4.json,
  archives: factory-ledger-v10*.json, edition-abi-v4-legacy.json, reliks-gallery-v10-series1.html.
- HANDOFF.md: in-repo pin log (all lessons below are mirrored there).

## 8. Settled lessons (pins)
1 F-01: config strict 64-hex PC_PRIV guard; wallet/priv preflight in deploy/mint.
2 Ledger spk double-hex recurrence: mint writes hex(hexString); prefer chain spk or
  decode once; self-tests must source output specs from CHAIN, never ledger spk.
3 INIT_MINTS binds to factory-args[4]; retarget ABI/ledger without args → off-by-series
  mints_left failures (label math reveals: printed = staleInit − (i+1)).
4 Runtime encoder (web/reliks-gallery-runtime.js encFactoryState/encEditionState) must
  track ABI state fields; gen-gallery parity asserts catch desync (v11 treasury field).
5 DECL param-order rotates dispatch tags + stack order; builders must read ABI params.
6 Zero-value outputs are consensus-invalid: fixed-fee splits need `if (cut > 0)` guards.
7 Royalty cap 2000 bips enforced at mint (ownerNet >= 0 otherwise bricks editions).
8 Escrow buyer-premium (Model B) composition: edition floor untouched; fee from buyer's
  locked funds; prevEd.price == askPrice bait-and-switch guard.
9 Traded editions break single-txId lineage → dual-field model (see §7).
10 REST hygiene: prefixed addresses; transient DNS; wRPC-only hosts 404 on REST.

## 9. Remaining work
A. MAINNET DEPLOY (the only horizon):
   1) offline keys (artist / treasury / deploy wallet); secrets.mainnet.env
      (PC_NET=mainnet, PC_PRIV, PC_WALLET pinned).
   2) network.js mainnet wrpc → own full node(s); rest https://api.kaspa.org.
   3) data/series-mainnet-1.json {artist, price(0 or >=1 KAS), royalty_bips<=2000,
      mints_left, treasury}; cp data/factory-args-v11.json → -testnet backup;
      RELIKS_ARGS=data/factory-args-v11-mainnet.json node gen-factory-args-v11.js cfg out.
   4) source secrets.mainnet.env; export RELIKS_LEDGER/RELIKS_ARGS/RELIKS_ESCROW mainnet
      paths; node deploy-v11.js → [node mint-v11.js] → node verify-render-v10.js →
      node gen-gallery-v10.js. Templates are network-agnostic; hrp flips via network.js.
   5) Collectors mint permissionlessly (pay price + 1 KAS carrier + fee); platform capital
      at risk ≈ 1.01 KAS (deploy).
B. Optional: close series-A lane (close + artist sig); exercise escrow expire() path;
   multi-series gallery; marketplace frontend around offer-v4/accept-v4.
C. Never: reuse testnet keys on mainnet; paste privkeys; change frozen templates without
   full re-bake (factory args embed edition prefix/suffix/hash).

## 10. First actions in the new chat
1) Confirm environment (silverc --help; node -e require checks).
2) Run regression: node verify-render-v10.js (expect 8/8) and open reliks-gallery-v10.html
   (expect VERIFIED, all PASS, art rendered).
3) Proceed to §9.A mainnet runbook when economics + keys are ready.