# RELIKS AUDIT BRIEF (package v2)

SCOPE: Frozen Kaspa Toccata covenant set (SeriesFactory-v11, ReliksEdition-v11,
OfferEscrow-v4) + JS KCC-1 codec/builders/verifier + testnet rehearsal records.
Generative-art NFT protocol: engine bytes anchored in factory template; editions
recomputed (never retrieved) from (authenticated engine, chain-derived serial).

ARCHITECTURE:
- UTXO-native covenants. State in redeem-script preimage; P2SH live outputs;
  covenant IDs for lineage across changing script hashes. Tx v1 compute_budget.
- SeriesFactory-v11: mint (lane consumes itself, spawns edition), fork, close.
  engine_code baked in template suffix; engineBaked() anti-elision anchor.
- ReliksEdition-v11: list/unlist/buy/sell/transfer/spend. Dual-field lineage:
  mintTxId/mintIndex immutable; txId/index mutable. F1 gate reads engine bytes
  from the mint redeem (archival) while edition spk anchors to LIVE UTXO set.
- OfferEscrow-v4: offer/accept/expire; bait-and-switch guards mirror edition state.

ECONOMICS (Model B): mint: 1 KAS platform fee -> treasury + price-royalty -> owner
+ royalty -> artist. Secondary: royalty-only checkPayments (owner >= price-roy,
artist == roy, platform 0). Escrow: +1% buyer premium -> marketplace.

CODEC PINS: KCC-1 push-per-leaf state encoding (int=8B fixed, byte[32]=33B push,
byte=2B push); dispatch tags = blake3("name(types)")[0..4] resolved AT RUNTIME
from ABI artifacts (never hardcoded); template_hash = blake3(len||prefix||len||suffix).

CONSENSUS/POLICY CEILINGS: push <=65535; sigscript <=250000; tx mass <=100000;
compute_budget*10000+9999 script units/input; v1 sighash EXCLUDES compute_budget
(tx::hash includes it). ENGINE_CAP 32768 is CLIENT POLICY, not consensus.
MASS/FEE LAW (measured on testnet): transient mass = 2*tx_bytes; fee = 100 sompi/mass.

DETERMINISM PINS: integer-only engines; seed = serial mod 2^32; lanes =
blake2b("ReliksSeedV10"||le64(seed)) -> 8 int32 LE; render_hash = blake2b(render(1));
program_hash = blake2b(engine) == state[0]; serials = ReliksSerialV10 LE63 poly of
blake2b(domain||lane outpoint). Art invariant under resale (seed = serial only).

PRIOR AUDIT: findings E-1/F-M1/F-M2/ESC-INFO CLOSED via tooling guards
(gen-factory-args-v11.js, mint-v11.js, offer-v4.js, secondary-v11.js, accept-v4.js).
Lens L4 bare-realm wrapper fixed for PRELUDE_V1 engines. reliks-lens.js = L0-L10
pre-bake gate suite. OPEN INFORMATIONAL: ESC-1 (escrow claims vs edition, safe by
design), ESC-2 (accept race + overfund surplus burns), ESC-3 (binding obligation).

PRE-MAINNET GAPS: network.js mainnet wrpc array still lists testnet hosts (REST
fallback works; fix before mainnet); Reown allowlist missing Pages origin.

REHEARSAL RECORDS (testnet-10, all verified 12/12 gates):
Series B: see data/factory-ledger-v11.json. Series C (DAG-city engine 3888 B,
hash 16440384...): genesis 85d41d78..., mints 8f0cc8c0/1e80012f; secondary
list 95a408b7 -> buy a3842fd7; offer 50477416 -> accept 407b23b5.
Series D (studio-born engine 1200 B, hash fbf13071...): genesis 1df95faa...,
mints 34db71a6/1a845f77. Mass probes 16/24/32K: genesis 64f848ae/509ee8b1/04e9ad2e.

VERIFY LOCALLY: npm i @noble/hashes @noble/secp256k1 ws;
offline: node reliks-lens.js reliks-engine-mainnet.js (expect 12/12 PASS);
online: node verify-render-v10.js (re-anchors Series B against live chain).
KEY MATERIAL: all keys referenced anywhere are TESTNET and burned by design;
mainnet keys have never existed in this repository.
