# Reliks protocol specification

Reference code: `web/reliks-chain.js` and `sdk/`. Independent check: `sdk/ref_protocol.py` generates `sdk/protocol-vectors.json`, and `sdk/test-protocol.js` verifies the JS codec against it (`npm test` / `sh tools/check.sh`). Where this text and the contract disagree, the contract wins.

## 1. Conventions
- H(x) is blake2b-256. H_k(x) is the keyed variant. le16/le32/le64 are little-endian unsigned. Hex is lowercase.
- State field encoding: one explicit push per field, a single length byte then the data. Ints are 8 bytes little-endian and must be below 2^63. `identifierType` is 1 byte. Byte fields are exactly 32 bytes.

## 2. State
Factory (`contracts/SeriesFactory.sil`, 8 fields, 144 bytes encoded): `program_hash(32)`, `artist(32)`, `price(8)`, `royalty_bips(8)`, `mints_left(8)`, `engine_lang(8)`, `render_hash(32)`, `next_serial(8)`.

Edition (`contracts/ReliksEdition.sil`, 10 fields, 203 bytes encoded): `ownerIdentifier(32)`, `identifierType(1)`, `price(8)`, `artist(32)`, `royalty_bips(8)`, `program_hash(32)`, `factory_covid(32)`, `serial(8)`, `lineage(32)`, `sales(8)`.

Escrow (`contracts/OfferEscrow.sil`, 8 fields, 161 bytes encoded): `ownerIdentifier(32)`, `identifierType(1)`, `edition_covid(32)`, `askPrice(8)`, `expireAge(8)`, `artist(32)`, `royalty_bips(8)`, `offerer(32)`.

## 3. Derivations
- `serial = next_serial` (assigned by the consumed `SeriesFactory` lane state; the successor lane commits `next_serial + 1`, and `fork` splits into `next_serial` and `next_serial + leftMints`).
- `genesis lineage = H("ReliksGenesisV2" || factory_covid || le64(next_serial))` (`web/reliks-chain.js` `genesisLineage`).
- `advanced lineage = H("ReliksLineageV2" || previous lineage || new owner identifier)`.
- `covenant id (KIP-20 genesis) = H_"CovenantID"(authorizing txid || le32(authorizing index) || le64(output count) || for each bound output: le32(index) || le64(value) || le16(0) || le64(script length) || script)`.

## 4. Edition transitions
Source: `contracts/ReliksEdition.sil` (template hash `9106b142…`, state span 203 B). Every route is a one-input, one-output covenant transition authorized by the edition's own input, except `spend`, which ends the edition. "Owner auth" means a Schnorr signature by the owner key (`identifierType = IDENTIFIER_PUBKEY`). "Carrier" means the edition output's value must be at least its input's value. `MIN_PRICE = 100000000` (1 KAS), `MAX_PRICE = 922337203685477`, `MIN_ROYALTY_OUT = 5000000` (0.05 KAS).

| Route | Arguments | Auth | Checks | Resulting state |
|---|---|---|---|---|
| list | newPrice, ownerSig | owner | carrier; MIN_PRICE <= newPrice <= MAX_PRICE; (newPrice * royalty_bips) / 10000 >= MIN_ROYALTY_OUT | price = newPrice, rest copied |
| unlist | ownerSig | owner | carrier | price = 0, rest copied |
| buy | buyer, ownerOutIdx, artistOutIdx | none | 0 < price <= MAX_PRICE; carrier; payments at base+1, base+2 | owner = buyer, price 0, lineage advanced, sales + 1 |
| sell | buyer, salePrice, ownerOutIdx, artistOutIdx, ownerSig | owner | MIN_PRICE <= salePrice <= MAX_PRICE; royalty >= MIN_ROYALTY_OUT; carrier; payments at base+1, base+2 | as buy |
| transfer | newOwner, ownerSig | owner | carrier | owner = newOwner, price 0, lineage advanced, sales unchanged |
| spend | ownerSig | owner | none | edition ends |

