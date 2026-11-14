# Reliks protocol (v12 mainnet & v13 Reliks-VM specification)

Status: v12 is frozen on mainnet; v13 (adding `lineage`, `sales`, and Reliks-VM v1) is verified on testnet-10 and ready for mainnet genesis. Reference code: `web/reliks-chain.js` and `sdk/`. Independent check: `sdk/ref_protocol.py` generates `sdk/protocol-vectors.json`, and `sdk/test-protocol.js` verifies the JS codec against it (`npm test` / `sh tools/check.sh`). Items marked UNREVIEWED were not checked against the `silverc` compiler internals. Where this text and the contract disagree, the contract wins and this text is a bug.

## 1. Conventions
- H(x) is blake2b-256. H_k(x) is the keyed variant. le16/le32/le64 are little-endian unsigned. Hex is lowercase.
- State field encoding: one explicit push per field, a single length byte then the data. Ints are 8 bytes little-endian and must be below 2^63. `identifierType` is 1 byte. Byte fields are exactly 32 bytes.

## 2. State
Factory (7 fields, 135 bytes encoded): program_hash(32), artist(32), price(8), royalty_bips(8), mints_left(8), engine_lang(8), render_hash(32).

Edition (10 fields, 203 bytes encoded): ownerIdentifier(32), identifierType(1), price(8), artist(32), royalty_bips(8), program_hash(32), factory_covid(32), serial(8), lineage(32), sales(8). The v12 edition has the first 8 fields (161 bytes).

## 3. Derivations
- serial = first 7 bytes of h read little-endian, plus (h[7] mod 128) * 2^56, where h = H("ReliksSerialV10" || txid || le32(index)). Result is below 2^63.
- genesis lineage = H("ReliksGenesisV2" || txid || le32(index)).
- advanced lineage = H("ReliksLineageV2" || previous lineage || new owner identifier).
- covenant id (KIP-20 genesis) = H_"CovenantID"(authorizing txid || le32(authorizing index) || le64(output count) || for each bound output: le32(index) || le64(value) || le16(0) || le64(script length) || script).
The names carry historical suffixes. They are fixed strings, not versions.
For a mint, (txid, index) is the lane outpoint the mint spends: output 0 of the previous mint transaction, or output 0 of the genesis transaction for the first mint (the factory contract computes both from this outpoint, section 5; also observed on the testnet ledgers).

## 4. Edition transitions
Source: `v13/ReliksEdition-v13.sil`, transcribed by hand. Compiled with `silverc` and `v13/edition-args-v13.json`, that source gives bytecode, template hash and state span identical to `data/edition-abi-v13.json` and `v13/out/v13.json`, and those templates rebuilt the live testnet edition scripts (2026-10-03; `tools/verify-contract.js`). Every route is a one-input, one-output covenant transition authorized by the edition's own input, except `spend`, which ends the edition. "Owner auth" means a Schnorr signature by the owner key, and it requires `identifierType = IDENTIFIER_PUBKEY`. "Carrier" means the edition output's value must be at least its input's value. `MAX = 922337203685477`.

| Route | Arguments | Auth | Checks | Resulting state |
|---|---|---|---|---|
| list | newPrice, ownerSig | owner | carrier; 100000000 <= newPrice <= MAX | price = newPrice, rest copied |
| unlist | ownerSig | owner | carrier | price = 0, rest copied |
| buy | buyer, ownerOutIdx, artistOutIdx | none | 0 < price <= MAX; carrier; payments | owner = buyer, price 0, lineage advanced, sales + 1 |
| sell | buyer, salePrice, ownerOutIdx, artistOutIdx, ownerSig | owner | 100000000 <= salePrice <= MAX; carrier; payments | as buy |
| transfer | newOwner, ownerSig | owner | carrier | owner = newOwner, price 0, lineage advanced, sales unchanged |
| spend | ownerSig | owner | none (no carrier check) | edition ends |

"Advanced" lineage is `H("ReliksLineageV2" || previous lineage || new owner)`. The new owner's `identifierType` is always `IDENTIFIER_PUBKEY`, so covenant owners are not supported in this version.

Payments (`buy` and `sell`): `roy = floor(salePrice * royalty_bips / 10000)`. The two output indices must differ. The output at `ownerOutIdx` pays at least `salePrice - roy` (which must be non-negative) to the previous owner's P2PK script. The output at `artistOutIdx` pays exactly `roy` to the artist's P2PK script. For `buy`, the sale price is the listed price. `buy` needs no owner signature, so any listed edition can be bought by paying these outputs.

