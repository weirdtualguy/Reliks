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
For a mint, (txid, index) is the lane outpoint the mint spends: output 0 of the previous mint transaction, or output 0 of the genesis transaction for the first mint (the factory contract computes both from this outpoint, section 5; also observed on the testnet ledgers).

## 4. Edition transitions
Source: v13/ReliksEdition-v13-draft.sil, transcribed by hand. Compiled with silverc and v13/edition-args-v13.json, that source gives bytecode, template hash and state span identical to data/edition-abi-v13.json and v13/out/v13.json, and those templates rebuilt the live testnet edition scripts (2026-10-03; tools/verify-contract.js). Every route is a one-input, one-output covenant transition authorized by the edition's own input, except spend, which ends the edition. "Owner auth" means a Schnorr signature by the owner key, and it requires identifierType = IDENTIFIER_PUBKEY. "Carrier" means the edition output's value must be at least its input's value. MAX = 922337203685477.

| Route | Arguments | Auth | Checks | Resulting state |
|---|---|---|---|---|
| list | newPrice, ownerSig | owner | carrier; 100000000 <= newPrice <= MAX | price = newPrice, rest copied |
| unlist | ownerSig | owner | carrier | price = 0, rest copied |
| buy | buyer, ownerOutIdx, artistOutIdx | none | 0 < price <= MAX; carrier; payments | owner = buyer, price 0, lineage advanced, sales + 1 |
| sell | buyer, salePrice, ownerOutIdx, artistOutIdx, ownerSig | owner | 100000000 <= salePrice <= MAX; carrier; payments | as buy |
| transfer | newOwner, ownerSig | owner | carrier | owner = newOwner, price 0, lineage advanced, sales unchanged |
| spend | ownerSig | owner | none (no carrier check) | edition ends |

"Advanced" lineage is H("ReliksLineageV2" || previous lineage || new owner). The new owner's identifierType is always IDENTIFIER_PUBKEY, so covenant owners are not supported in this draft.

Payments (buy and sell): roy = floor(salePrice * royalty_bips / 10000). The two output indices must differ. The output at ownerOutIdx pays at least salePrice - roy (which must be non-negative) to the previous owner's P2PK script. The output at artistOutIdx pays exactly roy to the artist's P2PK script. For buy, the sale price is the listed price. Buy needs no owner signature, so any listed edition can be bought by paying these outputs.

Consequences worth stating:
- sales is purchasable, not earned. sell accepts any buyer key and any price from 1 KAS up, so an owner can sell to another key they control. Each such step costs the royalty (nothing if the owner is also the artist) plus the fee, and it increments sales and advances lineage. Anything that treats sales as proof of market history must account for this.
- transfer advances lineage at no royalty. Lineage grinding is bounded only by the 64-value quantization in the VM host rule.

## 5. Mint (factory contract)
Source: v13/SeriesFactory-v13-draft.sil, transcribed by hand; it recompiles to the deployed factory bytecode of both testnet VM series (tools/verify-contract.js). Constants: IDENTIFIER_PUBKEY = 0, MIN_PRICE = 100000000 (1 KAS), MAX_ROYALTY_BIPS = 2000.

Entry mint(buyer: byte[32], buyerScheme: byte, editionOutIdx: int, artistOutIdx: int). No signature is required: anyone can mint to any buyer key by paying. The contract requires:
1. mints_left > 0; buyerScheme = 0; price = 0 or price >= 100000000; 1 <= royalty_bips <= 2000. A series deployed with royalty_bips outside 1..2000 can never mint.
2. blake2b(engine_code) = program_hash, where engine_code is the program baked into the factory script. (A second statement using engine_code, apparently keeping the bytes in the compiled script, is UNREVIEWED.)
3. If price > 0, the output at artistOutIdx pays exactly price to the artist's P2PK script: 100% of the primary sale, no platform fee. If price = 0, artistOutIdx is not constrained.
4. The output at editionOutIdx carries the edition template (checked against expected_template_hash) with state: owner = buyer, identifierType = buyerScheme, price 0, artist, royalty_bips and program_hash from the factory state, factory_covid = covenant id of the lane input, serial and lineage computed from the lane input's outpoint (section 3), sales 0. Its value is at least 100000000.
5. The lane input has exactly one authorized output. It is worth at least the lane input and carries the lane state with mints_left - 1 and every other field unchanged, including engine_lang and render_hash.
UNREVIEWED: how the edition output's covenant id is checked; the internals of validateOutputStateWithTemplate and validateOutputState.

fork and close: both need the artist's signature. fork splits one lane into two: leftMints and rightMints both above 0 and summing to mints_left, the two outputs together worth at least the input, other fields unchanged. close ends the lane.

Reference SDK (web/reliks-chain.js buildMint): output order is lane (0), edition (1), artist (2, only if price > 0), then change; the signature script hardcodes editionOutIdx = 1 and artistOutIdx = 2; edition value 1 KAS; the edition covenant is a KIP-20 genesis authorized by the funding input (index 1). sdk/plan.js planMint checks all of this against the rules above.

## 6. Engine and render
- program_hash = H(program). render_hash = H(canonical SVG of the program at serial 1, zero lineage, sales 0). Both anchors verify on the testnet series.
- The Reliks-VM program is specified in `v13/RELIKS-VM-SPEC.md`. The contract copies engine_lang through every transition without checking it. New VM series use engine_lang 2, and the testnet VM series use 1. Readers must identify the engine from the program bytes first: VM bytecode starts 52 56 4d 01, and the mainnet JS engine starts with the text "function".

## 7. Mainnet today
Mainnet runs v12: 8-field edition, no lineage or sales, JS engine, engine_lang 1. Read-only checks for it: `sdk/verify-v12.js`. It does not verify the rendered art.

## 8. Not specified yet
the factory contract's mint rules; the offer/escrow contract; owner-as-covenant (design only, not implemented); fee and mass limits; splits and mint modes.

## 9. Verification status
Sections 2 and 3 are checked two ways. (a) Two independent implementations (the JS codec and sdk/ref_protocol.py) agree on generated vectors for state encoding, serial, lineage and covenant id. (b) On testnet-10, the serials of all 4 minted editions and the genesis lineage of the one edition with no sales reproduce from the lane outpoint spent by the mint, and the on-chain edition scripts rebuilt from those values were found live (all 4 confirmed, 2026-10-03). The factory contract computes serial and lineage itself from the lane input outpoint (section 5), so a mint cannot produce different values. Section 4 is transcribed by hand from the edition contract source, which recompiles to the deployed bytecode (tools/verify-contract.js); the transcription has not been reviewed by anyone else. Section 5 is transcribed by hand from the factory source, which also recompiles to the deployed factory bytecode; the checks marked UNREVIEWED there remain open.
