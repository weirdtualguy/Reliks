# Reliks v13 session handoff (for a new chat)

Date: 2026-09-30. Owner: Amin (solo dev, Kaspa ecosystem, Android only: Termux + Acode + Kiwi; "vibe coder").
Repo: github.com/weirdtualguy/Reliks. Local dir: `~/pixel-cove` (old name). Branch: `v13-lineage`, **local only, nothing pushed**. `main` = 7159269, untouched. Mainnet = one sold-out v12 edition, untouched.

## How Amin wants answers
- Terse, answer first, no filler, no flattery. One definitive recommendation, not option menus.
- Everything he runs is a Termux command block he pastes; he pastes output back. If context is missing, say exactly which lines/files to paste; never guess.
- Never claim something works that was not run. Say plainly what is tested vs unverified. Own mistakes.
- Termux quirks: no `/tmp` (use `$TMPDIR`); browser downloads land in `~/storage/downloads` (file lookups by glob often fail, so prefer heredocs or tell him to save from the file card into the repo with Acode); python3 3.13 and node 26 exist; `silverc` is at `~/bin/silverc` (`silverc SRC.sil --ctor ARGS.json -o OUT.json`). Testnet wallet `kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd` (thousands of TKAS, key in gitignored `secrets.env`; defaults to testnet). Second test key: `v13/key2.env` (gitignored), address `kaspatest:qrzys5skaeerlmew6p30ysx88mlxullxgd4g8un0y7qrzpfk55mnzfzyjtmav`.
- The pre-commit audit hook ("Qwen bridge") has been offline on every commit: no audit has run on any v13 commit.

## What v13 is
Living editions: edition state gains `lineage` (byte[32]) and `sales` (int); art renders from `(serial, lineage, sales)` via the Reliks-VM.
- State: 8 v12 fields + `lineage`, `sales`; edition span 161 -> 203. Factory span stays 135, escrow 161.
- Domain tags in code: `ReliksGenesisV2`, `ReliksLineageV2`. (`v13/reliks-v13-spec.md` still says `...V13`; docs are stale, code is right.)
- Route rules: list/unlist copy both fields. **transfer**: advances lineage, sales unchanged (decision made this session; conflicts with spec mitigation 3 "transfer advances nothing", so owners can re-roll patina for one fee; judged small because buyers can grind offline anyway; spec text still needs updating). buy/sell(price>0)/escrow accept: lineage' = blake2b("ReliksLineageV2"+lineage+newOwner), sales+1. Zero-price sell removed (use transfer). Mint: lineage = blake2b("ReliksGenesisV2"+laneTxId+le32(laneIndex)), sales 0.
- Free `transfer` still bypasses royalties (no contract can prevent it); docs do not say so yet.
- Edition dispatch tags are unchanged from v12 (buy 1cd4096a, list 674a8ea4, sell 89cfc99a, spend bf4a1660, transfer 794dca54, unlist 88709f25; factory mint b781beeb).
- **Escrow needed a v6.** OfferEscrow-v5 computes and validates the next edition state itself, so it was rebuilt (`v13/OfferEscrow-v6-draft.sil`). Any edition template change forces: recompile edition -> regenerate factory args + recompile factory -> regenerate escrow args + recompile escrow -> redeploy on a fresh ledger.

## Verified on testnet-10 (with the final contracts)
Mint with genesis lineage; list/unlist; transfer (main->key2, key2->main signed by key2); buy same key and distinct keys; sell; escrow accept; negative tests (buy skipping the sales advance, skipping the lineage advance, transfer skipping the lineage advance: all rejected by script). `v13/verify-chain.js` recomputed the lineage chain off-chain and matched all three on-chain scripts.
**Not tested:** `spend` (burn), a negative test on escrow accept, real-wallet/browser flows, anything on mainnet.