Consequences worth stating:
- `sales` is purchasable, not earned. `sell` accepts any buyer key and any price from 1 KAS up, so an owner can sell to another key they control. Each such step costs the royalty (nothing if the owner is also the artist) plus the fee, and it increments `sales` and advances `lineage`. Anything that treats `sales` as proof of market history must account for this.
- `transfer` advances `lineage` at no royalty. Lineage grinding is bounded only by the 64-value quantization in the VM host rule.

## 5. Mint (factory contract)
Source: `v13/SeriesFactory-v13.sil` (and `sil/SeriesFactory-v12.sil` on mainnet v12), transcribed by hand; it recompiles to the deployed factory bytecode of both testnet VM series (`tools/verify-contract.js`). Constants: `IDENTIFIER_PUBKEY = 0`, `MIN_PRICE = 100000000` (1 KAS), `MAX_ROYALTY_BIPS = 2000`.

Entry `mint(buyer: byte[32], buyerScheme: byte, editionOutIdx: int, artistOutIdx: int)`. No signature is required: anyone can mint to any buyer key by paying. The contract requires:
1. `mints_left > 0`; `buyerScheme = 0`; `price = 0` or `price >= 100000000`; `1 <= royalty_bips <= 2000`. A series deployed with `royalty_bips` outside `1..2000` can never mint.
2. `blake2b(engine_code) = program_hash`, where `engine_code` is the program baked into the factory script. A separate check in `engineBaked()`, `require(blake2b(engine_code || lane input txid) != 32 zero bytes)`, is always true in practice; it exists so `silverc` cannot constant-fold or dead-code-eliminate `engine_code` out of the compiled redeem script (F-12).
3. If `price > 0`, the output at `artistOutIdx` pays exactly `price` to the artist's P2PK script: 100% of the primary sale, no platform fee. If `price = 0`, `artistOutIdx` is not constrained.
4. The output at `editionOutIdx` carries the edition template (checked against `expected_template_hash`) with state: `owner = buyer`, `identifierType = buyerScheme`, `price = 0`, `artist`, `royalty_bips` and `program_hash` from the factory state, `factory_covid` = covenant id of the lane input, `serial` and `lineage` computed from the lane input's outpoint (section 3), `sales = 0`. Its value is at least `100000000`.
5. The lane input has exactly one authorized output. It is worth at least the lane input and carries the lane state with `mints_left - 1` and every other field unchanged, including `engine_lang` and `render_hash`.
UNREVIEWED: how the edition output's covenant id is checked; the internals of `validateOutputStateWithTemplate` and `validateOutputState`.

`fork` and `close`: both need the artist's signature. `fork` splits one lane into two: `leftMints` and `rightMints` both above 0 and summing to `mints_left`, the two outputs together worth at least the input, other fields unchanged. `close` ends the lane.

Reference SDK (`web/reliks-chain.js` `buildMint`): output order is lane (0), edition (1), artist (2, only if `price > 0`), then change; the signature script hardcodes `editionOutIdx = 1` and `artistOutIdx = 2`; edition value 1 KAS; the edition covenant is a KIP-20 genesis authorized by the funding input (index 1). `sdk/plan.js` `planMint` checks all of this against the rules above.

## 5b. Offer escrow (v6)
Source: `v13/OfferEscrow-v6.sil`, transcribed by hand; it recompiles to `v13/out/escrow-v6.json` (`tools/verify-contract.js`). Constants as in the edition: `IDENTIFIER_PUBKEY = 0`, `MIN_PRICE = 100000000`, `MAX_PRICE = 922337203685477`.

State (8 fields, 161 bytes encoded): `ownerIdentifier(32)`, `identifierType(1)`, `edition_covid(32)`, `askPrice(8)`, `expireAge(8)`, `artist(32)`, `royalty_bips(8)`, `offerer(32)`. The escrow script is the bytecode of `v13/out/escrow-v6.json` with the 161-byte state inserted at the state span (`prefix` = bytecode before the span, `suffix` = after), encoded as in section 1. The edition template's prefix length, suffix length and expected hash are constructor arguments baked into the escrow script, not stored in state (per `v13/make-v13-escrow.js`, which derives them from the edition ABI), so an escrow only works with the edition template it was built for. An escrow is created by paying to its script; the source has no creation rule. It holds at least `askPrice` (a fee buffer on top is customary, not required).

