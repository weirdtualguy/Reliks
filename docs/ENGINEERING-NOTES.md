# Engineering notes: Kaspa covenant pitfalls

Hard-won facts from building Reliks against Toccata-era Kaspa. Each cost at least one debugging round.

## Transport
- Covenant spends must go over **wRPC**. REST `SubmitTxInput` has no `compute_budget`, so covenant txs die with `script units exceeded: limit=9999`.
- wRPC JSON is strict camelCase; `scriptPublicKey` is flattened to `'0000'+hex`; send `allowOrphan:true`.
- **Operator wRPC vs. public endpoint fallback (F-05):** Public wRPC and REST endpoints often filter non-browser WebSocket/HTTP clients unless `Origin: https://wallet.kaspanet.io` and a Mozilla `User-Agent` header are sent. `lib/reliks-lib.js` (`PUBLIC_ENDPOINT_HEADERS`) keeps those headers as a marked fallback for public endpoints, but relying on third-party endpoint leniency is fragile. Always prefer an operator-controlled wRPC endpoint via `PC_MAINNET_WRPC` (mainnet) or `PC_TESTNET_WRPC` (testnet-10). When all configured endpoints reject or time out, `broadcastWithMsg` surfaces an explicit error instructing the operator to set `PC_MAINNET_WRPC` / `PC_TESTNET_WRPC`.
- Public nodes may reject valid deep spends as "orphan where orphan is disallowed". Rotate endpoints; never broadcast through seeders on testnet.
- Do not re-run a builder while a tx may be pending: identical inputs/fee give the identical txid and "already in the mempool". Check kascov or `node tools/tx-status.js <txid>` first.
- Gate consecutive actions on confirmation (`waitForConfirmation`: REST, then kascov fallback, then wallet UTXO fallback). Public nodes do not chain mempool parents.

## Transactions and hashing
- v1 sighash = keyed BLAKE2b (`TransactionSigningHash`); preimage excludes sigOpCount/computeBudget; the outputs hash commits covenant bindings (`u8 flag || u16 authInput || 32B id`).
- KIP-20 genesis covenant id = keyed BLAKE2b (`CovenantID`) over auth outpoint, `le64(count)`, then per output `le32 idx || le64 value || le16 ver || le64 len || script`.
- Version-1 inputs: `sigOpCount` must be 0. The txid excludes signature scripts.
- P2SH state lives in the redeem preimage: `prefix || current-state || suffix`. Never use constructor bytecode.
- Address codec: Bech32 charset, `:` separator, 40-bit CashAddr-style polymod. HRP is folded with `& 0x1f` (no BIP-173 expansion). See `lib/bech32-kaspa.js`.

## Mass, fees, sizes
- Storage mass scales roughly inversely with output value. Carriers stay at 1 KAS or more; a 3-input escrow accept exceeded the 500k cap, hence the 2-input design.
- Mempool fee: `2 * tx_bytes` mass at 100 sompi/unit, so about 200 sompi per tx byte. `feeLoop` parses the required fee from rejections and pays `required * 1.1 + 1`.
- The mint sigscript carries the engine twice (template suffix plus the `engineBaked()` anchor). Compiled bytecode is about `2E + 7.1K` and must fit one PUSHDATA2 push (65535 B). Default engine cap: `25,641` B (applies to both JS engines and Reliks-VM programs baked into `SeriesFactory`).
- Covenant/royalty outputs must clear dust padding (KIP-9); contracts check `>=` on carriers so overpay is valid.

## Compiler and codec
- `silverc` drops unreferenced constructor params and constant-folds pure expressions over them. The engine is kept alive by the runtime-mixed anchor `blake2b(engine_code + OpOutpointTxId(...))` in `engineBaked()` (F-12).
- `validateOutputState` rejects `byte[]` state fields; the engine lives in template data, not state.
- Dispatch tags are `blake3("name(types)")[0..4]` after lowering. Reordering policy params rotates the tag and the sigscript stack order. Builders derive order from the ABI at runtime.
- State encoding (KCC-1): ints are 8-byte LE pushes; `byte[32]` is a 33-byte push; `byte` is 2 bytes. Signature args use PushMinimal.
- Ledger `spk` may be hex-of-hex from older builders; consumers normalize (`spkClaimMatches` / `normSpk`).
- Any state-field change requires updating, in order: contract, ABI, builders, verifier state objects, gallery runtime `enc*State`, registry, parity re-run.

## Determinism
- v12 JS Seed = `serial mod 2^32` via exact BigInt. Lanes = `blake2b("ReliksSeedV10" || le64(seed))` as 8 int32 LE.
- v13 Reliks-VM Host Inputs = `blake2b("ReliksSeedV2" || le64(serial))` over the full 63-bit serial as 8 int32 LE lanes, `serial32 = int32(serial mod 2^32)`, `pat = blake2b("ReliksPatinaV2" || lineage)[0] & 63`, `wear = min(sales, 255)`.
- Serial = `ReliksSerialV10` LE63 polynomial of `blake2b(domain || lane txid || le32 index)`.
- Engines must be integer-only. Display adapters (SVG viewport wrappers) live outside the anchored bytes.
