# Follow-up for Claude — Reliks IN-03 (escrow) — 2026-11-15

This is a follow-up to your IN-03 verdict (relayed 2026-11-15 09:13). You were
right on every point. IN-03 is real, it was proven on-chain, the candidate
fix is adopted and verified, and the FAM attacks cannot run with this tool.
The three contract files attached here are the current ones; only the escrow
changed. Full detail is in `AUDIT-VERIFY-20261114.md` (phase 10).

## 1. IN-03 confirmed on-chain (your analysis was exact)

Setup (testnet-10, all my own keys/assets, no victim):
- Serial 2 transferred to key1 and listed at 2 KAS (E).
- Expired offer X: key1, ask 200M, expireAge=10, locked 210M, on serial 3.

Attack tx **`95a1a2e4d1ff270a8937eeb7c209a2ab4c997f96b2818fe2e99b0cde895da577`**
(block `b3fc5193…`, DAA 623854940) **ACCEPTED**. The buyer (key2) paid only the
10M royalty + fee and took serial 2; key1's own 210M refund covered the 190M
ownerNet (the edition's `checkPayments` owner slot at index 1 uses a `>=`
check, verified in source). Key1 lost the edition and got back only their own
locked funds + the 10M royalty. Script:
`audit-test/v13-fixed/in03-attack-fixed.js` (inputs `[E, X, F]`, outputs
`[E', refund, royalty, change]`).
Note: key2 needed a 500M top-up from key1 first (its largest UTXO was 190M,
below the 210M offer lock; fund tx `6c291ddf…`).

## 2. The fix adopted — new escrow hash `18e3d59a…`

Your candidate compiled cleanly in silverc 0.1.0. I diffed it against the
`07362054…` escrow first: the only changes are the header update and the one
line `require(tx.inputs.length == 2);` in `expire`. Nothing else touched.

New escrow template hash:
`18e3d59aa9403539ccb8bd04ef2c9c81fe21f0602f3ff55e9e6f0ce375d17a2b`
(bytecode 1437 B, state span 161). Edition `9106b142…` and factory
`029512ea…` are UNCHANGED. Adopted into both
`audit-test/v13-fixed/OfferEscrow-v6-fixed.sil` and the FINAL escrow file
(they are byte-identical; the FINAL file still says `final_3` in its name
but its contents are the IN-03 fix). `out/escrow.json` regenerated,
`TEMPLATE-HASHES.json` updated, `verify-contract.js` PASS
("CONTRACT RECOMPILE OK").
**Do NOT use `07362054…` (IN-03), `8eff7679…`, `9fb49e51…`, or `b37aa685…`.**

## 3. Honest flows re-run on the new escrow (`18e3d59a…`) — all SUCCEEDED

- Cancel `72554ee76f86b28a0721c6a96a67914881b6e33a765c93031419b8a04cc09c0c`
  (210M refunded) ✓
- Accept `de44cb3f560300b0607a47f60cda9190488375c63be97f5bd29bcdb841b3e8b8`
  (ownerNet 190M, royalty 10M) ✓
- Expire `324c0da0d4b8c077c09938d78279e95d401385e119a4cc4186a977057a78b39a`
  (210M refunded) ✓
- Identical offers D (`a66fa8a2…`) and E (`c43fdf2d…`, same spk) expired
  individually: `52e4326f…` and `ba4e548e…` (210M each) ✓ — every honest
  expire is exactly `[escrow, funding]` (2 inputs), as you required.
- Combined buy+accept
  `b426b9f604ad6671f0b1b48549ad6c3c5c8a1de66dd865adf35b7bd33bf27356`
  (4 inputs, 1 escrow) ✓ — the length check is only in `expire`, not
  `accept`, so the multi-input combined flow is unaffected.

## 4. Redteam re-run (run 4) — PASSED, 0 findings

Same tool (kaspa-redteam v0.17.2), fixed escrow, new baseline
(`baseline-in03-fixed.json`: the IN-03 attack tx + accept, cancel, expire,
combined, expire-d, expire-e — 7 honest txs, consensus accepts all as
fetched). Result: **7 attacks run, 7 survived, 22 skipped, PASSED:
0 FINDINGS. IN-01: 8 attempts rejected.**
Caveat, as you flagged: the tool has no named IN-03 (cross-contract
output-collision) attack, so this run alone does not prove IN-03 is closed.
The direct proof is §5.

## 5. IN-03 rejection proven on-chain (direct)

Fresh scenario with the NEW escrow: serial 1 transferred to key1 and listed
at 2 KAS (E); expired offer X2 (key1 on serial 0, ask 200M, expireAge=10,
locked 210M, new escrow). The same attack shape was **REJECTED** by the node:
tx `7579243d89c475d7f9373eca6d1c1096cc8f6dff631a74af0b3257cf05c31316` —
"failed to verify the signature script: script ran, but verification failed".
The `require(tx.inputs.length == 2)` kills the 3-input tx. **IN-03 is closed.**

## 6. FAM (family/mint-power) attacks: cannot run — tool limitation

You asked me to fix the args and rerun them before the escrow goes live.
I tried both forms:
- A per-contract JSON (`{SeriesFactory: {...}, ReliksEdition: {...},
  OfferEscrow: {...}}`) — the tool rejects it outright ("a constructor value
  must be a number, true/false or a string, not {...}").
- A 5-name shared args file (only the names all three contracts have:
  init_program_hash, init_artist, init_price, init_royalty_bips,
  expected_template_hash) — run 5, `--only FAM`: **NOTHING TESTED in every
  section, 0 attacks run.** The edition is not a partner (it lacks
  `expected_template_hash`), the escrow is not a partner (it lacks
  `init_price`), and the factory compiled from those args doesn't match the
  deployed instance (the shared file omits engine_code, mints_left, etc.).
The three contracts share only TWO ctor param names (init_artist,
init_royalty_bips), so no single flat args file can instantiate all three
correctly, and the search can't build a factory mint spend from the .sil
alone (it needs a lane UTXO + engine code). **FAM is untestable with
kaspa-redteam v0.17.2.** Family/mint-power coverage therefore rests on the
hand-written negatives (all PASSED): decoy mint (the M4 checker rejects it),
fork double-mint across lanes REJECTED, mint with wrong next_serial REJECTED,
mint with royalty 499 REJECTED, fork with a lane under 1 KAS REJECTED —
plus your static review. You noted you can't judge FAM either, since you
don't know what the attacks do.
The other hand-written negatives from your list (expire+factory mint,
accept+expire, mint+buy as separate tests) were not run; expire+buy is
IN-03 (proven + fixed above). The redteam's standalone search never explored
the factory's or escrow's own paths in any run.

## 7. What I need from you

- Review the adopted fix (§2) and confirm it closes IN-03 without breaking
  any honest flow.
- Confirm the escrow hash for the real genesis is `18e3d59a…`.
- Say whether the FAM limitation (§6) blocks the genesis, or whether the
  hand-written negatives + your static review are enough cover for the
  family/mint-power surface.

Redteam artifacts: `~/workspace/redteam-findings/` (`run4-full.txt`,
`run5-fam.txt`, `baseline-in03-fixed.json`, `baseline-in01-fixed.json`).
