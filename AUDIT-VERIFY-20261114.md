# Reliks audit verification — 2026-11-14

Repo cloned: https://github.com/weirdtualguy/Reliks @ `8a0ed3f` (main).
Scope checked: `sil/ReliksEdition-v12.sil`, `sil/OfferEscrow-v5.sil`,
`sil/SeriesFactory-v12.sil` AND the v13 drafts
(`v13/ReliksEdition-v13-draft.sil`, `v13/OfferEscrow-v6-draft.sil`,
`v13/SeriesFactory-v13-draft.sil`) — the audit says v13/v6 reusing the
patterns has the same bugs. It does, for every finding below except where noted.

## What sillyscript actually ran

- `silverc` (~/bin/silverc) compiled all four edition/escrow contracts.
  `tools/verify-contract.js`: **CONTRACT RECOMPILE OK** — v12 edition,
  escrow and factory recompiled byte-identical to the committed ABIs
  (`data/*-abi-v12.json`). Template hashes (recompiled):
  edition v12 `0514190ac75aa6d0c63ba393c77df9ca186c64be048d52e0d9170966d6a75859`,
  escrow v5 `31ded2ceb6332e2bb71715cb fc70c85d793c1600c444ce7f1529e71a2a25d8ab`,
  edition v13 `dc dcd59b5069faf56b10712e66908fd10bc2a6b8b37acd ea944cdcf1e4f146f610`,
  escrow v6 `4c4f24bb5066f105958f63c88c3aea4af883dcf6dc5c22317aa287daf2fa5140c0`.
  Edition state span 161 (v12) → 203 (v13); escrow span 161 both.
- sillyscript has **no local covenant VM evaluator**: it compiles via
  silverc, builds txs, and broadcasts via wRPC. So "testnet confirm" means
  broadcasting a deliberately-invalid tx and watching the node accept or
  reject it. **That step is now DONE on testnet-10** (see § Testnet confirm
  below) using a key the owner supplied transiently for this run. The key
  was passed via process env only — it appears in NO file (verified by
  grep) and is NOT recorded here or in memory. A second throwaway key was
  generated in-memory for the offerer role; its value is likewise nowhere
  on disk. Test series: A = price 2 KAS, royalty 5% (500 bips), 4 mints;
  B = price 1 KAS, royalty 1% (100 bips), 2 mints. Workdir
  `audit-test/` (ledgers, builders, per-test scripts); clone's `node_modules/ws`
  was restored afterwards.
- Testnet plumbing notes (matters for reproducing): the two hardcoded wRPC
  endpoints are unreachable from this sandbox through the `ws` package
  (TLS handshake fails — the sandbox egress proxy intercepts it), but
  Node's global WebSocket reaches them through the proxy, so the runs used
  a `ws`-compatible shim (`audit-test/node_modules/ws/`) via NODE_PATH.
  The REST endpoint (`api-tn10.kaspa.org`) silently drops `computeBudget`
  (every submit fails `used=100000, limit=9999` — one Schnorr check costs
  100,000 script units; Toccata pricing: 1 budget = 10,000 units + 9,999
  free allowance, so a wallet input needs budget ≥ 10; the repo's builders
  use 10/11 and 100 for covenant inputs). REST is usable for reads only
  here; all submits went via wRPC.
- sillyscript `storageMass()` (kaspa-tx.js, TN10 pin: C=1e12, limit 500,000)
  was run on realistic buy/accept shapes for M1 (numbers below).

## Verdicts

### C1 — Escrow decoy edition output: CONFIRMED in source AND on-chain (tx `811ddc51…`)
- `OfferEscrow-v5.sil` and `-v6-draft.sil` contain **zero** calls to
  `OpAuthOutputIdx` (grep count 0 in both; edition has 1, factory 3).
  `accept` never binds `editionOutIdx` to the edition input's authorized
  output. The auditor's fix is absent in both versions.
- The honest builder (`cli/accept-v5.js`) shows the mechanism: the edition
  input is spent via its `buy` route with builder-chosen args
  (`buyer`, `ownerOutIdx=1`, `artistOutIdx=2`), and the escrow checks only
  script+state at `editionOutIdx`. Nothing in either script pins
  `editionOutIdx` to `OpAuthOutputIdx(editionInIdx, 0)`.
- **On-chain proof (testnet-10, tx `811ddc51…`, mined block `57da682e…`):**
  the decoy accept was ACCEPTED. The edition input ran `buy` with
  buyer = owner, the authorized output went back to the owner, the escrow
  was shown an unbound decoy with the offerer as owner — and paid out in
  full. This disproves the only escape hatch: neither
  `validateOutputStateWithInputTemplate` nor the `to=1` lowering binds the
  output to the input's authorized output. Details in § Testnet confirm.
- Fix as the auditor wrote it; needs a fresh genesis (template hash changes).

### H1 — One payment output satisfies several covenant inputs: CONFIRMED on-chain (tx `dec3d61c…`)
- `checkPayments` (both editions, v12+v13) checks payment outputs by
  value+script only, at caller-supplied indices, with no binding to the
  calling input's authorized output. Two editions, same artist/price/royalty,
  can point at the same `ownerOutIdx`/`artistOutIdx` pair in one tx; each
  input's script is satisfied by the same outputs. Buyer sweeps two
  editions, pays once. Same hole in `SeriesFactory.mint` across two lanes
  (artist output checked by value+script only; `editionOutIdx`/`artistOutIdx`
  are free args) and in escrow `accept` on the royalty output.
