# Reliks 2: clean-slate design (draft)

Supersedes the incremental "v13" spec. v12 is history: fresh genesis, breaking changes allowed. Nothing here is compiled or tested; items marked **VERIFY** depend on SilverScript or consensus behavior I have not run.

## 1. What changes, and why

| v12 choice | Reliks 2 | Why |
|---|---|---|
| Engine is arbitrary JS run with `new Function` in a Worker, guarded by a regex denylist (`web/site-app.js`) | **Reliks-VM**: small deterministic bytecode, host-built SVG | A denylist is bypassable (indirect global access, endless loops), and JS strings and numbers leave determinism to the host. A VM makes engines safe to run and portable to any language |
| Engine baked in template, capped near 25.6 KB, carried twice in the mint sigscript | VM programs of about 1 to 4 KB, still baked in | Keeps the "art from chain data" claim, cuts mint size roughly 10x |
| Owner is a Schnorr pubkey only | Owner is a **pubkey or a covenant** (co-spend authorization) | Vaults, multisig, DAOs, KCC20-fractionalized ownership |
| One artist, one royalty rate | **Splits** committed by hash (phase 4) | Collaborators and engine authors get paid on-chain |
| Fixed-price mint only | **Mint modes**: fixed, timed decay, allowlist (phase 4) | Real launch mechanics without a platform |
| Static art | **Living editions**: `sales` (wear) and `lineage` (patina) | Art that carries its history |
| Hand-maintained codecs (about 7 places per field change) | Codecs **generated from the ABI**, one shared constants module | Ends drift bugs |
| Zero-price `sell` branch | Dropped; `transfer` covers free handoffs | One less branch in the contract |
| Browser can only mint | Browser buy, sell, offer are first-class | A market people can actually use |

Kept from v12 because it is sound: outpoint-derived serials, parallel mint lanes with `fork`/`close`, exact-equality royalty splits, atomic escrow accept with permissionless `expire`, the verify-everything site.

## 2. Contract set

- **Collection** (replaces SeriesFactory): lane state holds engine hash, artist, price parameters, `mints_left`. `mint` spawns a Relik.
- **Relik** (replaces ReliksEdition): the NFT.
- **Offer**: escrowed offer, with a collection-wide variant (matches `collection_covid`, the seller picks which edition to accept).

## 3. Relik state

| Field | Type | Notes |
|---|---|---|
| owner_kind | byte | 0 = pubkey, 1 = covenant |
| owner | byte[32] | pubkey, or covenant id |
| price | int | 0 = unlisted; native listing keeps buy permissionless |
| artist, royalty_bips | byte[32], int | replaced by `splits_hash` in phase 4 |
| program_hash | byte[32] | Reliks-VM program hash |
| collection_covid | byte[32] | lineage back to the lane |
| serial | int | outpoint-derived, as in v12 |
| lineage | byte[32] | patina input, grindable, cosmetic only |
| sales | int | wear input, grows only on royalty-paying sales |

**Owner as covenant:** for `owner_kind = 1`, authorization is `OpCovInputCount(owner) == 1` in the same transaction (the primitive the v12 escrow already uses). The owner covenant's own script must then constrain the outputs it is willing to co-spend with. That burden sits on vault authors, and it is what fixes the audit's "dead code, no spend linkage" finding.

**Route rules:** `list`, `unlist`, `transfer` copy `lineage` and `sales`. `buy`, `sell` (price > 0) and escrow accept set `lineage' = blake2b("ReliksLineageV2" + lineage + newOwner)` and `sales' = sales + 1`. Mint sets `lineage = blake2b("ReliksGenesisV2" + outpointTxId + outpointIndex)`, `sales = 0`.

**Grinding:** a buyer can pick a pubkey offline to steer `lineage`, and no script can stop that. So patina is quantized by the VM to at most 64 variants, and `sales` (not grindable) carries the main visual change. Say this openly in the docs.

## 4. Reliks-VM (sketch)

- Stack machine, 32-bit integer ops only: add, sub, mul, xor, shifts, mod, compare, jump. Built-in xorshift PRNG seeded from lanes.
- Inputs: base lanes from `blake2b("ReliksSeedV2" || serial)`, patina lanes from lineage, `wear = min(sales, CAP)`.
- Drawing ops emit primitives (path, rect, circle, group, palette index) with integer coordinates. The **host** serializes canonical SVG with specified integer formatting, so no string-building in the VM.
- Deterministic op budget (fuel); exceeding it is a hard failure. Program hash anchors the bytecode.
- Deliverables: spec, reference interpreter in JS, second interpreter in Python or Rust, and conformance vectors so two implementations must agree byte-for-byte.
- Authoring: start with an assembler and a few templates; a JS-subset compiler is optional later.

## 5. Phases

1. **P0, VM:** spec, two interpreters, vectors, port the DAG-City engine as proof.
2. **P1, core contracts (testnet):** Collection + Relik with lineage, sales, covenant owner, generated codecs.
3. **P2, market contracts:** Offer with collection offers; negative tests that edition and escrow compute identical next states.
4. **P3, site:** browser buy, sell, offer; fresh genesis series with a real artist.
5. **P4, launch mechanics:** splits, timed decay, allowlist.

## 6. Open questions (VERIFY)

1. **Time source for timed decay.** I earlier suggested pricing by lane age, but the lane UTXO is re-created on every mint, so `ageDaa` resets each time. Needs a readable clock (transaction lock time or DAA score) in scripts, or a stored start value plus proof.
2. Is `blake2b` over concatenated byte arrays affordable inside policy functions?
3. Allowlist: Merkle proof verification cost inside a script.
4. Splits: cost of committing recipients by hash and revealing them in the sigscript.
5. Does the compiler keep new state fields that some route never reads?
6. Minimum safe carrier value under storage mass; keep 1 KAS until measured.
7. Does pruning make baked engines unrecoverable in practice? Archive engines off-chain as well, as v12 already advises.
