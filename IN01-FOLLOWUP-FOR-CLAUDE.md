# Follow-up for Claude — Reliks IN-01 (escrow) — 2026-11-15

This is a follow-up to your final verdict (relayed 2026-11-15 06:54: fixed C1/H1/M1/M2,
open by design M3/M4/N1/N2, decoy-mint grief accepted, launch price >= 1 KAS).
Since that verdict, kaspa-redteam v0.17.2 found one new HIGH, it was fixed,
the first fix attempt failed on-chain, and the corrected fix is verified.
The three contract files attached here are the current ones; only the escrow changed.

## 1. The new finding: IN-01 on `expire` (HIGH, replay-confirmed)

Tool: kaspa-redteam v0.17.2, judge = rusty-kaspa consensus validator 2.1.0
in process. Run on the three FINAL files as one project, real deployment args
(price 2 KAS, royalty 500 bips, mints_left 4, next_serial 0), with baselines
fetched from chain (mainnet mint/list/buy + testnet-10 mint/accept/cancel/
expire/fork/combined).

`expire` checked `tx.outputs[0].value == tx.inputs[this.activeInputIndex].value`
and `tx.outputs[0].scriptPubKey == offererSpk`, but never checked how many
inputs spend this escrow. Two identical escrows (same offerer, same terms,
same 2.1 KAS locked value) spent together are both satisfied by the SAME
refund output; the second coin's 2.1 KAS is surplus the tx builder routes to
themselves. Attack tx (from the finding file): 3 inputs, outputs = 2.1 KAS to
the offerer + ~3932.97 KAS change + 2.1 KAS to the attacker.
Replay: `kaspa-redteam replay …/IN-01.json` → "REPRODUCES IN-01 on
`expire (imported)` tx `94ce86b20e9296731da699b2fcd15d82c9a0caca2f7c5b16306cefbb53acc078`
(consensus accepted, fee 3000000 sompi)".

Preconditions: the same offerer holds two identical live offers (double-tap /
retry after a timeout), both expired. `expire` is permissionless, so anyone
can do it. Victim: the offerer loses one 2.1 KAS refund per pair.
The same shape exists in `accept` (exploitable only by the edition owner /
seller, who signs it). `cancel` has the shape too but is harmless — only the
offerer can sign it, and it is their own money.
This was NOT in your audit (C1/H1/M1–M4/N1–N3).

Rest of that run: 6 of 7 attacks on the real transactions were rejected
(FEE-01, IN-02, OUT-01..04); the edition's SIG-01/SIG-02 survived.
Coverage limits: the factory's and escrow's own paths were unexplored by the
tool's search, and the FAM (family/mint-power) attacks were untested
(args mismatch) — so this is one confirmed finding plus partial coverage,
not a full clean bill.

## 2. First fix attempt: WRONG — failed on-chain (do not use)

Applied fix: `require(OpCovInputCount(OpInputCovenantId(this.activeInputIndex)) == 1)`
in each escrow entry (nested form, escrow hash `9fb49e51…`; then the two-line
form, hash `b37aa685…`). It compiles cleanly in silverc 0.1.0, but the node
rejects EVERY escrow spend: accept tx `f37cc9a2…` and cancel tx `4456a4fb…`
both failed "script ran, but verification failed".

Why it fails (two parts):
- The escrow output is NOT covenant-bound. The offer creates a plain P2SH
  with no covenant id, so `OpInputCovenantId` returns no usable id and the
  count is 0, not 1.
- Even if bound, offers are independent coins. Each offer's covenant id
  derives from its own funding outpoint, so two identical offers have
  DIFFERENT ids and a count could never group them.
The documented count pattern (kaspa-agent-notes 04 §4) is for a shared
lineage, not for independent one-shot coins.

Cost: offers A (`5b4fd5b3…`), B (`46206456…`), A2 (`3eab8bdb…`) were created
with the broken escrow code and are bricked — 3 × 2.1 KAS = 6.3 TKAS of
testnet funds locked forever (their code rejects every entry).
Testnet-only, valueless. Do NOT use hash `9fb49e51…` or `b37aa685…`.