## Reliks-VM
- `v13/vm/`: spec (rev 2, `v13/RELIKS-VM-SPEC.md` + HTML draft), `rvm.js`, `rvm.py`, vectors, DAG-City port (`dagcity.py`), and **`dagcity_wear.py`** (clean port + wear wash).
- JS and Python interpreters agree (handoff checks: 105 JS checks; 300-serial sweep; this session: 36-case grid on the wash program). Same author/spec, so a **third implementation** is still the strongest remaining evidence.
- The factory already accepts raw engine bytes: `engine_code` = VM program, `engine_lang` = 1, `program_hash` = blake2b(program) (enforced on chain). **No contract change was needed.** `v13/gen-vm-factory-args.js` builds args (`PROG_HEX_FILE=<hex file>` for a custom program).
- Deployed on testnet: VM series with the plain clean DAG-City port (program hash `cf1f1e60a7381496...`, 1,567 B), ledger `v13/ledger-vm-v13.json`, edition at sales 1. Factory bytecode 11,894 B (vs 16,464 B with the JS engine).
- Public indexers do not expose covenant-tx sigscripts, so `v13/verify-vm-render.js` proves the program by **hash commitment** (rebuilds the lane and edition P2SH scripts from template + state and matches kascov UTXOs) then renders with both interpreters. It does not fetch the bytes back from chain.
- Wear, as found: the original clean port only fades window lights (`90 - min(wear,50)`), barely visible. Added a **wash**: paper-colour veil (0xe7dfc8) over the city before the glow, opacity = `3*(wear>0) + K - floor(K*(255-w)^3/255^3)`, K = cap-3; skipped at wear 0 (wear-0 render hash unchanged: 9bd989c4...).
  - 50% cap (program 800749f7..., 1,624 B): Amin judged wear 255 too washed.
  - 30% cap (program 83483079..., 1,631 B, what `dagcity_wear.py` currently holds and what is committed): **still too washed**.
  - **Pending decision:** Amin was about to compare caps 10/14/18/22 at wear 255 (`reliks-cap{N}-255.svg`; variants made with `sed "s/push 27 mul/push $K mul/; s/push 27 swap sub/push $K swap sub/"`, K = cap-3). My guess was 14-18%. After he picks: set the constants in `dagcity_wear.py`, regenerate hex, rerun `node v13/cross-check-wear.js` (expect 0 mismatches), generate args (`PROG_HEX_FILE=v13/dagcity-wear.hex node v13/gen-vm-factory-args.js data/series-testnet-v12.json v13/factory-args-vm2-v13.json`), compile the factory (`silverc v13/SeriesFactory-v13-draft.sil --ctor v13/factory-args-vm2-v13.json -o v13/out/factory-vm2-v13.json`), then deploy/mint/list/buy on a new ledger and run the verifier:
    `export RELIKS_FACTORY_ABI=v13/out/factory-vm2-v13.json RELIKS_ARGS=v13/factory-args-vm2-v13.json RELIKS_ENGINE=$PWD/v13/vm-engine-shim2.js RELIKS_LEDGER=v13/ledger-vm2-v13.json` then `node v13/deploy-v13.js`, `mint-v13.js`, `secondary-v13.js list 0 200000000`, `secondary-v13.js buy 0`, `node v13/verify-vm-render.js 0`.
  - Visual judgement is Amin's; SVGs cannot be rasterized in the sandbox.

## Tooling map (`v13/`)
- Generators (testnet-only output guards): `make-v13-scripts.js` -> `deploy-v13.js`, `mint-v13.js`, `secondary-v13.js` (commands: list, unlist, transfer <pubkey>, buy, sell; env `NEG=sales|lineage` makes a deliberately wrong advance for negative tests); `make-v13-escrow.js` -> `OfferEscrow-v6-draft.sil`, `escrow-args-v6.json`, `offer-v13.js`, `accept-v13.js`. Re-run both generators after editing them.
- Contracts: `ReliksEdition-v13-draft.sil`, `SeriesFactory-v13-draft.sil`, `OfferEscrow-v6-draft.sil`. Compiled outputs in `v13/out/` (gitignored; `v13.json` = edition ABI, also committed as `data/edition-abi-v13.json`).
- Checks: `verify-chain.js`, `verify-vm-render.js`, `cross-check-wear.js`, `test/v13-codec-test.js` (in `npm test`).
- Applied one-shot patchers (do not rerun): `apply-transfer-lineage.js`, `apply-web-v13.js`, `patch-lib-confirm.js`.
- Gitignored/local: ledgers (`ledger-*.json`, `escrow-ledger-*.json`), `key2.env`, generated `*-v13.js`, `out/`, hex/shim files.

