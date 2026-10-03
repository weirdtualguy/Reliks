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
2. blake2b(engine_code) = program_hash, where engine_code is the program baked into the factory script. (A separate check, require(blake2b(engine_code || lane input txid) != 32 zero bytes), is always true in practice. Its purpose appears to be keeping the program bytes in the compiled script by making them depend on a runtime value; this is inferred, not stated in the source.)
3. If price > 0, the output at artistOutIdx pays exactly price to the artist's P2PK script: 100% of the primary sale, no platform fee. If price = 0, artistOutIdx is not constrained.
4. The output at editionOutIdx carries the edition template (checked against expected_template_hash) with state: owner = buyer, identifierType = buyerScheme, price 0, artist, royalty_bips and program_hash from the factory state, factory_covid = covenant id of the lane input, serial and lineage computed from the lane input's outpoint (section 3), sales 0. Its value is at least 100000000.
5. The lane input has exactly one authorized output. It is worth at least the lane input and carries the lane state with mints_left - 1 and every other field unchanged, including engine_lang and render_hash.
UNREVIEWED: how the edition output's covenant id is checked; the internals of validateOutputStateWithTemplate and validateOutputState.

fork and close: both need the artist's signature. fork splits one lane into two: leftMints and rightMints both above 0 and summing to mints_left, the two outputs together worth at least the input, other fields unchanged. close ends the lane.

Reference SDK (web/reliks-chain.js buildMint): output order is lane (0), edition (1), artist (2, only if price > 0), then change; the signature script hardcodes editionOutIdx = 1 and artistOutIdx = 2; edition value 1 KAS; the edition covenant is a KIP-20 genesis authorized by the funding input (index 1). sdk/plan.js planMint checks all of this against the rules above.

## 5b. Offer escrow (v6)
Source: v13/OfferEscrow-v6-draft.sil, transcribed by hand; it recompiles to v13/out/escrow-v6.json (tools/verify-contract.js). Constants as in the edition: IDENTIFIER_PUBKEY = 0, MIN_PRICE = 100000000, MAX_PRICE = 922337203685477.

State (8 fields, 161 bytes encoded): ownerIdentifier(32), identifierType(1), edition_covid(32), askPrice(8), expireAge(8), artist(32), royalty_bips(8), offerer(32). The escrow script is the bytecode of v13/out/escrow-v6.json with the 161-byte state inserted at the state span (prefix = bytecode before the span, suffix = after), encoded as in section 1. The edition template's prefix length, suffix length and expected hash are constructor arguments baked into the escrow script, not stored in state (per v13/make-v13-escrow.js, which derives them from the edition ABI), so an escrow only works with the edition template it was built for. An escrow is created by paying to its script; the source has no creation rule. It holds at least askPrice (a fee buffer on top is customary, not required).

accept(ownerSig, editionOutIdx, paymentOutIdx, royaltyOutIdx):
- The owner signs (pubkey owners only); MIN_PRICE <= askPrice <= MAX_PRICE; the escrow input is worth at least askPrice.
- The three output indices differ pairwise. With roy = floor(askPrice * royalty_bips / 10000), output paymentOutIdx pays exactly askPrice - roy to the owner's P2PK script and output royaltyOutIdx pays exactly roy to the artist's P2PK script.
- Exactly one input carries the covenant edition_covid. Its state, read with the edition template, must have owner = the escrow's ownerIdentifier, price = askPrice, and the same royalty_bips and artist as the escrow.
- The output at editionOutIdx is worth at least that input and carries the sold state with the offerer as buyer: owner = offerer, identifierType 0, price 0, lineage advanced with the offerer, sales + 1, everything else copied.
- The escrow ends: no authorized outputs.
The edition input is spent in the same transaction through an edition route; per the source comment its buy route enforces the same split. The escrow does not check which route is used (UNREVIEWED), nor the internals of readInputStateWithTemplate and validateOutputStateWithInputTemplate.

expire(): once the escrow's age in DAA score reaches expireAge, anyone may spend it. Output 0 must pay exactly the input's full value to the offerer's P2PK script, with no authorized outputs. Because the refund equals the whole input, the fee must come from another input the caller adds (inferred).