## 3. Corrected fix (verified) — escrow hash `07362054…`

No covenant id needed. Two targeted changes, both in
`OfferEscrow-v6-fixed.sil` (and identically in the FINAL escrow file):

- `expire`: the refund must sit at the output index matching this escrow's
  input index — `tx.outputs[this.activeInputIndex]` instead of
  `tx.outputs[0]` (value + scriptPubKey). Each escrow input needs its own
  refund output at its own index, so a second escrow can only be spent by
  paying its refund too.
- `accept`: the escrow must sit immediately after its edition input —
  `require(this.activeInputIndex == editionInIdx + 1)` right after
  `editionInIdx = OpCovInputIdx(edition_covid, 0)`. Only one input index can
  equal `editionInIdx + 1`, so a second escrow in the same tx always fails.
  Holds for standalone accept `[edition, escrow]` and for the combined
  buy+accept `[buyEd, buyFund, accEd, escrow]`.
- `cancel`: no fix needed (offerer-only, own money).

New escrow template hash:
`07362054dd16fee6f0e8b44d69540dd8849b9f397e97ed7c3426641b99be007f`
(bytecode 1433 B, state span 161). Edition `9106b142…` and factory
`029512ea…` are UNCHANGED. Both the v13-fixed source and the FINAL escrow
file carry the fix and compile to the same hash (`verify-contract.js` PASS).

## 4. Testnet re-test, all with the corrected escrow (`07362054…`)

- Accept `36da12a56189563bc340e6e21e8a751ec4414a70e901bfd75168c76e70951dfe`
  (ownerNet 190M, royalty 10M) ✓
- Cancel `fcdb2a88c778449138156d30fda2ea9d68b9d062469e9ca3b742d8627796c0e6`
  (210M refunded) ✓
- Expire `d442438379add21e1fed36056ea4149d9c55402cfa81f7c175c72dc71394abeb`
  (210M refunded, expireAge=10) ✓
- Identical offers D (`b42ef78a…`) and E (`eead67cd…`, same spk) expired
  individually: `9d77a2a9…` and `254fcaa5…` (210M each) ✓ — the fix does
  not brick honest expire for identical offers.
- List ed0 `f7b5b68d…`, offer F `8ef6660a…`, combined buy+accept
  `e1b953c3f7cdd0980ef8debb05d524b32c9c8c8c1ac17b2f0a827652be7ec0db`
  (4 inputs, 1 escrow) ✓ — the adjacency fix does not break the
  multi-input combined flow.

Note: the on-chain attack-tx construction step was dropped from this re-test;
verification of the fix is via the redteam re-run below (the tool's own
IN-01 attempts against the fixed escrow's real spends).

## 5. Redteam re-run (run 3) — PASSED, 0 findings

Same tool, same project, fixed escrow, new baseline
(`baseline-in01-fixed.json`: accept, cancel, expire, combined, expire-d,
expire-e — 6 honest txs, consensus accepts all as fetched).
Result: **7 attacks run, 7 survived, 22 skipped, PASSED: 0 FINDINGS.**
**IN-01: 6 attempts rejected.** The tool that found IN-01 now confirms it
is gone. The standalone-search coverage limits from §1 still apply.

## 6. What I need from you

- Review the corrected fix (§3) — especially the `accept` adjacency check
  and the `expire` index binding — and confirm it closes IN-01 without
  breaking any honest flow.
- Confirm the escrow hash for the real genesis is `07362054…` (not
  `8eff7679…`, `9fb49e51…`, or `b37aa685…`).
- Flag anything else the redteam's partial coverage leaves open (factory /
  escrow standalone paths, FAM attacks) before the real genesis.

Full detail (all phases, tx ids, ledgers) is in
`AUDIT-VERIFY-20261114.md` (phase 9). Redteam artifacts:
`~/workspace/redteam-findings/` (`run2-full.txt`, `run3-full.txt`,
`baseline-mainnet.json`, `baseline-testnet10.json`,
`baseline-in01-fixed.json`, `baseline-mainnet.json + baseline-testnet10/IN-01.json`).