## Other repo changes on the branch
- `reliks-lib.js` `waitForConfirmation`: added a wallet-UTXO layer (plain-P2SH escrow offers are never indexed by REST/kascov, which made offers "time out" although mined). Additive; safe candidate to cherry-pick to `main` separately (it also helps v12 flows).
- `web/reliks-chain.js` + `reliks-templates.js`: codec picks the 10-field edition layout when the loaded template has a `lineage` field; default stays v12. `genesisLineage`, `advanceLineage` exposed. `docs/index.html` regenerated via `npm run site` (the site test enforces no drift; merging redeploys the page).
- Deliberately NOT changed: `web/site-app.js`, `web/reliks-gallery-runtime.js` (v12-only; they fail closed on a v13 edition).
- Commit trail (known hashes): e28a0d4 v13 base, cd5ae7a unlist/transfer builders, de73bab generators wait, ec30218 lib confirm, 02e8820 web codec, 206ca10 VM series + verifier, then the commit holding `dagcity_wear.py` (30% wash) and this handoff.

## Known quirks
- Ledger `spk` values are `hex(p2sh(...))` where `p2sh` already returns hex (double-encoded); harmless, consistent with the v12 drift check.
- `feeLoop` retries on fee rejections only; script failures throw immediately (that is how the negative tests show up).
- First mint attempts are often rejected for fee and retried automatically.
- kascov `/c/<covenantId>.json` lists covenant UTXOs with `script_hex` (used for commitment checks); its `/tx/<id>.json` has no sigscripts; REST `/transactions/<id>` 404s for covenant txs and plain-P2SH offers.

## Open items, in recommended order
1. Pick the wash cap, rebuild, mint and verify the wash series on testnet (steps above).
2. Site VM rendering: `rvm.js` in the browser, render path chosen by `engine_lang`, v13 codec in `site-app.js` and the gallery runtime. Nothing user-visible exists until this is done.
3. Third VM implementation (independent of the JS/Python author's reading of the spec).
4. Update docs: spec tags (V2), transfer rule and royalty-bypass statement, grinding note.
5. Escrow: negative test on accept; collection-wide offers (match `factory_covid`), reserved-buyer and timed listings (not started).
6. Design, not started: covenant-ID owners (open hole: what script a covenant owner is paid to in `checkPayments`), splits/recursive royalties, fusion, DAG-native inputs, Dutch auction (lane age resets on every mint: needs a readable clock), EngineVault, KCC20 payments.
7. Browser buy/sell/offer flow and a real launch series; repo cleanup of raw audit dumps (~1.4 MB).
8. Before any `git push` of this branch: decide whether v13 design docs should be public; then decide merge strategy (cherry-pick the lib fix first).

## Answers already given on the external feature list
Implemented: #1 living provenance (testnet), zero-price sell removed, partial codec/engine-size improvements. Not implemented: fusion, recursive royalties, DAG-native art, Dutch auctions, EngineVault, covenant-ID ownership, KCC20 payments, better offers, browser market, audit-dump cleanup.

## Addendum (end of session)
- Commits after 206ca10: 2523e1f "standalone browser demo generator (Reliks-VM render from ledger)" and its script `v13/gen-demo-v13.js` were added by a different chat; contents NOT reviewed here. Its output `v13/demo-v13.html` is untracked and left in place on purpose. 56c9b70 holds `dagcity_wear.py` (30% wash cap, still being tuned), custom-program factory args, `cross-check-wear.js` and `fund-key2.js`.
- A stray untracked copy of the OLD 50%-cap `dagcity_wear.py` sits in `v13/` (the real one is `v13/vm/dagcity_wear.py`); left in place on purpose.
- Ignored on purpose: apply-transfer-lineage.js, apply-web-v13.js (one-shot, already applied), __pycache__.
- Cap decision is still open: Amin was comparing wear-255 renders at caps 10/14/18/22 (guess: 14-18%).