`accept(ownerSig, editionOutIdx, paymentOutIdx, royaltyOutIdx)`:
- The owner signs (pubkey owners only); `MIN_PRICE <= askPrice <= MAX_PRICE`; the escrow input is worth at least `askPrice`.
- The three output indices differ pairwise. With `roy = floor(askPrice * royalty_bips / 10000)`, output `paymentOutIdx` pays exactly `askPrice - roy` to the owner's P2PK script and output `royaltyOutIdx` pays exactly `roy` to the artist's P2PK script.
- Exactly one input carries the covenant `edition_covid`. Its state, read with the edition template, must have `owner` = the escrow's `ownerIdentifier`, `price = askPrice`, and the same `royalty_bips` and `artist` as the escrow.
- The output at `editionOutIdx` is worth at least that input and carries the sold state with the offerer as buyer: `owner = offerer`, `identifierType = 0`, `price = 0`, `lineage` advanced with the offerer, `sales + 1`, everything else copied.
- The escrow ends: no authorized outputs.
The edition input is spent in the same transaction through an edition route; per the source comment its `buy` route enforces the same split. The escrow does not check which route is used (UNREVIEWED), nor the internals of `readInputStateWithTemplate` and `validateOutputStateWithInputTemplate`.

`expire()`: once the escrow's age in DAA score reaches `expireAge`, anyone may spend it. Output 0 must pay exactly the input's full value to the offerer's P2PK script, with no authorized outputs. Because the refund equals the whole input, the fee must come from another input the caller adds (inferred).

Consequences:
- An offer is bound to one edition covenant, its current owner and a listing at exactly `askPrice`. If the owner changes, relists at another price or unlists, `accept` fails and the funds stay locked until `expireAge`.
- There is no cancel route: `accept` and `expire` are the only exits.
- Accepting requires the edition to be listed at `askPrice`, and the listing is public, so a third party can buy it first through the edition's `buy` route; the offer is then stranded until it expires.
- `accept` raises `sales` like a sale, and the offerer can be any key: it is another route to the purchasable-sales property of section 4.
- The protocol takes no marketplace fee; the source says marketplaces fork the escrow.

## 6. Engine, `engine_lang` freeze, and render (F-11)
- `program_hash = H(program)`. `render_hash = H(canonical SVG of the program at serial 1, zero lineage, sales 0)`. Both anchors verify on the mainnet and testnet series. Readers should find the program bytes inside the lane script (or provenance bundle) and hash them, not trust `program_hash` alone.
- The Reliks-VM program is specified in `v13/RELIKS-VM-SPEC.md`. The contract copies `engine_lang` through every transition without checking it.
- **Frozen `engine_lang` enum (F-11):**
  - `0` or `1` (with JS source starting with `function`): **JavaScript v12 engine** (legacy mainnet v12 genesis carries `1`; `cli/gen-factory-args.js` emits `0`).
  - `1` (with RVM magic `52 56 4d 01` on `testnet-10` only): **Legacy testnet-10 Reliks-VM v1** (used only by the two early `testnet-10` series `cf1f1e60…` and `ce0f4fc0…`).
  - `2` (with RVM magic `52 56 4d 01`): **Reliks-VM v1 (`RVM\x01`)**. Required for all new Reliks-VM series and **mandatory for any mainnet Reliks-VM series** (`v13/gen-vm-factory-args.js` defaults to `2`).
  - Readers and the verification site (`sdk/read.js` `engineKind`, `web/site-app.js`) inspect the program bytes first (`52 56 4d 01` -> RVM v1; `function` -> legacy JS; anything else -> `unknown`, never rendered) and cross-check `engine_lang` consistency.

## 7. Mainnet today & v13 Genesis
Mainnet v12 genesis runs the 8-field edition (no `lineage` or `sales`), JS engine, `engine_lang = 1`. Read-only checks for it: `sdk/verify-v12.js`, `cli/verify-render.js`, and `docs/index.html`.
For a **v13 Reliks-VM mainnet genesis**, the series deploys `v13/SeriesFactory-v13.sil` and `v13/ReliksEdition-v13.sil` (10-field edition with `lineage` and `sales`, 203-byte state span) with `engine_lang = 2` and an `RVM\x01` program gated by `cli/reliks-lens-vm.js`. `docs/index.html` (`tools/gen-site.js` + `web/site-app.js`) embeds `v13/vm/rvm.js` and verifies both v12 JS series and v13 Reliks-VM series in the browser.

## 8. Not specified yet
Owner-as-covenant and collection-wide offers (design only, not implemented); splits and custom mint modes.