- The repo's own AUDIT-SUMMARY "distinctness guards" (`ownerOutIdx !=
  artistOutIdx`) only stop aliasing *within* one input, not sharing
  *across* inputs. No defense exists in source.
- Fix as the auditor wrote it (derive payment indices from
  `OpAuthOutputIdx`; factory: `artistOutIdx == editionOutIdx + 1`).
  Fresh genesis required.

### M1 — Royalty outputs can be unmineable: CONFIRMED on-chain (node: mass 1,050,082 > 500,000)
- No royalty floor exists anywhere: `list` floors only the price
  (1 KAS); `buy`/`accept` never check `roy` at all. Factory forces
  `royalty_bips >= 1`, so a 1 KAS sale at 1% makes a 1,000,000-sompi
  royalty output.
- Measured with sillyscript `storageMass()` (limit 500,000, the cap the
  repo's own history uses — escrow v4 was "524202 vs 500000"):
  buy 1 KAS @1% → mass **1,036,769**. The node measured **1,050,082**
  for the real tx and rejected it (`mass of 1050082 is larger than max
  allowed size of 500000`), so the operative cap IS 500,000, not the
  auditor's 100k. Buy 1 KAS @5% → mass 237,194 — passes under 500k, so
  the auditor's headline example (5% @ 1 KAS "can never be mined") does
  NOT fail under the real cap; the failure starts at lower royalties
  (≈1–2% at 1 KAS).
- The auditor's suggested `MIN_ROYALTY_OUT` of 25,000,000 sompi is
  incompatible with the current constants as written: at MIN_PRICE 1 KAS
  it needs 25% royalty, but MAX_ROYALTY_BIPS is 2000 (20%). Applied
  literally it would ban all 1 KAS sales. A correct fix scales with the
  limit (e.g. ~2–3M sompi floor under 500k, ~25M under 100k) or raises
  the price floor for low-royalty series.

### M2 — Serial is grindable: CONFIRMED (impact is real in v13)
- `serialFromOutpoint` (identical in v12 and v13 factories) hashes only
  the lane outpoint (txid + index), which the minter/artist controls via
  the lane-creating tx. Chaining mints to land a chosen serial is possible.
  In v12 the art did not depend on serial; in v13 it does (RVM renders
  from serial), so this is now a live property, not a hypothetical.

### M3 — Accepting after expiry: CONFIRMED on-chain (corrected test, tx `4991bb31…`)
- `accept` has no `ageDaa` check in either version; only `expire()`
  references `ageDaa`. An "expired" offer stays fillable until someone
  refunds it.
- **Correction (2026-11-14): the first on-chain "confirmation" was invalid.**
  It used `expireAge` = 623,300,000, treating it as an absolute DAA score.
  But `ageDaa` is RELATIVE — time since the escrow UTXO was created — and
  `expireAge` is a DURATION in DAA-score units (the builder's default is
  100000, ~28h). That offer was seconds old, not expired; the accept
  succeeding proved nothing. The corrected test used `expireAge` = 10:
  offer created at DAA 623,417,997, accepted at DAA 623,418,626 (age ~629
  scores, 60x past expiry) — the honest accept SUCCEEDED, tx
  `4991bb31f343804e9b6f84dd8087cb0570d597711ff4e1478c0f2ea3888f5fe5`.
  M3 is real, now properly proven.
- **The suggested one-line fix does NOT compile in silverc 0.1.0** (see
  § Claude v13 audit — fixes, below). `require(this.ageDaa < expireAge)`
  is rejected: `<`/`<=`/`>` do not apply to `temporal` — only the
  `require(this.ageDaa >= int)` lock form exists — and `this.ageDaa` is
  only parseable immediately after `require(`. Negation, assignment,
  `if (...)`, `== false`, and flipped `expireAge > this.ageDaa` forms were
  all rejected; `tx.daa` has the same `>=`-only restriction. An upper
  bound on age is inexpressible in this compiler version, so M3 remains
  OPEN in the fixed contracts too, pending a silverc change or a protocol
  redesign.

### M4 — Counterfeit editions: CONFIRMED, unfixable in-script (as stated)
- `factory_covid` is constructor-declared state; anyone can genesis an
  edition-template UTXO claiming any factory. Genuine mints do bind it
  (`mint` sets `factory_covid = OpInputCovenantId(lane input)`), but a
  fresh genesis with a spoofed covid is unconstrained. Indexers/renderers
  must verify the genesis tx spent a real factory lane.

### Low / info — all confirmed in source
- `fork` has no per-lane value floor (only sum conservation); a near-zero
  lane is possible and, as a 4x-weighted covenant output, also a mass risk.
- Royalties are opt-in: `transfer` pays none in v12 and v13.
  **Correction:** `sell(0)` bypass is gone in v13 — v13 `sell` requires
  `salePrice >= MIN_PRICE`; only `transfer` bypasses there.
- Escrow fee-buffer surplus is unconstrained (owner signs the tx and can
  add a change output to themselves); `accept` only constrains the three
  named outputs.
- No early cancel for the offerer; `expireAge` has no upper bound.
- Factory has no genesis-time constructor validation. Note the nuance:
  `mint()` does re-check royalty range, `mints_left`, and
  `program_hash == blake2b(engine_code)` on every mint, so a bad royalty
  or zero mints bricks minting rather than minting wrong — but an invalid
  artist key is never checked anywhere.
- `engineBaked()` + F-12 comment present in both factories; keep it.

### "Checked and fine" — re-verified, all hold
- `EditionState` field order identical across edition/factory/escrow in
  v12 (8 fields) and v13 (10 fields, same order).
- Serial arithmetic stays under 2^63 (`(h[7] % 128) * 2^56` caps the top byte).
- `MAX_PRICE × bips` guard holds (922337203685477 × 2000 < 2^63).
- Lane/carrier conservation holds (mint lane + edition floors, `carrierConserved`).
- Owner/artist scripts derive from state, never caller input.
- `expire` refund has no theft route (output 0 = full input value to offerer, 0 auth outputs).

## Testnet confirm (DONE 2026-11-14, testnet-10) — all four exploit tests ran

Series A (2 KAS, 5%): genesis `cf4ef2c30861a35b2a1f43bcf0ea8fae7f2e3e11b29128cc8728eda24f0a0593`,
lane `b051cd34…`; editions minted `e738decc…` (serial 1048318966456692363) and
`0d87e334…` (serial 9188632345264023688), both listed at 2 KAS.
Series B (1 KAS, 1%): genesis `ee284876…`, edition `9036f748…`, listed at 1 KAS.
Owner/artist key = owner's supplied testnet key; offerer = throwaway key2.
All roles were the owner's own test keys; no victim, no mainnet, no real value.

- **H1 CONFIRMED ON-CHAIN** — double-buy tx
  `dec3d61cbcdf75996c16caf482458cf279e0759c7bc6fd18c9eec45795f1d1c7`
  (mined, block `24df539e…`): ONE payment pair (ownerNet 190,000,000 +
  royalty 10,000,000) bought TWO editions. Verified independently via
  kascov: both edition covenants show live UTXOs at `:0` and `:1` of that
  tx, 1 KAS each. Builder: `audit-test/h1-double-buy.js`.
- **C1 CONFIRMED ON-CHAIN** — decoy-accept tx
  `811ddc5170c45b46d2a9f2c2cc215d6347045bf647bb4eb36a994edf3526729e`
  (mined, block `57da682e…`): the edition input ran `buy` with buyer =
  owner, so the AUTHORIZED output (index 0) went back to the owner, while
  the escrow was shown an UNBOUND decoy at index 1 (edition script,
  offerer as owner). The owner kept the NFT **and** collected 190,000,000
  + the 10,000,000 royalty went to the artist (same key here). The
  escrow paid out in full. Outputs verified via REST: 1 KAS / 1 KAS /
  1.9 KAS / 0.1 KAS / change. This settles the open question: neither
  `validateOutputStateWithInputTemplate` nor the `to=1` lowering binds the
  edition output to the input's authorized output. Builder:
  `audit-test/c1-decoy-accept.js`. Whether the decoy UTXO is spendable
  (live duplicate) or dead (no covenant id was ever assigned) was NOT
  tested — structurally it has no covenant id, so it should be dead, but
  the theft itself does not depend on that.
- **M3 — CORRECTED TEST, CONFIRMED ON-CHAIN** — the first M3 test was
  invalid (see § M3 correction): it treated `expireAge` as an absolute
  DAA score, but `ageDaa` is relative and `expireAge` a duration. The
  corrected test: offer with `expireAge` = 10, created at DAA 623,417,997,
  accepted at DAA 623,418,626 (age ~629 scores) — honest accept SUCCEEDED,
  tx `4991bb31f343804e9b6f84dd8087cb0570d597711ff4e1478c0f2ea3888f5fe5`.
  The earlier `d6c9fc06…` accept proved nothing about expiry and must not
  be cited as M3 evidence.
- **M1 CONFIRMED ON-CHAIN** — honest 1 KAS @ 1% buy REJECTED by the node:
  `transaction storage mass of 1050082 is larger than max allowed size of
  500000`. This also settles the limit question: the operative cap is
  500,000 (not the auditor's 100k). sillyscript's model predicted
  1,036,769 for this shape — the node measured 1,050,082 (within ~1.3%;
  difference is the funding-UTXO shape). The auditor's headline example
  (5% @ 1 KAS, model mass 237,194) does NOT fail under the real 500k cap;
  the failure starts at lower royalties (≈1–2% at 1 KAS). M1 is real, but
  the threshold is lower than the audit claimed, and the suggested 25M
  sompi floor remains incompatible with MIN_PRICE 1 KAS + max 2000 bips.

## Claude v13 audit — verification, fixes, and testnet re-test (2026-11-14)

The owner supplied a second (Claude) audit of the v13 files plus the three
`.sil` files themselves (`~/workspace/user/files/`, labeled FINAL). Findings:

- **Provenance:** the uploaded FINAL files are code-identical to the repo
  v13 drafts — the ONLY differences are the headers (FINAL/v13 labels in
  place of DRAFT/UNCOMPILED/v12). The "FINAL" label was applied with no
  code change and no compile. That is exactly N3's point.
- **Claude's audit is accurate on every checkable point.** Line numbers
  verified against the uploads: Edition `checkPayments` l.44–56 ✓, escrow
  payment/royalty requires l.69–79 ✓, escrow accept l.55–115 with no
  `OpAuthOutputIdx` anywhere ✓, factory artist checks l.76–77 ✓.
  N1 (lineage grindable — `blake2b(domain + lineage + newOwner)`, acquirer
  chooses `newOwner` in transfer/buy/sell/accept) ✓ by inspection; N2
  (wash `sell` to an alt key costs royalty + fee, fee only when owner is
  also artist) ✓ by inspection; N3 (header "Not verified with silverc"
  + v12 notes on a FINAL file) ✓. "Checked and fine" items re-verified:
  `EditionState` field order matches across all three ✓, escrow `nextEd`
  matches Edition `soldState` (same domain, `sales + 1`) ✓, `sell` has no
  zero-price path in v13 ✓, state span 161→203 ✓ (compiled: offset 1,
  len 203).
- **One correction to Claude's M1:** "roughly 0.1 KAS (by my KIP-9
  reading)" is wrong under the measured 500k cap — a 0.1 KAS royalty
  (10M sompi, out-term 100k) is fine at 500k. The failure threshold at
  1 KAS is ~2.2M sompi (measured: 1M fails at mass 1,050,082; 5M passes
  at 237,194). The 25M floor is ~10x over-conservative for mineability
  alone — but see the consequence below.

### Fixes applied (workdir `audit-test/v13-fixed/`, NOT pushed, NOT deployed to mainnet)
- **C1** (escrow): `require(OpAuthOutputCount(editionInIdx) == 1); require(editionOutIdx == OpAuthOutputIdx(editionInIdx, 0));` — placed right after `editionInIdx` is computed.
- **H1** (edition `checkPayments`): `int base = OpAuthOutputIdx(this.activeInputIndex, 0); require(ownerOutIdx == base + 1 && artistOutIdx == base + 2);` (escrow): `require(paymentOutIdx == editionOutIdx + 1 && royaltyOutIdx == editionOutIdx + 2);` (factory `mint`): `require(artistOutIdx == editionOutIdx + 1);` Builders already emit `[edition, ownerPay, royalty]` contiguously, so no builder changes were needed for the happy path.
- **M1**: `MIN_ROYALTY_OUT = 25000000` in Edition and Escrow; `require((price * royalty_bips) / 10000 >= MIN_ROYALTY_OUT)` in `list`, `sell`, escrow `accept`. (`buy` is covered transitively via `list`; accept's require is unreachable through honest flows given `list`'s identical require — defense in depth only.)
- **M3: NOT FIXED — the one-liner does not compile** (see M3 section above for the full evidence). The fixed escrow carries a comment documenting this instead of a broken require.
- Headers updated: the "Not verified with silverc" line now records the verified compile + template hash. Recompiled after the header edits — all three template hashes UNCHANGED (comments don't affect bytecode).
- N1/N2: no code change (design guidance — lineage for bounded cosmetic variation only; cap the wear effect; the M1 floor raises the wash cost). Lows (fork lane floor, genesis constructor validation, M4) still open, no fix specified.

### Compiled template hashes (fixed contracts)
- Edition v13-fixed: `26d35f48740b78a7cc709e024055b4ce30fe509314ccb8c32d9e25f87ebbfa5b` (was `dcdcd59b…`, bytecode 2529 → 2601 B, state span 203 unchanged)
- Escrow v6-fixed: `64d2a8bf2e4a9f9e230ca1a450f358671e0322798fd36455179b1e6ff050e115` (was `4c4f24bb…`, 1346 → 1390 B, state span 161 unchanged)
- Factory v13-fixed: `08ebe01373d1da637751d428b1dad40c407051569206f4b302d6531b35c53aa3` (state span 135)
- **N3 closed for the fixed build:** the edition template hash equals the `expected_template_hash` baked into BOTH the factory args and the escrow args (verified by direct comparison).

### Testnet re-test of the FIXED contracts (testnet-10, 2026-11-14)
Fresh fixed series: genesis `9b60bad09089cb3892bf450ce31d3c73fb0d252bd88971322f43e4d327d93650`, price 2 KAS, royalty 2000 (20% → roy 40M ≥ 25M floor), 4 mints. Two editions minted (`6f46959e…`, `11179992…`), both listed at 2 KAS.
- **C1 fix HOLDS:** isolated decoy accept (edition buy satisfied, both payment pairs satisfied, ONLY the binding violated) REJECTED — `failed to verify the signature script`. The decoy tx would have mined on the unfixed contracts.
- **H1 fix HOLDS:** balanced double-buy with one shared payment pair REJECTED — `failed to verify the signature script`. (First attempt was rejected for an unrelated balance error in MY test script — change miscalculated; fixed and re-ran.)
- **M1 fix HOLDS:** `list` at 1 KAS (roy 20M < 25M) REJECTED; `sell` at 1 KAS REJECTED; control `list` at 2 KAS (roy 40M ≥ 25M) SUCCEEDED, tx `deb0db30…`.
- **Happy path intact:** honest buy SUCCEEDED, tx `a6fb0e43…` (ownerNet 160M, royalty 40M); honest accept SUCCEEDED, tx `941b31a1…` (ownerNet 160M, royalty 40M, edition → offerer).
- **M3 still open in the fixed contracts** (no expressible fix — see above). The corrected v12 retest (tx `4991bb31…`) is the evidence.
- **The 25M floor's real cost:** at MIN_PRICE 1 KAS the maximum royalty is 20M (2000 bips), so NO 1 KAS listing can pass the floor as written. Minimum listable price becomes 1.25 KAS at 20% royalty, 2.5 KAS at 10%, 5 KAS at 5%, 25 KAS at 1%. If the 1 KAS floor is meant to stay usable, the measured floor is ~2.5–5M sompi (5M gives ~2x mass margin at 1 KAS). The constant is one line; the choice is the owner's.
- Test infra notes: the wRPC shim only wins while the real `ws` package is moved aside (`node_modules/ws` → `/tmp/ws-real-pkg`); restoring it silently breaks wRPC from `lib/` — the shim was moved aside and restored around this run. Two key2 funding top-ups of 5 TKAS each were needed (offer + buy flows); left-over test escrows from key1 (offer `ef5b9c7b…`, offer `c0953a29…`) hold 2.1 TKAS each and can only be refunded via `expire()` after ~100k DAA (~28h) — testnet dust, owner's own keys.

## What remains open (not testnet-blocked anymore)
- **M3 is the one unfixed hole in the fixed contracts** — no expressible
  fix in silverc 0.1.0. Needs either a compiler change (a `<` form for
  temporal/DAA, or `!` on the age-guard) or a protocol redesign. Until
  then, expired offers stay fillable on v13/v6 exactly as on v12/v5.
- **The 25M royalty floor needs the owner's call** — as written it bans
  all 1 KAS listings (see above). Either keep 25M and accept the higher
  minimum prices, or lower it to a measured ~5M sompi.
- M2 (grindable serial) and M4 (counterfeit editions) are structural — no
  on-chain test changes them; M2's impact is real in v13 where art depends
  on serial, M4 needs indexer-side genesis verification.
- Whether the C1 decoy UTXO is spendable (live duplicate) or dead (no
  covenant id was ever assigned): structurally it should be dead, but no
  spend attempt was run.
- The fixes live only in `audit-test/v13-fixed/` — nothing was pushed to
  GitHub and no mainnet deployment exists. Shipping them means: pick the
  MIN_ROYALTY_OUT constant, resolve M3, fresh genesis, re-run the full
  test suite against the shipped build.

---

## Phase 3 — Claude's final decisions (2026-11-14, evening): floor, cancel, counter serials, lows

All four of Claude's decisions were implemented in `audit-test/v13-fixed/`
and verified on testnet-10. Nothing below was pushed to GitHub; no mainnet
genesis was done (gated on the user's mainnet key + funds).

### 3.1 Mainnet mass cap → floor = 5,000,000 sompi (25M superseded)

- Direct node probe was inconclusive: three fake-input probe txs (masses
  ~210k via a 5M output, ~465k via 2.2M, ~635k via 1.6M) submitted to
  `https://api.kaspa.org/transactions` were all rejected as **orphans** —
  the input-existence check precedes the mass check, so the probe cannot
  reach the mass limit that way. Probe kept at
  `audit-test/mainnet-cap-probe.js` (fixed to REST shape: `amount` +
  `scriptPublicKey:{scriptPublicKey, version:0}`).
- Source evidence was decisive (Kaspalytics network-parameters page, read
  directly — values from rusty-kaspa consensus config + KIPs, updated
  2026-08-14): "Max transaction mass — the block limits above; a
  transaction only has to fit in a block"; "Before Toccata the mempool
  rejected any transaction above 100,000 grams… That cap was relaxed
  shortly before activation and no longer applies"; 100,000 survives only
  as the SDKs' client-side `MAXIMUM_STANDARD_TRANSACTION_MASS` ("a
  wallet-side policy, not a network rule"); max block mass 500,000
  compute+storage; Toccata activated mainnet **June 30, 2026 at DAA
  474,165,565**. STP-KAS master file corroborates: wallet constant is now
  500_000, was 100_000. TN10 node live-enforces 500k (M1 rejection at
  1,050,082 in phase 1).
- Decision: **`MIN_ROYALTY_OUT = 5_000_000`**. Factory minimum royalty
  raised to 5% (`royalty_bips >= 500` in `mint`). At 5M: minimum listing
  is 1 KAS @5% (and 1 KAS @10–20%, MIN_PRICE applies). Safety note: a
  too-low floor only leaves cheap listings unbuyable; no funds are lost
  either way.
- Boundary test on the new build: list ed0 at 1 KAS @5% (roy exactly
  5M == floor) **SUCCEEDED** (tx `172532a5…`) — the floor is inclusive.
  A sub-floor list is now **unreachable through honest flows** (factory
  enforces royalty ≥ 500 and MIN_PRICE 1 KAS ⇒ roy ≥ 5M always); the
  floor mechanism itself was proven in round 1 at 25M (1-KAS list/sell
  rejected).

### 3.2 New template hashes (fresh genesis build)

| Contract | Template hash | Bytecode | State span |
|---|---|---|---|
| Edition v13-fixed | `9106b1426f4bb67ba4133d040b5258a9f177939c338266d249a1f8780e0ea2e5` | 2599 | 203 |
| OfferEscrow v6-fixed | `8eff7679c1b7a188ec4b49e8d41c2e14929f27049715cf10ff24f4ad993b0349` | 1427 | 161 |
| SeriesFactory v13-fixed | `029512ea7fa65643f5bc82f125cd23eb09b4ed5b2fe8fc9d33e5769cc3eb1014` | 16705 | 144 |

Factory args now 12; arg[10] == edition template hash (N3 closed).
Series config `series-fixed.json`: price 2 KAS, royalty_bips 500,
mints_left 4, next_serial 0.

### 3.3 M3 — offerer `cancel` replaces the un-compilable age bound

- The one-liner `require(this.ageDaa < expireAge)` does **not** compile
  in silverc 0.1.0 (5 failed compiles; `<`/`<=`/`>` are int-only,
  `this.ageDaa` is only parseable in `require(this.ageDaa >= int)` lock
  form). Instead the escrow gained a `cancel(sig offererSig)` entry:
  `require(checkSig(offererSig, pubkey(offerer)));` +
  `require(OpAuthOutputCount(this.activeInputIndex) == 0);`. The offerer
  can withdraw a stale offer at any time; this also closes the "no early
  cancel" low. Residual risk is the normal order-book race (owner can
  accept until the offerer cancels). Note: cancel pins no output — the
  destination is the offerer's choice; a careless builder could burn funds.
