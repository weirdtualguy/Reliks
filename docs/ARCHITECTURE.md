# Reliks Architecture

Deep dive into the UTXO-native covenant design. Companions: README (overview),
SECURITY.md (model), and the Kaspa Toccata references (agent brief,
Silverscript tutorial/declarations, KCC-20 book, lib.rs codec).

## UTXO-native design
- Engines and state live in redeem scripts (P2SH live outputs); no IPFS,
  no servers, no sigscripts for state.
- Covenant IDs (32B) track lineage across changing script hashes.
- 10s confirmation gate before ledger writes (orphan window).

## Contracts and transitions
- SeriesFactory-v11: mint (lane -> edition + lane continuation,
  mints_left-1), fork (lane split), close (artist burn,
  OpAuthOutputCount==0).
- ReliksEdition-v11: list/unlist/buy/sell/transfer/spend; ownerAuthorized
  via IDENTIFIER_PUBKEY schnorr; checkPayments enforces Model B splits.
- OfferEscrow-v4: offer (lock askPrice+mktFee), accept (distribute exact
  royalty+mktFee, >= owner net), expire (return funds).

## Dual-field lineage
- Immutable: mintTxId, mintIndex (genesis anchor) => serial recompute.
- Mutable: txId, index (live outpoint) => next spend.
- serial = ReliksSerialV10: LE63 polynomial of blake2b(domain||lane
  outpoint); art depends only on serial (resale-invariant).

## State encoding (KCC-1 push-per-leaf)
- int: 8B fixed LE push; byte[32]: 33B (push32+opcode); byte: 2B.
- template_hash = blake3(len||prefix||len||suffix).
- Dispatch tags resolved at runtime from ABI as blake3(name(types))[0..4];
  never hardcoded in JS builders.
<!-- EOF-ARCH-1 -->

## Determinism pipeline
- seed = serial mod 2^32; lanes = blake2b("ReliksSeedV10"||le64(seed))
  -> 8 x int32 LE.
- Engines: integer-only xorshift PRNG + integer trig LUTs; SVG string out.
- program_hash = blake2b(ENGINE_SRC); render_hash = blake2b(render(1));
  both anchored at genesis and re-checked by verify-render plus the F1
  gate (engine bytes read back from the mint redeem).

## Mass and fee model
- Consensus mass (storage+compute) <= 100000 (MAX_TRANSACTION_MASS).
- Mempool fee metric: normalized transient mass = 2*tx_bytes at 100
  sompi/unit; feeLoop discovers fee from rejection text.
- Mint sigscript carries the engine twice (template suffix + engineBaked()
  anchor) => bytecode ~ 2*E+7.1K; PUSHDATA2 (65535/push) bounds E; policy
  cap 25.6K enforced by lens L1. Measured on testnet-10: 901B -> 0.023 KAS,
  3.9KB -> 0.031 KAS, 25.6KB -> 0.130 KAS mint fees.

## Transport layer
- wRPC carries compute_budget; REST drops it (limit=9999), so REST cannot
  broadcast covenant spends (proven by "script units exceeded" rejections).
- feeLoop: wRPC-first; covenantSpend=true default hard-throws on non-fee
  failure; REST remains only for non-covenant flows (none shipped).
- network.js profiles: testnet default; mainnet requires PC_MAINNET_WRPC
  (hard exit otherwise).

## Verification surface
- Browser: gallery recomputes editions from public REST + anchored bytes.
- Node: verify-render-v10.js (14 gates) and reliks-lens.js (L0-L10).
- Everything reproducible from public chain data + repo code alone.
<!-- EOF-ARCH-2 -->