## 9. Verification status
Sections 2 and 3 are checked two ways. (a) Two independent implementations (the JS codec and `sdk/ref_protocol.py`) agree on generated vectors for state encoding, serial, lineage and covenant id. (b) On testnet-10, the serials of all 4 minted editions and the genesis lineage of the one edition with no sales reproduce from the lane outpoint spent by the mint, and the on-chain edition scripts rebuilt from those values were found live (all 4 confirmed, 2026-10-03). The factory contract computes serial and lineage itself from the lane input outpoint (section 5), so a mint cannot produce different values. Section 4 is transcribed by hand from the edition contract source, which recompiles to the deployed bytecode (`tools/verify-contract.js`); the transcription has not been reviewed by anyone else. Section 5 is transcribed by hand from the factory source, which also recompiles to the deployed factory bytecode; the checks marked UNREVIEWED there remain open. Section 5b is transcribed by hand from the escrow source, which recompiles to `v13/out/escrow-v6.json` (`tools/verify-contract.js`).

## 10. Reading model & Minimal Conforming Indexer API Contract
Observed on testnet-10 on 2026-10-03 with kascov, the public REST API and two public wRPC nodes.
- History: kascov exposes the full revealed script of every spent edition output. Decoding it with section 2 gives the exact state at each step; for testnet VM edition 1 the three spent outputs decode, serial and program_hash stay constant, and the lineage chain follows section 3.
- Live state: a live edition output shows only its script hash. Kascov has no revealed script for it, its holders list is empty, and its `state_fields` label is unreliable. No indexer checked reports the current owner of an edition without a claimed state.
- Replay of the last spend is not a general method: public nodes prune block bodies after ~24–65 hours.
- Therefore a client obtains a claimed state (`owner`, `price`, `lineage`, `sales` and the rest of section 2) from any source (a provenance bundle, a registry, the owner, or an archival indexer) and accepts the claim only if the rebuilt script (edition template with that state, section 2) equals the script of a live output of the edition's covenant, found through an index with a fresh tip (or verified against a Kaspa REST UTXO query for the P2SH address).

### 10.1 Minimal Conforming Indexer API Contract
Any third-party or self-hosted covenant indexer can replace `kascov.io` by serving two static/REST JSON endpoints under `<base>`:

1. **Freshness endpoint (`GET <base>-live.json`)**:
   ```json
   {
     "tip_at_ms": 1759500000000,
     "tip_daa": 586420000,
     "processed_daa": 586419995
   }
   ```
   - `tip_at_ms` (number): Unix timestamp in milliseconds of the latest chain tip seen by the indexer.
   - `tip_daa` (number): DAA score of the chain tip.
   - `processed_daa` (number): DAA score through which covenant outputs have been indexed.
   - Effective staleness in seconds (`sdk/read.js` `kascovTipAgeSec`) is `round((now_ms - tip_at_ms)/1000) + round(max(0, tip_daa - processed_daa)/10)`.

2. **Covenant endpoint (`GET <base>/c/<covenantId>.json`)**:
   ```json
   {
     "covenant_id": "<64 lowercase hex>",
     "genesis_txid": "<64 lowercase hex>",
     "live_value": 100000000,
     "event_count": 2,
     "events_truncated": false,
     "utxos_truncated": false,
     "utxos": [
       {
         "outpoint": "<txid>:<index>",
         "value": 100000000,
         "script_hex": "0000aa20<64 hex>87",
         "live": false,
         "created_daa": 586000000,
         "spent_txid": "<spending txid, 64 hex>",
         "revealed_hex": "<redeem script hex extracted from spending input signatureScript>"
       }
     ],
     "events": [
       {
         "kind": "genesis | transition | mint",
         "txid": "<64 lowercase hex>",
         "with_covenants": ["<spawned or co-transacted covenantId, 64 hex>"]
       }
     ]
   }
   ```
   - For lane resolution (`sdk/lane.js`, `web/reliks-chain.js`), the indexer must provide `utxos[]` (with `live`, `outpoint`, `value`, `script_hex`, and `revealed_hex` on spent outputs) and `events[]` (`kind`).
   - For edition claim & provenance verification (`sdk/claim.js`), the indexer additionally provides `genesis_txid`, `utxos[].spent_txid`, `utxos[].created_daa`, and `events[].with_covenants`.

## 11. Claims & Signed Ownership Challenges
A claim is a JSON object a client receives from any source (a provenance bundle, a registry, the owner, an indexer, a wallet) asserting the current state of one edition:

