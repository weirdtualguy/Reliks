# Reliks v13 spec (draft): living editions

Status: draft for review. Nothing here is compiled or tested. Items marked **VERIFY** depend on SilverScript behavior I have not run.

## 1. Goal

An edition's art should reflect its history, without breaking what v12 already proves: `render(engine, serial)` is recomputable from chain data and anchored by `program_hash`.

v13 adds two history inputs to the render:

| Input | Where it lives | Grindable? | Role |
|---|---|---|---|
| `sales` | edition state (int) | No: only grows through royalty-paying sales | **Wear**: monotone visible aging |
| `lineage` | edition state (byte[32]) | Yes, see section 4 | **Patina**: small cosmetic variation only |

Base traits and rarity stay a function of `serial` alone, exactly as in v12.

## 2. State layout

Edition state, in order (append-only, so v12 codec logic carries over):

| # | Field | Type | Encoded bytes |
|---|---|---|---|
| 1 | ownerIdentifier | byte[32] | 33 |
| 2 | identifierType | byte | 2 |
| 3 | price | int | 9 |
| 4 | artist | byte[32] | 33 |
| 5 | royalty_bips | int | 9 |
| 6 | program_hash | byte[32] | 33 |
| 7 | factory_covid | byte[32] | 33 |
| 8 | serial | int | 9 |
| 9 | **lineage** | byte[32] | 33 |
| 10 | **sales** | int | 9 |

Span: 161 becomes 203 (using your KCC-1 sizes: 33 for byte[32], 9 for int). Factory span (135) and escrow span (161) are unchanged, but the escrow's `edition_prefix_len`, `edition_suffix_len` and `expected_template_hash` args change, and so does the factory's `edition_template_*`.

## 3. Rules per route

Domain tags: `LINEAGE = "ReliksLineageV13"`, `GENESIS = "ReliksGenesisV13"`.

| Route | Owner change | Lineage | Sales |
|---|---|---|---|
| mint (factory) | to buyer | `blake2b(GENESIS + outpointTxId + outpointIndex)` | 0 |
| list / unlist | no | unchanged | unchanged |
| buy (price > 0) | yes | advance | +1 |
| sell (price > 0) | yes | advance | +1 |
| escrow accept (via edition `buy`) | yes | advance | +1 |
| transfer | yes | unchanged | unchanged |
| spend | terminates | n/a | n/a |

Advance rule: `lineage' = blake2b(LINEAGE + lineage + newOwner)`.

**Change from v12:** drop the zero-price branch of `sell`. Zero-price handoffs use `transfer`. This removes the only route that mixed advancing and non-advancing behavior, and avoids relying on branch-returns in a policy function (**VERIFY** whether SilverScript supports them).

## 4. Threat model: grinding

The buyer chooses `newOwner`, so a buyer can generate pubkeys offline until `lineage'` yields patina they like. Free, and not preventable in-script (no unpredictable on-chain randomness is available to the contract).

Mitigations, in order of strength:
1. Patina is cosmetic and quantized by the engine to at most 64 variants (gate L13). Grinding then only picks among a few looks.
2. Wear (`sales`) is not grindable and carries the main visual story.
3. `transfer` does not advance anything, so free self-transfers cannot reroll.
4. Wash-selling to reroll costs royalty plus fees on every attempt.

State this openly in the docs: patina is buyer-influenceable by design.

## 5. Contract sketches (pseudocode, not compiled)

```
// ReliksEdition-v13 additions
byte[32] lineage = init_lineage;
int sales = init_sales;

function advancedState(byte[32] newOwner): State {
    return State {
        ownerIdentifier: newOwner, identifierType: IDENTIFIER_PUBKEY, price: 0,
        artist: artist, royalty_bips: royalty_bips, program_hash: program_hash,
        factory_covid: factory_covid, serial: serial,
        lineage: blake2b(byte[]("ReliksLineageV13") + lineage + newOwner),
        sales: sales + 1
    };
}
// buyPolicy  -> return advancedState(buyer)
// sellPolicy -> require(salePrice >= MIN_PRICE ...); checkPayments(...); return advancedState(buyer)
// transferPolicy / unlistPolicy -> clearedState(...) with lineage and sales copied unchanged
// listPolicy -> copies lineage and sales unchanged
```

```
// SeriesFactory-v13 mint: edition state gains
lineage: blake2b(byte[]("ReliksGenesisV13") + OpOutpointTxId(this.activeInputIndex)
                 + (OpOutpointIndex(this.activeInputIndex) as byte[4])),
sales: 0
```

```
// OfferEscrow-v6 accept: mirror struct gains lineage, sales; then
EditionState nextEd = EditionState {
    ownerIdentifier: offerer, identifierType: IDENTIFIER_PUBKEY, price: 0,
    artist: prevEd.artist, royalty_bips: prevEd.royalty_bips,
    program_hash: prevEd.program_hash, factory_covid: prevEd.factory_covid,
    serial: prevEd.serial,
    lineage: blake2b(byte[]("ReliksLineageV13") + prevEd.lineage + offerer),
    sales: prevEd.sales + 1
};
```

The escrow co-spends the edition's `buy` route (see `accept-v5.js`), so the edition and the escrow must compute an identical next state or the transaction fails. That equality is the main correctness risk in v13 and needs a dedicated on-chain negative test: escrow next-state differs by one byte, expect rejection.

## 6. Engine and render changes

- Signature: `reliks(L, serial, P, wear)`.
  - `L` = base lanes, unchanged: `blake2b("ReliksSeedV10" || le64(serial mod 2^32))`.
  - `P` = patina lanes: `blake2b("ReliksPatinaV13" || lineage)`, reduced by the engine to at most 64 variants.
  - `wear` = `min(sales, WEAR_CAP)`.
- `render_hash` stays anchored at genesis, computed at `serial = 1`, `lineage = zeros`, `sales = 0`.
- Age is deliberately not in state. If wanted later, feed a display-only value from chain data (mint DAA score); it would not be covenant-anchored. **VERIFY** what DAA info the script can read before considering it. `this.ageDaa` measures time since the current UTXO was created and resets on every transition, so it is not lifetime age.

New `reliks-lens.js` gates:
- **L11** base features identical across 1000 random `lineage` values.
- **L12** `wear` 0..WEAR_CAP produces monotone, distinct outputs.
- **L13** patina yields at most 64 distinct outputs.

## 7. Migration and codec work

1. Generate JS codecs (Node and browser) from the compiled ABI instead of hand-maintained `enc*State` functions.
2. Add a single shared constants module for the two domain tags; check equality across Edition, Escrow and Factory sources in a test.
3. Fresh genesis is required (template hash rotation). v12 mainnet edition stays valid and verifiable as legacy.
4. Testnet-first rollout: factory + edition, then escrow-v6, then site.

## 8. Open questions

1. Does SilverScript allow `blake2b(byte[] + byte[32] + byte[32])` inside a covenant policy function at acceptable script cost? (**VERIFY**)
2. Does the compiler keep the new fields if some route never reads them? Your notes show it drops unreferenced constructor params; state fields should survive, but check.
3. Size impact on the mint sigscript and the 25.6 KB engine cap.
4. Should `sales` also count zero-price `transfer`? Current answer: no, to keep wear tied to royalty-paying sales.
5. Should wear be capped, or is unbounded aging a feature?