Consequences:
- An offer is bound to one edition covenant, its current owner and a listing at exactly askPrice. If the owner changes, relists at another price or unlists, accept fails and the funds stay locked until expireAge.
- There is no cancel route: accept and expire are the only exits.
- Accepting requires the edition to be listed at askPrice, and the listing is public, so a third party can buy it first through the edition's buy route; the offer is then stranded until it expires.
- accept raises sales like a sale, and the offerer can be any key: it is another route to the purchasable-sales property of section 4.
- The protocol takes no marketplace fee; the source says marketplaces fork the escrow.

## 6. Engine and render
- program_hash = H(program). render_hash = H(canonical SVG of the program at serial 1, zero lineage, sales 0). Both anchors verify on the testnet series. Readers should find the program bytes inside the lane script and hash them, not trust program_hash alone (inferred: the factory only keeps the bytes in the script through the engineBaked check, and a different compiler version might not).
- The Reliks-VM program is specified in `v13/RELIKS-VM-SPEC.md`. The contract copies engine_lang through every transition without checking it. New VM series use engine_lang 2, and the testnet VM series use 1. Readers must identify the engine from the program bytes first: VM bytecode starts 52 56 4d 01, and the mainnet JS engine starts with the text "function".

## 7. Mainnet today
Mainnet runs v12: 8-field edition, no lineage or sales, JS engine, engine_lang 1. Read-only checks for it: `sdk/verify-v12.js`. It does not verify the rendered art.

## 8. Not specified yet
Owner-as-covenant and collection-wide offers (design only, not implemented); fee and mass limits; splits and mint modes.

## 9. Verification status
Sections 2 and 3 are checked two ways. (a) Two independent implementations (the JS codec and sdk/ref_protocol.py) agree on generated vectors for state encoding, serial, lineage and covenant id. (b) On testnet-10, the serials of all 4 minted editions and the genesis lineage of the one edition with no sales reproduce from the lane outpoint spent by the mint, and the on-chain edition scripts rebuilt from those values were found live (all 4 confirmed, 2026-10-03). The factory contract computes serial and lineage itself from the lane input outpoint (section 5), so a mint cannot produce different values. Section 4 is transcribed by hand from the edition contract source, which recompiles to the deployed bytecode (tools/verify-contract.js); the transcription has not been reviewed by anyone else. Section 5 is transcribed by hand from the factory source, which also recompiles to the deployed factory bytecode; the checks marked UNREVIEWED there remain open. Section 5b is transcribed by hand from the escrow source, which recompiles to v13/out/escrow-v6.json (tools/verify-contract.js); no live escrow output was checked. The escrow state encoding is checked by two independent implementations (sdk/ref_protocol.py and sdk/escrow.js), and sdk/test-escrow.js rebuilds the script of each escrow ledger that carries a state and compares it to the recorded script (it prints which ledgers it covered). What the ledger field consumed means is assumed, not checked.

## 10. Reading model (what a client can and cannot learn from public data)
Observed on testnet-10 on 2026-10-03 with kascov, the public REST API and two public wRPC nodes.
- History: kascov exposes the full revealed script of every spent edition output. Decoding it with section 2 gives the exact state at each step; for testnet VM edition 1 the three spent outputs decode, serial and program_hash stay constant, and the lineage chain follows section 3.
- Live state: a live edition output shows only its script hash. Kascov has no revealed script for it, its holders list is empty, and its state_fields label is unreliable (for the edition checked it matched neither the decoded owner nor the decoded program_hash). No indexer checked reports the current owner of an edition.
- Replay of the last spend is not a general method. The REST API returned no record for two covenant-era transactions. The public nodes served getBlock with transactions for a fresh block and a block 24.4 hours old, and not for one 65.3 hours old ("cannot find header"), so retention ends somewhere between those. In the one block examined, the transition's transaction was not in its accepting block (inferred: it was included in a merge-set block). Whether the signature script exposes the route and arguments was not checked.
- Therefore a client obtains a claimed state (owner, price, lineage, sales and the rest of section 2) from any source: a registry, the owner, an indexer that captured the transition when it was available. It accepts the claim only if the rebuilt script (edition template with that state, section 2) equals the script of a live output of the edition's covenant, found through an index with a fresh tip. This is what sdk/read.js verifyEditionScript and verifyEditionOnChain do. The check proves the claimed state is the current committed state. It cannot find the state when nobody supplies one.
- A UI that needs current ownership must therefore publish or consume a state record, or run its own indexer that stores each transition's state while the chain data is still available.