```json
{
  "reliks_claim": 1,
  "network": "testnet-10",
  "covenantId": "<edition covenant id, 64 lowercase hex>",
  "state": {
    "ownerIdentifier": "<64 hex>", "identifierType": 0, "price": "0",
    "artist": "<64 hex>", "royalty_bips": "500", "program_hash": "<64 hex>",
    "factory_covid": "<lane covenant id, 64 hex>", "serial": "12345",
    "lineage": "<64 hex>", "sales": "2"
  },
  "outpoint": "<txid>:<index>",
  "source": "free text, ignored"
}
```

The state is the ten edition fields of section 2. Hex is 64 lowercase characters. Integers are non-negative decimal strings (JSON numbers are accepted only if they are safe integers) and must be below 2^63. `identifierType` must be 0. `outpoint` and `source` are optional.

Verification (`sdk/claim.js` `verifyClaim`): validate the format; encode the state and rebuild the edition script (section 2); optionally check that a supplied program hashes to `program_hash` and renders, and that `program_hash`, `artist` and `royalty_bips` equal a known series; fetch the covenant's outputs from an index; find outputs with that script. Result statuses: `current`, `stale_state`, `absent`, `index_stale`, `unreachable`, `invalid_claim`, `provenance_failed`, `program_mismatch`, `series_mismatch`, `outpoint_mismatch`, `ambiguous`, `history_conflict`.

### 11.1 Signed Ownership Challenge (`ReliksOwnerChallengeV1`)
A `current` claim proves that `state.ownerIdentifier` is the on-chain owner committed in the live covenant UTXO, **not** that the presenter controls the private key for `state.ownerIdentifier`. To prove key control without a central registry or on-chain transaction, the presenter attaches a `proof` object to the claim:

1. **Canonical Claim Digest (`claimHash`)**:
   ```
   claim_Digest = H("ReliksClaimV1" || utf8(network) || 0x00 || hex2bytes(covenantId) || encEditionState(state))
   ```
   where `encEditionState(state)` is the exact 203-byte (v13) or 161-byte (v12) KCC-1 explicit-push encoding from Section 2.
2. **Challenge Preimage (`challengeDigest`)**:
   Given a verifier-supplied or timestamped challenge string `challenge` (non-empty UTF-8, e.g. `"marketplace.example:2026-11-13T12:00:00Z:nonce-9f8a"`):
   ```
   msg_hash = H("ReliksOwnerChallengeV1" || claim_Digest || utf8(challenge))
   ```
3. **Signature**:
   A 64-byte secp256k1 Schnorr signature (`128` lowercase hex chars) over the 32-byte `msg_hash` using the x-only public key `state.ownerIdentifier` (`identifierType == 0`).
4. **Proof Object Format**:
   ```json
   "proof": {
     "scheme": "ReliksOwnerChallengeV1",
     "challenge": "<non-empty UTF-8 string>",
     "signature": "<128 lowercase hex>"
   }
   ```
5. **Verification (`sdk/claim.js` `verifyOwnershipProof`)**:
   - Recomputes `claim_Digest` and `msg_hash` from `(claim, proof.challenge)`.
   - Verifies that `proof.challenge` matches the expected challenge (if the verifier issued one) and that the Schnorr signature is valid for `msg_hash` under `claim.state.ownerIdentifier`.
   - Combined with `verifyClaim(...) === 'current'`, this yields a self-authenticating, portable proof of live ownership and custody with zero central authority.

## 12. Submitting a transaction (observations)
From one mint on testnet-10 on 2026-10-06; not a specification.
- The nodes' `submitTransaction` takes the transaction as JSON with plain-number values, `version: 1`, `inputs` (`previousOutpoint`, `signatureScript`, `sequence`, `sigOpCount`, `computeBudget`), `outputs` (`value`, `scriptPublicKey` with a `0000` version prefix, and `covenant {authorizingInput, covenantId}` only on outputs that have one), `lockTime: 0`, `subnetworkId` of 20 zero bytes, `gas: 0`, empty `payload`, and a top-level `mass` of `0`. Without the `mass` field both public nodes answered `"request deserialization error"`.
- `allowOrphan` was not needed for a mint. The signature scripts are not committed to by the signature hash of other inputs' scripts, and the `mass` field is not part of the signature hash (`sdk/sign.js`, equal to the hash that signed the earlier mints).
- A mint of about 12.5 KB (the factory script travels in the signature script) was accepted at a fee of 0.0313 KAS; network mass was not measured.