- **Cancel tested on-chain: SUCCEEDED** (tx `cca9f8ed…`, 210M refunded).
  Caveat: that offer was created under the wrong env (offerer == owner ==
  key1, a self-offer), so the script path is proven but it was not a
  two-party cancel. The M3 accept-side hole remains by design — offers
  stay fillable until cancelled / expired / accepted.

### 3.4 Expire — the age lock is a sequence check (new finding)

- `expire-fixed.js` repeatedly failed with "Unsatisfied lock time:
  locktime requirement not satisfied — locktime is greater than the
  transaction locktime: 10 > 0". Ruled out: tx `lockTime` (lockTime=10
  and lockTime=current DAA both fail identically, wRPC and REST).
  Mempool does enforce tx lockTime (future-lockTime txs rejected).
- **Proven:** silverc lowers `this.ageDaa >= N` to a **relative-locktime
  (sequence) check on the spending input**: setting the escrow input's
  sequence = expireAge (10) made the locktime error disappear (only
  REST's computeBudget drop remained). The patched `expire-fixed.js`
  sets the escrow input's sequence = expireAge.
- **Expire SUCCEEDED** (tx `ba8c5cf0…`, 210M refunded to key2) on an
  offer aged ~1800 DAA scores past expireAge=10.
- **Control — the age gate is genuinely enforced, not vacuous:** a fresh
  offer (expireAge=100000, age ~seconds) expired immediately with
  sequence=100000 was **REJECTED**: "one of the transaction sequence
  locks conditions was not met". The node verifies the sequence against
  the UTXO's real age (sequence must be ≤ actual age). So the expire
  entry's age gate works; the builder must set the spending input's
  sequence ≥ expireAge (and ≤ the real age).
- Correction to an earlier note: `lib/reliks-lib.js` `sighash` gained an
  optional `lockTime` param with a comment claiming the ageDaa lock was
  a tx-lockTime requirement — **that comment was wrong** and has been
  corrected in the file (it is the sequence, not lockTime).

### 3.5 M2 — counter serials work on-chain

- Factory state gained `int next_serial` (constructor arg 11); mint
  uses `serial: next_serial`, lane writes `next_serial + 1`; fork left
  lane keeps `next_serial`, right lane gets `next_serial + leftMints`;
  initial lineage = `blake2b("ReliksGenesisV2" + factory_covid +
  LE-8(next_serial))`. `serialFromOutpoint` removed. Art per serial is
  publicly predictable (accepted — best Kaspa script can do without a
  randomness beacon).
- **On-chain:** ed0 serial 0 (mint `0f89d8d0…`), ed1 serial 1
  (`85de4db8…`), ed2 serial 2 (`9bf0d343…`), ed3 serial 3
  (`0d77ba01…`) — the LE 8-byte lineage encoding matched the script
  every time. Fork test (own 3 KAS series, genesis `bc3815a8…`):
  fork `fce65b48…` split 1.5 + 1.5 KAS (left next_serial 0, right
  next_serial 2); control mint from the right lane produced serial 2
  (tx `c9f26fb8…`, lineage `eb830b43…`). Serials can no longer be ground.

### 3.6 Lows closed in the same genesis

- Fork lane floor: `require(tx.outputs[leftIdx].value >= 100000000 &&
  tx.outputs[rightIdx].value >= 100000000)` — forking a 1 KAS lane is
  now impossible (needs ≥ 2 KAS or added funding).
- Genesis validation in `tools/verify-contract.js` (exports
  `isValidXOnly`, `validateSeriesConfig`, `validateFactoryArgs`;
  CLI `--validate`): artist is a valid x-only key (64-hex + secp256k1
  lift check), royalty 500–2000, `mints_left > 0`, `next_serial ≥ 0`,
  `program_hash == blake2b(engine_code)`. Negative controls verified
  (artist `00…00`, royalty 1, mints 0 all caught). `deploy-fixed.js`
  runs it pre-broadcast and printed `GENESIS VALIDATION OK` on the real
  deploy (genesis tx `026312ed…`, lane covenant
  `32922f4e45ae3fe558139a90aa70d65a4e32bef48b14a0231f6f906d96406e11`).
- M4: `tools/check-edition-genesis.js` re-run on the new series —
  genuine ed0 mint `0f89d8d0…` index 1 → **GENUINE** (exit 0: lane input
  spent the genesis lane, edition output authorized by input 1); C1
  decoy accept tx `811ddc51…` output 3 → **NOT GENUINE** (exit 1).
- N1/N2: no contract change (lineage cosmetic only, cap the wear effect,
  `sales` ≠ proof of demand).

### 3.7 Full testnet suite on the fresh genesis (ledger `v13-fixed/ledger.json`)

Honest flows: buy ed0 (key2) tx `dcb544e3…` ✓; accept ed1 tx `3a3ccaa9…`
✓ (ownerNet 190M, royalty 10M @5%); cancel tx `cca9f8ed…` ✓ (self-offer
caveat, §3.3); expire tx `ba8c5cf0…` ✓ (§3.4); combined buy+accept in
one tx `0da14ec9…` ✓ (ed2 output 0, ed3 output 3, both → key2).

Negative tests (all rejected with script verification failure, as required):
- **Factory double-mint across lanes sharing one artist output** —
  attack tx `c65778d0…` REJECTED (fork test; right lane passed
  artistOutIdx=2, rule demands 5). Control mint from the right lane
  succeeded (serial 2). **H1 across lanes HOLDS.**
- **Two escrow accepts sharing one royalty output** — attack tx
  `5d243696…` REJECTED ("failed to verify the signature script").
  Attribution is dual by construction: the second escrow's H1 rule
  wants royalty at editionOutIdx+2 = 5 (got 2), and the second
  edition's buy wants artistOutIdx == 5 too — the shared royalty cannot
  satisfy both, which is the point. **Escrow H1 HOLDS.**
- **Edition output ordering (buy + accept in one tx)** — swapped layout
  (buy's payments after accept's edition) REJECTED; grouped layout
  `[edition, ownerPay, royalty]` per covenant input SUCCEEDED
  (`0da14ec9…`). Only violation in the swapped layout is the buy's H1
  (the accept's payments coincidentally match values/recipients).
- Round-1 negatives still stand on this build's rules: C1 decoy accept
  rejected, H1 double-buy rejected, 1-KAS list/sell rejected at 25M.

Test-harness notes (for the next run):
- The double-accept setup exposed two ledger/tooling traps, both
  corrected, neither a contract issue: (1) a `list 0` failure was
  misread from `tail -1` — tx `4dba0343…` was the **ed1** list, not ed0;
  ed0 was never listed and a manual ledger "fix" corrupted ed0's entry
  (reverted; ed0 properly listed later as `42a31d99…`). (2) The ledger's
  `ed0.spk` field was stale (double-hex-encoded form, written by the
  hung buy script) and tripped the F-B17 drift guard; corrected to the
  on-chain value `aa20da2b9f3c0b7fa88d…` (buy tx `dcb544e3…` output 0).
  The ledger lineage for ed0 (`597a5954…`) was verified correct by
  recomputing LIN0 → adv from the series data.
- wRPC `getUtxosByAddresses` returns its entries under
  `params.entries` (notification shape), not `result.entries` — a probe
  that reads only `result` sees zero UTXOs for a funded address.
- The REST address-UTXO endpoint is mainnet-only (rejects `kaspatest:`
  addresses); testnet REST lives at `api-tn10.kaspa.org`.

### 3.8 Leftover test dust (testnet only, owner's own keys)

- Two stale key1 offers from round 1 (`ef5b9c7b…`, `c0953a29…`), 2.1
  TKAS each — refundable via `expire` after ~100k DAA, now also via the
  new `cancel` entry (offerer == key1).
- One orphaned key1 offer on ed3 (`f9ea6f60…`, 210M) created under the
  wrong env during the combined-test setup — superseded by the key2
  offer (`a1f11277…`, consumed by `0da14ec9…`); refundable via `cancel`
  (offerer == key1).
- One live key2 offer on ed2 (`a1ccda94…`, expireAge=100000, 210M) —
  created for the expire control; still live, refundable via `cancel`
  (offerer == key2) or `expire` after age 100000.
- All four new-series editions are owned by key2 (unlisted); the fork
  test series (`bc3815a8…`, 1 control edition, serial 2) is separate.

### 3.9 What remains open

- **M3's accept-side hole remains by design** — expired offers stay
  fillable until cancelled/expired/accepted; `cancel` is the mitigation.
- **Mainnet genesis was NOT done.** It needs the user's mainnet key +
  funds, the 5M floor + 5% minimum royalty baked in, fresh template
  hashes, and a re-run of the suite against the shipped build.
- Whether the C1 decoy UTXO is spendable (live duplicate) or dead (no
  covenant id was ever assigned): structurally it should be dead, but no
  spend attempt was run.
- The fixes live only in `audit-test/v13-fixed/` — nothing was pushed
  to GitHub.

---

## Phase 3 addendum — Claude's four negative tests (2026-11-14, evening)

All four were run on testnet-10 after the phase-3 report section above.
Each has a dedicated script in `audit-test/v13-fixed/`.

### A. Cancel with the wrong key — REJECTED (H0LDS)

- Script `cancel-wrong-key-fixed.js` (copy of `cancel-fixed.js` minus
  the offerer guard, signing with the env key). Live offer on ed2 from
  key2 (`a1ccda94…`, 210M locked, `escrow-ledger-ed2b.json`); cancel
  attempted under key1 (non-offerer).
- Attack tx `56f12a65…` REJECTED: "failed to verify the signature
  script". The escrow's `cancel` entry checks
  `checkSig(offererSig, pubkey(offerer))` — a non-offerer signature
  cannot pass. The offer survives (rejected tx consumes nothing).
- Together with the honest cancel (`cca9f8ed…`, self-offer caveat), the
  cancel property is now proven both ways: the offerer can cancel, a
  non-offerer cannot.

### B. Fork with a lane under 1 KAS — REJECTED (HOLDS)

- Script `fork-floor-fixed.js`; own 2 KAS series (genesis `85d677de…`,
  lane C `adfb4e12…`, mints 2, royalty 500).
- Attack: fork into left 1.2 KAS + right 0.8 KAS — REJECTED (script
  verification failed; the fork entry requires both lane outputs
  `>= 100000000`).
- Control: even 1 + 1 KAS fork SUCCEEDED (tx `2fd53cee…`).
- The lane floor is enforced on-chain, not just in the builder.

### C. Mint royalty 499 rejected, 500 passes (HOLDS)

- A 499-royalty factory was deployed deliberately (`0c8b3c13…`, lane C
  `1d92c695…`) using `deploy-499-fixed.js`, a test-only variant that
  bypasses the deploy tooling's genesis validation — proving a bad
  genesis *can* reach the chain if tooling is bypassed, which is exactly
  why the script-side check matters. Never use that variant for a real
  deploy.
- Mint on the 499 factory REJECTED (tx `db422f36…`, script verification
  failed — the mint entry requires
  `royalty_bips >= MIN_ROYALTY_BIPS`).
- 500 passes: the main phase-3 series minted four editions at royalty
  500 (`0f89d8d0…`, `85de4db8…`, `9bf0d343…`, `0d77ba01…`), plus the
  serial-control mint `9b49cf6b…` (§D).

### D. Mint with the wrong `next_serial` — REJECTED (HOLDS)

- Script `mint-wrong-serial-fixed.js` (copy of `mint-fixed.js` with the
  lane output writing `next_serial: serial + 2` instead of `+ 1`).
  Fresh 500-royalty series (genesis `9262a1aa…`, lane C `6f14eba9…`).
- Attack mint REJECTED (tx `91fd1a98…`, script verification failed —
  the mint entry validates the lane output state with
  `next_serial: next_serial + 1` exactly).
- Control: honest mint on the same lane SUCCEEDED (tx `9b49cf6b…`,
  serial 0, edition `c161e218…`).

### Test-infra note (cleanup deferred, not done)

- The real `ws` package (8.22.0) was restored to top-level
  `node_modules/ws` during phase-3 cleanup — and immediately broke
  wRPC again: Node resolves the top-level `node_modules/ws` before
  `NODE_PATH`, so the shim in `audit-test/node_modules/ws` is shadowed
  and every covenant spend fails with the SSL "wrong version number"
  error. The real package was moved aside again
  (`/tmp/ws-real-pkg-real`) for the rest of the testnet work. **Do not
  restore the real `ws` until all testnet work is finished** — the
  restore is a final-cleanup step, and it silently breaks wRPC.

### Operational rules (standing, from Claude)

- Wallet UI must warn offerers to cancel stale offers (accept-side hole
  stays open by design; `cancel` is the mitigation).
- Indexer shows an edition only if its genesis tx spent a lane of the
  real factory covenant (M4) — checker `tools/check-edition-genesis.js`.
- Lineage is cosmetic only; cap the wear effect (N1/N2). `sales` is not
  proof of demand.

## Phase 4 — Claude's clearance + comment fixes + decoy mint + GitHub push (2026-11-15 00:47–01:10)

Claude reviewed the three phase-3 `.sil` files (static read only): **"No Critical or High findings in the shipped source. It is cleared for the mainnet rehearsal after the comment fixes below."** Verified in source: C1 (escrow l.107–108), H1 (all layouts checked: two editions, edition+lane, lane+escrow; escrow and edition agree on base+1/base+2), M1 (floor in `list`, `sell`, `accept`; `buy` covered through `list`), M2 (fork disjoint ranges, lane carries `next_serial + 1`, lineage includes covenant ID + serial), escrow (`nextEd` lineage/sales match `soldState`, `cancel`/`expire` both require zero authorized outputs).

### Comment fixes (comments only — hashes must not change)
1. Edition header l.3–9: stale outpoint-based lineage + old v13 hash `26d35f48…` → rewritten to the counter-serial description + current hash `9106b142…`.
2. Edition l.40: "mainnet cap PROBED" → "mainnet cap inferred from source and TN10".
3. Escrow l.5: "M1 royalty floor 25M" → "M1 royalty floor 5M".
4. Escrow l.144: accept/expire "the ONLY exits" → "Exits are accept, expire, and cancel (offerer only)".

**Hash re-check (Claude's step 1):** recompiled all three fixed sources with silverc 0.1.0 and compared `[bytecode, template_hash, state_span]` against `out/*.json` — **all PASS, hashes unchanged**: edition `9106b1426f4bb67ba4133d040b5258a9f177939c338266d249a1f8780e0ea2e5` (2599 B, span 203), escrow `8eff7679c1b7a188ec4b49e8d41c2e14929f27049715cf10ff24f4ad993b0349` (1427 B, span 161), factory `029512ea7fa65643f5bc82f125cd23eb09b4ed5b2fe8fc9d33e5769cc3eb1014` (16705 B, span 144). The fixed pairs are now in `tools/verify-contract.js` PAIRS, so the default `node tools/verify-contract.js` run covers them permanently (PASS).

### Lows (no script change)
- **Cancel output pin:** `cancel-fixed.js` now has a builder-side assert — output 0 must be the full refund to the offerer (`'20' + st.offerer + 'ac'`, amount == locked) — so a builder bug can't burn an offer. (`cancel` pins no output in-script, as noted.)
- **`init_next_serial` bound:** `tools/verify-contract.js` now enforces `0 <= init_next_serial < 2^40` in both `validateSeriesConfig` and `validateFactoryArgs` (2^40 rejected, 2^40−1 accepted, series-fixed validates clean). A value near 2^63 would overflow at `next_serial + 1`.
- **Decoy mint — TESTED, passes (known grief, accepted):** `audit-test/v13-fixed/mint-decoy-fixed.js` (copy of mint-fixed.js with the edition output's covenant removed) on the ledger-serial series. **The tx MINED**: `9ee7aea48884baca889f9d2ccc5c69c451a1ceffb0e984776123d4ad3719814a` (block `f24181a5…`, DAA 623,549,701), serial 1 burned, 1 KAS carrier lost to a dead unbound P2SH edition. So `mint` does NOT pin `editionOutIdx` to a covenant-bound output — a minter can grief one mint + 1 KAS, only worth doing against a free-mint series. **The indexer rule holds:** `tools/check-edition-genesis.js` on the decoy mint returns NOT GENUINE (exit 1) — lane-spend check PASSES (the mint really spent the factory lane) but the edition-output authorization check FAILS (`authorized by input null`, expected 1). The M4 checker must require the edition output to be covenant-bound, not just that the mint tx spent a lane. Ledger-serial reconciled: `mints_left` 4→3, `next_serial` 0→1, `decoyBurns` recorded; the dead edition is NOT in `editions`.

### GitHub push — DONE (was blocked, now live)
- The user completed the GitHub App installation (write access granted). Branch `v13-fixed` created from main head `d4f6d9a6` (main had moved: v13 promotion commit `d9092665` "Promote v13 contracts to sil/").
- Reconciliation note: remote `tools/verify-contract.js` differed from the clone's 8a0ed3f base only by the promotion (one added comment + `-draft` suffixes dropped in PAIRS). The genesis-validation block was spliced onto the remote base (not the stale local copy) before pushing.
- **Snapshot push 1:** commit `7a91a8505c9fde281e58abbd4ca03512fa572ef1` — 15 files (3 .sil + 3 ABIs + TEMPLATE-HASHES.json + factory/escrow args + series config + 3 mainnet builders + runbook + verify-contract.js). Local commit is `b691ac5` (same content; snapshot commits don't carry local git history).
- **Snapshot push 2:** commit `a2525ee23aab32ca1688b35a8e1f611f87cbf664` — `tools/gen-mainnet-key.js` (fresh-key generator, tested: writes `~/.reliks-mainnet.env` 0600, prints only pubkey + address, never the privkey; derived address verified to match) + the `ws` shim (`audit-test/node_modules/ws/{index.js,package.json}`) as the Termux wRPC fallback. Verified by reading both files back from the branch.
- Sync record: `~/workspace/reliks-audit.muse-github-snapshot-sync.json` (branch head `a2525ee2`, 18 paths).

### Mainnet throwaway — ready for the user's Termux run
Public mainnet wRPC endpoints found (KasWare's own production config + Kasia): `wss://us-1.kaspa-ng.org/mainnet`, `wss://wrpc.kasia.fyi` (backup). `lib/network.js` takes them verbatim from `PC_MAINNET_WRPC` (comma-separated, rotated). Exact Termux commands were given to the user in chat 2026-11-15 01:10 (clone branch `v13-fixed`, `npm ci`, keygen, fund ~10 KAS, gen args, deploy → mint → list 1 KAS @5% → buy = the mass check). **Mainnet genesis still NOT done** — awaiting his on-device throwaway result.

## Phase 5 — Mainnet throwaway: genesis DONE + verified, mint BLOCKED on public wRPC outage (2026-11-15 05:16–05:45)

### Genesis (user's Termux run, fresh mainnet key)
- Key generated on-device: `tools/gen-mainnet-key.js` → pubkey `661709f6a0aef400e344b4706a4fb4d82b7ca786abb4f01924f565f452e026c9`, address `kaspa:qpnpwz0k5zh0gq8rgj68q6j0knvzkl98s64mfuqeyn6ktazjuqnvjatw5z4fp` (privkey never printed, lives only in `~/.reliks-mainnet.env` 0600). Funded 10 KAS in one UTXO (`0c5cf686…:0`, confirmed DAA 592,871,380; balance verified via api.kaspa.org before deploy).
- Branch `v13-fixed` checked out on the phone at `a2525ee` (his existing `~/Reliks` clone — the fresh-clone command failed on the non-empty dir; fixed with fetch + checkout). `npm ci` OK, Node v26.3.1.
- **Deploy SUCCEEDED**: genesis tx `aaa1b9b9f694714632d6cc398fc2bdcfea7295ee9bdee39852d0b6c1b5ffde1c`, confirmed block `d47a442b…` (DAA 592,879,708), lane covenant **C = `1c27b45ef8e281f561444118f932f3051d83452dbdd2ff7990175287e0ec8bf0`**. Verified independently via kascov (`/data/mainnet/c/<C>.json` genesis event) and api.kaspa.org (tx exists, mass 2083). First mainnet covenant series is live. Cost so far: 1 KAS lane + fee; change UTXO ~8.97 KAS intact.
- Note: the deploy went through after wRPC errors because creating a lane is NOT a covenant spend — the lib's REST fallback carried it. The mint/buy/list steps ARE covenant spends and cannot use REST (it drops `computeBudget`).

### The block: no reachable public mainnet wRPC JSON endpoint
Mint failed (tx built: 2 inputs, 4 outputs, sigscript 16750+66 B, never broadcast — nothing spent): `covenant spend requires wRPC; wRPC failed: websocket error (all wRPC endpoints rotated)`. Nine candidates tested from TWO independent networks (user's phone + this sandbox), all failing; control test proves the method works (testnet `wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json` OPENS from the sandbox):
- `wss://us-1.kaspa-ng.org/mainnet` — timeout (both networks); curl from sandbox: TCP/TLS never completes (http 000). KasWare's own default.
- `wss://wrpc.kasia.fyi` — websocket error (phone); 502 from sandbox.
- `wss://eu-1.kaspa-ng.org/mainnet` — 502 from sandbox.
- `wss://us-1.kaspa-ng.io/mainnet`, `wss://eu-1.kaspa-ng.io/mainnet` (old KasWare .io domain) — timeout / error.
- `ws://seeder2.kaspad.net:18110` (JSON port), `ws://seeder2.kaspad.net:17110` (Borsh port) — websocket error (phone); timeout (sandbox). Seeder2 is a P2P seeder, likely not serving RPC at all.
- `wss://electron.kaspa.stream/kaspa/mainnet/wrpc/json`, `wss://vector.kaspa.green/kaspa/mainnet/wrpc/json` — timeout (sandbox).
- `ws://n-mainnet.kaspa.ws:18110`, `ws://n-mainnet.kaspa.ws:17110` — timeout (sandbox).
- Both the real `ws` package and the undici shim fail identically on the phone, so it is not the client stack. kaspa-ng proxies returning 502 + everything else timing out = the public mainnet wRPC infrastructure is down/unreachable right now, not a problem with the contracts, the key, or the phone. (Context: PNN moved to wRPC v2 Borsh per rusty-kaspa #506; the JSON endpoints our lib speaks are the ones affected.)
- Missing-file fix during the run: `audit-test/v13-fixed/gen-factory-args-fixed.js` was never pushed to the branch (my oversight) — pushed as commit `cf3ae1bc` (branch head now `cf3ae1bc`, 19 paths in sync record); user pulled and the args generated fine (engine 3888 B, engine_hash `16440384…` = the verified testnet hash).

### Next steps
1. **Retry the mint later** — same commands, same endpoints (`PC_MAINNET_WRPC="wss://us-1.kaspa-ng.org/mainnet,wss://wrpc.kasia.fyi"`); a failed mint costs nothing. The 8.97 KAS change UTXO funds it.
2. Offered: an hourly endpoint watch from this side, pinging the user when a mainnet wRPC endpoint recovers (needs his yes before setting it up).
3. Fallback if the outage persists: run his own kaspad (own node = definitive, but a mainnet sync is hours + tens of GB — heavy on a phone; only if the outage drags on).

### Resolver integration (built 2026-11-15, user-approved) — the wRPC fix

**Root cause found (kaspa-agent-notes repo, supplied by user):** the public node fleet moved to wRPC v2 (Borsh). Verified directly against the resolver service: `GET https://eric.kaspa.stream/v2/kaspa/mainnet/any/wrpc/borsh` returns `{"uid":"…","url":"wss://emma.kaspa.stream/kaspa/mainnet/wrpc/borsh"}` (200), while `.../wrpc/json` returns 404 — **no public JSON endpoint exists anymore**. The kaspa-ng groups are commented out of the SDK's `Resolvers.toml` (retired), so `us-1`/`eu-1.kaspa-ng.org` are dead. The live fleet is kaspa.stream/.red/.green/.blue (16 resolver services). The Resolver's own node list (`.bin` files in aspectron/kaspa-resolver) is encrypted — no static URLs to extract. The WASM Resolver's `getUrl` has no fetch timeout (it hung in this sandbox); the integration re-implements the same protocol with an 8s timeout per host.

**What was built** (`lib/sdk-submit.js`, `tools/resolve-node.js`, `tools/setup-sdk.sh`; wired into `lib/reliks-lib.js` `broadcastWithMsg` behind `PC_USE_SDK=1`, and `lib/network.js` no longer requires `PC_MAINNET_WRPC` when it is set):
- SDK: kaspa-wasm32-sdk v2.1.0 (release zip, NOT npm — npm's `kaspa` is a 2023 build without covenant support). Node.js build in `vendor/kaspa-wasm/` (11.5 MB, gitignored; `tools/setup-sdk.sh` downloads it). Node ≥ 22's built-in W3C WebSocket is enough — no `websocket` npm package needed.
- Discovery: direct HTTPS GET to the resolver services (same protocol as the SDK Resolver), shuffled, 8s timeout each, expecting `{"url": "wss://…/wrpc/borsh"}`.
- Submit: SDK `RpcClient` (Borsh) → connect (20s timeout) → `getInfo` (must be synced + utxo-indexed) → convert our tx to the SDK's SafeJSON → `deserializeFromSafeJSON` → `finalize()` → `submitTransaction({allowOrphan: true})`. Up to 3 freshly-resolved nodes on connect failure.
- **SafeJSON conversion (the hard part):** the SDK's serializable shape differs from the node's RPC shape — flat inputs (`transactionId`/`index` at top level, no `previousOutpoint`), a REQUIRED `utxo` entry per input (amount + scriptPublicKey + blockDaaScore + isCoinbase), outputs as `{value, scriptPublicKey:{version, script}}`, u64 fields as strings, top-level `id` required (dummy zeros — `finalize()` recomputes it). `utxo` data comes from a REST lookup of each input's funding tx (amount + script are real; `blockDaaScore` is '0' — SDK-side auxiliary data, never sent to the node). Verified: `finalize()` on the converted ed2b cancel tx reproduces its real id `6186b7b6…` exactly.
- Fallback preserved: if the SDK path fails, the raw wRPC list + REST run exactly as before.

**Testnet proof (2026-11-15):** offer tx **`133526d8c70b88d83e5a3a418440a949cc1cffadbff4ecca75c44e6ca37d8f20`** (key2 offer on ed0, 210M locked) submitted via the SDK path and accepted on-chain (1 input, 2 outputs). First resolved node (electron-10.kaspa.blue) timed out on connect; the retry resolved vector-10.kaspa.green and it went through. `tools/resolve-node.js mainnet borsh --verify` also works (resolves + connects + getInfo).

**Side findings (same session, all testnet):**
- The raw JSON wRPC path is a fire-and-forget trap: electron-10 accepts the tx but drops the connection before the response, so the client logs "websocket error" while the node already has the tx; the next host then replies "already accepted by the consensus". Seen on the ed2b cancel (`6186b7b6…`), the 2acc-b cancel (`c84ed9d7…`), and the key2 fund (`4e02d433…`). All three landed despite the error logs. `broadcastWithMsg` now logs the raw reply on rejection, which is what exposed this.
- Testnet dust cleaned up: the two 2acc offers (key1, 210M each) and the ed2b offer (key2, 210M) were all cancelled via the fixed scripts (txs `18286ce8…`, `c84ed9d7…`, `6186b7b6…`); key2 was topped up 5 TKAS from key1 (`4e02d433…`) after its fragmented balance left no single UTXO ≥ 213M for an offer. No live testnet offers remain.

## Phase 6 — SDK/Borsh submit BREAKS covenant txs; live mainnet JSON endpoints found (2026-11-15 06:13–06:25)

**Mainnet mint failure (user's Termux, 06:13).** `mint-mainnet.js` built the mint tx (2 inputs, 4 outputs, sigscript 16750+66 bytes) and the SDK/Borsh path reached three live mainnet nodes (maya.kaspa.red, lola.kaspa.blue, emma.kaspa.stream — all server 2.1.0, synced, utxo-indexed). All three REJECTED the same tx `09984074…` with: `failed to verify the signature script: script ran, but verification failed`. The raw wRPC fallback then failed too (all old JSON endpoints dead). Nothing was spent; wallet 8.97 KAS intact; ledger unchanged.

**The mint tx itself is VALID — proven on testnet.** The identical builder (`mint-fixed.js`, only the network guard differs) via the SDK path on the ledger-serial series (serial 2, tx `420261e0…`) was rejected with the same error on vector-10 Borsh (3 attempts), then fell back to the raw JSON wRPC path and **MINED** as `1b81a3e6a7ba3eba528f1cc29f5745fcea2f9246b31af0d3d34c25835d0ee42c` (edition `1e8814aad8a3ce8b…`, serial 2). A second testnet mint (serial 3, `d7412e4cdb828c199cf66b59cd832f95f648452075092d746821ba5a09ba58ef`, block `d8bf565a…`, DAA 623,747,281, edition `104bb0f544925bc6…`) also mined via the raw path after SDK connect timeouts. The ledger-serial series is now complete (3 real editions, serials 0/2/3; serial 1 was the decoy burn).

**Diagnosis.** The SDK/Borsh submit path breaks large covenant transactions but not small ones: the testnet offer (1 input, 2 outputs, 66-byte sigscript, computeBudget 10) went through the SDK fine, while both mints (16,750-byte sigscript, computeBudget 100) were rejected with a script-verification failure on every node tried. The mechanism is not yet isolated (two candidates: the Borsh wire format drops/mishandles the per-input `computeBudget`, so the node runs the big factory script on a default budget; or the 16 KB sigscript is mangled in the SafeJSON round-trip). A `PC_SDK_DEBUG=1` diagnostic was added to `lib/sdk-submit.js` (logs each input's sigscript length + computeBudget after deserialization) but the serial-3 run never reached it (SDK connect timeouts). **Standing rule: do NOT use `PC_USE_SDK=1` for covenant spends (mint/list/buy/accept/fork/cancel/expire). The SDK path is fine for node discovery and for small non-covenant txs only.** `mint-sdk-test.js` (test-only copy of `mint-fixed.js` with a `RELIKS_LANE_TXID` env override) was used for the serial-2 test because the decoy burn left the ledger's lane pointer stale — the current lane after the decoy is `9ee7aea4…:0`, not the last edition's mint tx.

**Live mainnet JSON wRPC endpoints (probed 2026-11-15 06:25, from the sandbox).** The resolver lists Borsh nodes only (`/wrpc/json` on the resolver returns 404), but some fleet hosts serve JSON on the same host under `/wrpc/json`. Tested 10 hosts: **TWO serve JSON and answer getInfo (synced, utxo-indexed): `wss://emma.kaspa.stream/kaspa/mainnet/wrpc/json` and `wss://eva.kaspa.green/kaspa/mainnet/wrpc/json`.** Eight reject it (WS error): vivi, maya, lola, kate, isla, ivy, iris, and (earlier) the kaspa-ng/kasia hosts. The raw JSON path is the proven route for covenant txs (every testnet covenant tx in this audit mined through it), so the mainnet mint now runs as:

```bash
export PC_MAINNET_WRPC=wss://emma.kaspa.stream/kaspa/mainnet/wrpc/json,wss://eva.kaspa.green/kaspa/mainnet/wrpc/json
unset PC_USE_SDK
node audit-test/v13-fixed/mint-mainnet.js
```

(With `PC_USE_SDK` unset, `broadcastWithMsg` goes straight to the raw list; the SDK path is skipped entirely. If the SDK path is left on it would still work via fallback, but wastes ~60 s of retries first.)

**MINT DONE on mainnet (user's Termux, 2026-11-15 06:26).** With `PC_MAINNET_WRPC=wss://emma.kaspa.stream/kaspa/mainnet/wrpc/json,wss://eva.kaspa.green/kaspa/mainnet/wrpc/json` and `PC_USE_SDK` unset, the mint mined: tx **`3bb75c9767d77c79b96ba147ff47b10b998abc20bacd9f9f4db658c5134eb7a1`**, serial 0, edition `ba2374f6f617c12d…`, artistCut 200,000,000. Verified on-chain via api.kaspa.org: `is_accepted: true`, accepting block `d96c6443…`, blue score 590,802,637, REST mass 29,756; input 0 spends the genesis tx `aaa1b9b9…` output 0 (the lane). Wallet balance after: 793,194,879 sompi (7.93 KAS). **Mainnet fee learning:** attempt 0 (fee 3,000,000) was rejected by BOTH nodes — "transaction has 3000000 fees which is under the required amount of 3459200 for normalized transient mass 34592" — i.e. mainnet's minimum relay fee is **100 sompi per unit of normalized transient mass**; the fee loop auto-bumped to 3,805,121 (attempt 1) and it mined. The 3,000,000 initial fee is too low for mainnet covenant txs of this size; the loop is the mechanism, but a higher initial fee would save a round-trip. The fire-and-forget trap also occurs on mainnet (eva dropped the connection after accepting; the retry got "already accepted by the consensus"). **Next: list edition 0 at 1 KAS (`secondary-mainnet.js list 0 100000000`) then buy (`secondary-mainnet.js buy 0`) — the buy is THE mainnet mass check.** `buyPolicy` has no buyer != owner rule, so a self-buy with the same throwaway key is valid for the mass check.

**THROWAWAY REHEARSAL PASSED — buy mined, 5M floor CONFIRMED on mainnet (user's Termux, 2026-11-15 06:29).** List then buy, same raw JSON path (emma + eva):
- LIST tx **`89ac1e571060e3337c2866bf165939736134fcfd05205515c85cbbf4cdd91a81`** | edition `ba2374f6f617c12d` | price 100,000,000 (1 KAS) | confirmed block `bf29544d…` (DAA 592,910,159). Verified via api.kaspa.org: accepted, REST mass 14,815, blue score 590,803,977.
- BUY tx **`a1240b007cbc3cf4c73848166ec45f83ddbe69cbeef7d43b711ca562645e3dab`** | ownerNet 95,000,000 | royalty **5,000,000** (exactly the floor) | confirmed block `1e6042ab…` (DAA 592,910,616). Verified via api.kaspa.org: accepted, REST mass **15,603**, blue score 590,804,434. Wallet after: 787,194,879 sompi (7.87 KAS). This was a self-buy (same throwaway key as owner + artist) — valid for the mass check; `buyPolicy` has no buyer != owner rule.
- **Verdict: the mainnet mass cap is 500,000 and the 1 KAS @ 5% buy (royalty exactly at the 5M floor) mines with mass 15,603 — 3% of the cap. The 5,000,000 floor SHIPS; the 25M fallback is dead and must not be applied.** Both txs again showed the fire-and-forget pattern (emma dropped the connection; eva reported "already accepted by the consensus"). The 3,000,000 initial fee was enough for list/buy (smaller txs than the mint); the fee loop is the safety net either way.
- **Throwaway rehearsal complete: genesis + mint + list + buy all mined on mainnet.** The real series genesis is now unblocked: fresh series config, regenerate args, deploy/mint/list/buy on-device with the same commands (raw JSON path, `PC_MAINNET_WRPC` = emma + eva, `PC_USE_SDK` unset). The throwaway lane/edition (`1c27b45e…` / `ba2374f6…`) are test artifacts — the real series gets its own lane covenant id.

## Phase 7 — FINAL sources verified: compile + byte-identical (2026-11-15 06:41)

The user uploaded the three FINAL sources (`workspace/user/files/ReliksEdition-v13-final_4_bmgr.sil`, `OfferEscrow-v6-final_3_u9tr.sil`, `SeriesFactory-v13-final_5_ga9w.sil`). All three **compile cleanly with silverc 0.1.0** (no errors, no warnings shown) and are **byte-identical to the verified v13-fixed build**:

| Contract | Template hash | Bytecode | State span |
|---|---|---|---|
| ReliksEdition-v13 | `9106b142…` MATCH | 2599 B MATCH | 203 MATCH |
| OfferEscrow-v6 | `8eff7679…` MATCH | 1427 B MATCH | 161 MATCH |
| SeriesFactory-v13 | `029512ea…` MATCH | 16705 B MATCH | 144 MATCH |

Compiled with the same ctor args as the verified build (edition: `v13/edition-args-v13.json`; escrow: `audit-test/v13-fixed/escrow-args-v6-fixed.json`; factory: `audit-test/v13-fixed/factory-args.json`). Bytecode compared in full, not just the hash — identical. A comment-stripped diff against the v13-fixed sources is 0 lines: the FINAL files differ only in header comments, which state the audit status accurately (static review + testnet-10 suite + mainnet throwaway rehearsal passed; M3/M4/N1/N2 open by design). **The FINAL label is honest this time: same code that was audited, tested on testnet, and rehearsed on mainnet. The real-series genesis may use these files as-is.**

**Claude's final verdict (relayed by the user, 2026-11-15 06:54) — verified against this report, all accurate:**
- Scope: Claude's static review + the testnet-10 exploit/negative suite + the mainnet throwaway rehearsal. Not a formal third-party audit. (Agreed — this report is the same scope, stated throughout.)
- Fixed: C1, H1, M1, M2; cancel entry, fork lane floor, 5% minimum royalty all in. (All independently verified in source and on-chain: C1 decoy-accept rejected, H1 double-buy rejected, M1 1 KAS @ 5% buy mined on mainnet at mass 15,603, M2 wrong-serial mint rejected; cancel proven both ways; fork 1.2+0.8 rejected, 1+1 passed; mint royalty 499 rejected, 500 passes.)
- Open by design: M3, M4, N1, N2. (Agreed — M3 stale offers fillable until cancelled/expired/accepted; M4 counterfeit editions need the indexer check; N1 lineage cosmetic only; N2 wash sales, cap the wear effect.)
- Accepted: the decoy-mint grief. Launch with price >= 1 KAS to limit it. (Agreed — decoy mint tested and accepted as known grief. Note: price >= 1 KAS is already the contract's MIN_PRICE and the throwaway series price is 2 KAS, so this is a launch-config reminder, not a new requirement. The decoy costs the attacker the 1 KAS carrier per burned serial.)

## Phase 8 — kaspa-agent-notes 06 (redteam) + 15 (multi-wallet) read (2026-11-15 07:04)

**06 Redteam Before Deploy** (`kaspa-redteam`, judges attacks with rusty-kaspa's own consensus validator). How our work maps to its workflow: pinned silverc 0.1.0 compiles (byte-identical) ✓; real ctor values used ✓; honest spends for every path on testnet + mainnet throwaway ✓; contracts tested together as one project (combined buy+accept, double-accept, fork) ✓; independent review (Claude static + this verification) ✓; deploy small first (10 KAS throwaway) ✓. **Gap: `kaspa-redteam` itself was never run** — our negative suite was hand-written from Claude's attack list. Running it is the remaining pre-genesis check; `cargo install --git https://github.com/kasperolabs/kaspa-redteam kaspa-redteam` started 2026-11-15 07:04 (Rust present in sandbox at `~/.cargo/bin`, not on PATH). Its "does not cover" list vs Reliks: mempool standardness (>15 sig ops in a P2SH redeem = non-standard, not relayed) — empirically cleared, the factory + edition covenants both spent on mainnet via public nodes (genesis, mint, list, buy all mined through emma/eva); storage mass at real values (outputs < ~0.081 KAS uncreatable) — carrier is 1 KAS, fine; **insiders (Tier 2) — the bound to state: if the artist key is stolen, the thief can mint up to mints_left, list and sell; if an offerer key is stolen, the thief can cancel that offer and redirect the locked funds (cancel pins no output — already noted in the escrow).** The tool's attacker holds only their own key, so these need the role test, not the tool.
**15 Multi Wallet Support** — a marketplace playbook, not a genesis requirement. The one fact that governs the future Reliks marketplace: **Kastle cannot sign covenant inputs** (returns the tx with the covenant input unsigned, no error) — a marketplace page must hide Kastle or explain it. Kasware and Kaspire can sign covenant inputs (`signPskt`); hosted wallets (Kasla) sign via an approval page; phone wallets cannot sign from a page (QR flow only). Also: verify the active address before every signature (account switches after login have sent payouts to the wrong party). No wallet UI exists yet; this is a standing note for the marketplace build, not the genesis.

## Phase 9 — kaspa-redteam run: 1 HIGH finding (IN-01, expire) — replay-confirmed (2026-11-15 07:04–08:11)

Tool: `kaspa-redteam v0.17.2` (library v0.10.2), judge = rusty-kaspa consensus validator 2.1.0 in process (mempool policy NOT applied). All three FINAL files as one project, real deployment args (`/tmp/redteam-args.json`: price 2 KAS, royalty 500 bips, mints_left 4, next_serial 0, artist key1, program/render hashes, edition template hash `9106b142…`).
**Run 1 (no baseline): inconclusive.** Search alone could not build honest spends for the multi-coin paths: edition buy/sell/transfer, escrow accept/cancel/expire, factory mint/fork/close all UNEXPLORED. Per the tool's own rule, unexplored = untested, never safe. Escrow: NOTHING TESTED.
**Run 2 (with baselines): 1 finding.** Baselines fetched from chain: mainnet mint/list/buy + testnet-10 mint/accept/cancel/expire/fork/combined (9 txs; consensus accepts all as fetched; the offer tx skipped — plain payment, no covenant input). Results by section:
- Factory (standalone search): NOTHING TESTED — mint/fork/close still unexplored by search (the imported mint tx was attacked in the baseline section instead).
- Edition (standalone search): 0 FINDINGS, 3 PATHS UNEXPLORED (buy/sell/transfer); SIG-01 (invalid signature) and SIG-02 (attacker's own key) SURVIVED on the explored list/unlist/spend paths (12 attempts each rejected).
- Escrow (standalone search): NOTHING TESTED — accept/cancel/expire still unexplored by search.
- Baseline (real txs): 7 attacks run, 6 survived, **1 FINDING**. Survived: FEE-01, IN-02, OUT-01, OUT-02, OUT-03, OUT-04. FAM-01..10 all skipped (no explored spend creates coins of another program — the args file carried names some contracts lack (`init_askPrice`, `edition_template_prefix`), so the contracts were "not used as a partner" for the real txs; family/mint-power attacks were NOT tested in this run).
**[HIGH] IN-01 — Two covenant coins, one shared set of outputs (expire).** `expire` checks `tx.outputs[0].value == tx.inputs[this.activeInputIndex].value` and `tx.outputs[0].scriptPubKey == offererSpk`, but never checks how many inputs spend this escrow covenant. Two identical escrows (same offerer, same terms, same 2.1 KAS locked value) spent together are both satisfied by the SAME refund output; the second coin's 2.1 KAS is surplus the tx builder routes to themselves. Attack tx (from the finding file `redteam-findings/baseline-mainnet.json + baseline-testnet10/IN-01.json`): 3 inputs, outputs = 2.1 KAS to the offerer + ~3932.97 KAS change + **2.1 KAS to the attacker**. **Replay CONFIRMED: `kaspa-redteam replay …/IN-01.json` → "REPRODUCES IN-01 on `expire (imported)` tx `94ce86b20e9296731da699b2fcd15d82c9a0caca2f7c5b16306cefbb53acc078` (consensus accepted, fee 3000000 sompi)".** Exploit preconditions: the same offerer holds two identical live offers (double-tap / retry after a timeout — the tool's scenario), both expired; anyone (permissionless — expire needs no signature) bundles them and pockets one refund. Victim: the offerer loses one 2.1 KAS refund per pair. **Same shape in `accept`** (no input-count check; exploitable only by the edition owner/seller, who signs accept — narrower, and NOT tested by the tool since accept was unexplored). `cancel` has the shape too but is harmless (only the offerer can sign it, and it is their own money). **This is a NEW finding — not in Claude's audit (C1/H1/M1–M4/N1–N3).**
**Fix (verified to compile, NOT yet applied):** one line in each escrow entry — `require(OpCovInputCount(OpInputCovenantId(this.activeInputIndex)) == 1);` (both ops already used elsewhere in the codebase: `OpInputCovenantId` in the factory, `OpCovInputCount` in accept). It counts inputs spending THIS escrow covenant, so two identical escrows in one tx are rejected, while every honest flow survives: honest expire (escrow + wallet = 1 escrow input), honest accept (1 escrow input), and the combined buy+accept (4 inputs but only 1 escrow input). A blanket `tx.inputs.length == 1` would be WRONG (honest expire/accept carry a wallet input; the combined tx has 4 inputs). Test compile of the patched escrow (copy only, FINAL files untouched): compiles cleanly, new template hash `9fb49e513855f16332838ff0a957f66a04feeca9a52cc9c137137816b4a06bce`, bytecode 1445 B (was 1427), state span 161 unchanged. Applying it changes the escrow template hash only (edition `9106b142…` and factory `029512ea…` unaffected — the factory pins the edition hash, not the escrow's). **Recommendation: apply the fix, recompile, re-run the redteam, re-test accept/cancel/expire + combined on testnet, and get Claude's review before the real genesis. The real genesis must wait for the fixed escrow.**

## Phase 9 (continued) — IN-01 fix: first attempt WRONG on-chain, corrected fix verified (2026-11-15 08:23–08:40)

**The count-form fix FAILED on testnet.** The applied fix (`require(OpCovInputCount(OpInputCovenantId(this.activeInputIndex)) == 1)`, both the nested form hash `9fb49e51…` and the two-line form hash `b37aa685…`) compiles cleanly but the node rejects EVERY escrow spend: accept (tx `f37cc9a2…`) and cancel (tx `4456a4fb…`) both failed "script ran, but verification failed". Root cause (two parts): (1) the escrow output is NOT covenant-bound — the offer creates a plain P2SH with no covenant id, so `OpInputCovenantId` returns no usable id and the count is 0, not 1; (2) even if bound, offers are independent coins — each offer's covenant id derives from its own funding outpoint, so two identical offers have DIFFERENT ids and a count could never group them. The documented count pattern (kaspa-agent-notes 04 §4) is for a shared lineage, not for independent one-shot coins. **Cost: offers A (`5b4fd5b3…`), B (`46206456…`), A2 (`3eab8bdb…`) were created with the broken escrow code and are bricked — 3 × 2.1 KAS = 6.3 TKAS of key1's testnet funds locked forever (their code rejects every entry). Testnet-only, valueless.**
**Corrected fix (no covenant id needed):** `expire` binds the refund to the input's own output index — `tx.outputs[this.activeInputIndex]` instead of `tx.outputs[0]` (value + scriptPubKey). Each escrow input needs its own refund output at its own index, so a second escrow can only be spent by paying its refund too. `accept` requires the escrow to sit immediately after its edition input — `require(this.activeInputIndex == editionInIdx + 1)` after `editionInIdx` is computed. Only one input index can equal `editionInIdx + 1`, so a second escrow in the same tx always fails. Holds for standalone accept `[edition, escrow]` and combined `[buyEd, buyFund, accEd, escrow]`. `cancel` needs no fix (only the offerer signs; it is their own money). New escrow template hash `07362054dd16fee6f0e8b44d69540dd8849b9f397e97ed7c3426641b99be007f` (bytecode 1433 B, span 161); edition `9106b142…` and factory `029512ea…` unchanged. Both the v13-fixed source and the FINAL file carry it and compile to the same hash (verify-contract.js PASS).
**Testnet re-test, all with the corrected escrow (hash `07362054…`):**
- Accept `36da12a56189563bc340e6e21e8a751ec4414a70e901bfd75168c76e70951dfe` (ownerNet 190M, royalty 10M) ✓
- Cancel `fcdb2a88c778449138156d30fda2ea9d68b9d062469e9ca3b742d8627796c0e6` (210M refunded) ✓
- Expire `d442438379add21e1fed36056ea4149d9c55402cfa81f7c175c72dc71394abeb` (210M refunded, expireAge=10) ✓
- Identical offers D (`b42ef78a…`) and E (`eead67cd…`, same spk) expired individually: `9d77a2a9…` and `254fcaa5…` (210M each) ✓ — the fix does not brick honest expire for identical offers.
- List ed0 `f7b5b68d…`, offer F `8ef6660a…`, combined buy+accept `e1b953c3f7cdd0980ef8debb05d524b32c9c8c8c1ac17b2f0a827652be7ec0db` (4 inputs, 1 escrow) ✓ — the adjacency fix does not break the multi-input combined flow.
**Redteam run 3 (fixed escrow + baseline `baseline-in01-fixed.json`, 6 honest txs): PASSED — 0 FINDINGS.** All 7 attacks survived; **IN-01: 6 attempts rejected.** The tool that found IN-01 now confirms it is gone. Note: the on-chain attack-tx construction step was dropped from this re-test; verification is via the redteam re-run (the tool's own IN-01 attempts against the fixed escrow's real spends). Coverage limits remain: factory/escrow standalone paths still unexplored by search; FAM attacks still untested (args mismatch). The escrow is now `07362054…` — the real genesis must use this hash, not `8eff7679…` or `9fb49e51…` or `b37aa685…`.