Payments (`buy` and `sell`): `roy = floor(salePrice * royalty_bips / 10000)`. With `base = OpAuthOutputIdx(this.activeInputIndex, 0)`, `ownerOutIdx == base + 1` and `artistOutIdx == base + 2`. Output `ownerOutIdx` pays at least `salePrice - roy` to the previous owner's P2PK script; output `artistOutIdx` pays exactly `roy` to the artist's P2PK script.

## 5. Mint (factory contract)
Source: `contracts/SeriesFactory.sil` (template hash `029512ea…`, state span 144 B). Constants: `IDENTIFIER_PUBKEY = 0`, `MIN_PRICE = 100000000` (1 KAS), `MIN_ROYALTY_BIPS = 500` (5%), `MAX_ROYALTY_BIPS = 2000` (20%).

Entry `mint(buyer: byte[32], buyerScheme: byte, editionOutIdx: int, artistOutIdx: int)`:
1. `mints_left > 0`; `buyerScheme = 0`; `price = 0` or `price >= 100000000`; `500 <= royalty_bips <= 2000`; `artistOutIdx == editionOutIdx + 1`.
2. `blake2b(engine_code) = program_hash`, plus `engineBaked()` to prevent constant-folding.
3. If `price > 0`, output `artistOutIdx` pays `price` (100% of primary sale) to the artist's P2PK script.
4. Output `editionOutIdx` carries the edition template (`expected_template_hash`) with `serial = next_serial`, `lineage = H("ReliksGenesisV2" || factory_covid || le64(next_serial))`, `sales = 0`, and value `>= 100000000`.
5. The lane input's single authorized output carries `mints_left - 1` and `next_serial + 1`.

`fork` and `close`: both require the artist's signature. `fork` splits a lane into two outputs each worth `>= 100000000` (1 KAS) with `leftMints + rightMints == mints_left` and disjoint serial counters (`next_serial` and `next_serial + leftMints`). `close` terminates the lane.

## 5b. Offer escrow
Source: `contracts/OfferEscrow.sil` (template hash `18e3d59a…`, state span 161 B).
- `accept(ownerSig, editionOutIdx, paymentOutIdx, royaltyOutIdx)`: requires owner signature, `this.activeInputIndex == editionInIdx + 1`, `editionOutIdx == OpAuthOutputIdx(editionInIdx, 0)`, `paymentOutIdx == editionOutIdx + 1`, `royaltyOutIdx == editionOutIdx + 2`, and `(askPrice * royalty_bips) / 10000 >= MIN_ROYALTY_OUT`.
- `cancel(offererSig)`: allows the offerer to withdraw their offer at any time.
- `expire()`: permissionless refund after `this.ageDaa >= expireAge`, requiring `tx.inputs.length == 2` and paying the full escrow input value to the offerer at `tx.outputs[this.activeInputIndex]`.

## 6. Reliks-VM (`engine_lang = 2`) and render
- `program_hash = H(program)`. `render_hash = H(canonical SVG of the program at serial 1, zero lineage, sales 0)`.
- Reliks-VM programs start with magic bytes `52 56 4d 01` (`RVM\x01`) and use `engine_lang = 2`, specified in `vm/RELIKS-VM-SPEC.md`.

## 7. Minimal Conforming Indexer API Contract
Any covenant indexer can serve Reliks by exposing two JSON endpoints under `<base>`:
1. **Freshness endpoint (`GET <base>-live.json`)**: `{ "tip_at_ms": ..., "tip_daa": ..., "processed_daa": ... }`.
2. **Covenant endpoint (`GET <base>/c/<covenantId>.json`)**: `{ "covenant_id": "...", "genesis_txid": "...", "live_value": 100000000, "utxos": [...], "events": [...] }`.

## 8. Claims & Signed Ownership Challenges (`ReliksOwnerChallengeV1`)
1. **Canonical Claim Digest (`claimHash`)**:
   `claim_Digest = H("ReliksClaimV1" || utf8(network) || 0x00 || hex2bytes(covenantId) || encEditionState(state))`
2. **Challenge Preimage (`challengeDigest`)**:
   `msg_hash = H("ReliksOwnerChallengeV1" || claim_Digest || utf8(challenge))`
3. **Signature**: 64-byte secp256k1 Schnorr signature over `msg_hash` using `state.ownerIdentifier`.
