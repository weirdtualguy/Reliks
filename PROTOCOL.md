# Reliks protocol (v13, draft)

Status: draft. Describes the v13 contracts as run on testnet-10; mainnet runs v12 (section 7). Reference code: `web/reliks-chain.js`. Independent check: `sdk/ref_protocol.py` generates `sdk/protocol-vectors.json`, and `sdk/test-protocol.js` verifies the JS codec against it (`sh tools/check.sh`). Items marked UNREVIEWED were not checked against the contract source. Where this text and the contract disagree, the contract wins and this text is a bug.

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

## 4. Edition transitions
The draft contract defines three state constructors (policy bodies UNREVIEWED):
- sold (buy and sell): owner changes, price becomes 0, lineage advances, sales + 1.
- moved (transfer): owner changes, price becomes 0, lineage advances, sales unchanged.
- cleared: owner changes, price becomes 0, lineage and sales unchanged.
List and unlist copy lineage and sales. Which route uses which constructor is UNREVIEWED here.

Sale payments: roy = floor(salePrice * royalty_bips / 10000). The owner output pays at least salePrice - roy to the owner's P2PK script. The artist output pays exactly roy to the artist's P2PK script. The two output indices differ. Only pubkey owners (identifierType = IDENTIFIER_PUBKEY, 0 in the reference SDK) can authorize. Listing price: at least 100000000 sompi (1 KAS) and at most 922337203685477. The edition output value must be at least its input value.

## 5. Mint (as built by the reference SDK; contract enforcement UNREVIEWED)
- Output 0: lane, same value and covenant id, authorized by input 0, mints_left - 1. Output 1: edition, 100000000 sompi, authorized by input 1, covenant id = covenant id (genesis) over the funding outpoint with the single bound output (index 1, that value, the edition script). Then the artist payout (series price, only if price > 0), then change (folded into the fee below 1000000 sompi).
- Series price is 0 or at least 100000000 sompi. Minting stops when mints_left is 0.
- Initial edition state: owner = buyer pubkey, identifierType 0, price 0, artist/royalty_bips/program_hash from the series, factory_covid = lane covenant id, serial and lineage from the lane outpoint being spent (section 3), sales 0.

## 6. Engine and render
- program_hash = H(program). render_hash = H(canonical SVG of the program at serial 1, zero lineage, sales 0). Both anchors verify on the testnet series.
- The Reliks-VM program is specified in `v13/RELIKS-VM-SPEC.md`. The contract copies engine_lang through every transition without checking it. New VM series use engine_lang 2, and the testnet VM series use 1. Readers must identify the engine from the program bytes first: VM bytecode starts 52 56 4d 01, and the mainnet JS engine starts with the text "function".

## 7. Mainnet today
Mainnet runs v12: 8-field edition, no lineage or sales, JS engine, engine_lang 1. Read-only checks for it: `sdk/verify-v12.js`. It does not verify the rendered art.

## 8. Not specified yet
Exact rules of list, unlist, buy, sell, transfer and spend (UNREVIEWED); the factory contract's mint rules; the offer/escrow contract; owner-as-covenant (design only, not implemented); fee and mass limits; splits and mint modes.

## 9. Verification status
Section 3 (serial, lineage, covenant id) and section 2 (state encoding) are checked by two independent implementations against generated vectors. They are NOT yet checked against live chain data: the ledgers' mintTxId/mintIndex do not reproduce the recorded serials, probably because the derivation uses the lane outpoint spent by the mint (pending test). Sections 4 and 5 describe the reference SDK and the draft contract and are UNREVIEWED against the compiled contract.
