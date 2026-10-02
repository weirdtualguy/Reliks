# Reliks Infrastructure: handoff for the next AI

Written 2026-10-02. Read this first. Then run `cd ~/pixel-cove && cat STATE.md && sh tools/ctx.sh`.
Facts below come from commands the owner ran and files he pasted. Anything not seen is marked **(unverified)**. Do not fill gaps by guessing. Ask for exact lines instead.

## 0. Mission

Reliks is IPFS-free NFT infrastructure on Kaspa covenants. The artwork is a deterministic program. Its hash is committed in the contract. Anyone can re-render an edition from public chain data and check that the hash matches.

**Decision on 2026-10-02:** the owner cannot afford to build or run a marketplace. Reliks becomes **infrastructure that anyone can build their own marketplace on**. It must be robust and complete: a spec with conformance vectors, an SDK (read and write halves), contract templates, creator tooling, integrator docs, tests, and an independent audit before any "production" claim. The existing static site is the reference marketplace. Do not build new marketplace features.

## 1. The owner and how to work with him

- Amin. Solo developer, Android phone only: Termux (CLI), Acode (editor), Kiwi (browser). Relies heavily on AI assistance ("vibe coder").
- No VPS, no own node, no budget for infrastructure. Testnet coins are free. Mainnet costs real KAS.
- Output rules he set: surgical precision, no filler, no preambles or wrap-ups, lead with one definitive recommendation, no equal-option menus unless trade-offs depend on context you lack, make reasonable assumptions and note them only if they change the outcome. If code context is missing, say exactly which lines or files to paste. Do not guess.
- Phone screen: keep answers about one screenful. Commands must paste cleanly into Termux (`sed -n A,Bp`, `grep -n`, small heredocs).
- **Never ask for or accept private keys.** A testnet private key was pasted into a chat on 2026-10-01. Treat it as burnt, do not use it, and tell the owner to rotate it if any wallet that matters shares it.
- Before any step that signs or broadcasts: show the exact command and the spend first, back up the ledger first, and use the `RELIKS_*` variables so the right series is touched.
- Wait about 2 minutes after a mint or sale before `verify-vm-render.js` (kascov lag).
- Commit with explicit `git add <files>`. Never `git add -A`. The pre-commit hook prints "Qwen bridge offline. Skipping audit." when its bridge is down, so those commits are unaudited.
- Generated files carry a "GENERATED ... Do not edit" header. Edit the generator, then regenerate.
- Mark every unconfirmed claim as unconfirmed. He prefers "I haven't seen X" over a confident guess.

## 2. Architecture (what exists)

**Contracts (Silverscript, `.sil`, compiled with `silverc`):** `v13/SeriesFactory-v13-draft.sil`, `v13/ReliksEdition-v13-draft.sil`, `v13/OfferEscrow-v6-draft.sil`. All three are drafts. Compiled ABIs: `v13/out/v13.json` (edition template, shared by every series), `v13/out/escrow-v6.json`, and one factory ABI per series.

**Lane and editions:**
- A factory covenant holds a "lane" output (carrier 1 KAS, `CARRIER = 100000000n`). Each mint spends the lane, creates an edition output and a new lane output, and pays the artist cut (the series price).
- Edition state fields: `ownerIdentifier`, `identifierType` (0 = x-only pubkey), `price`, `artist`, `royalty_bips`, `program_hash`, `factory_covid`, `serial`, `lineage`, `sales`.
- Entrypoint tags seen in scripts: edition `buy`, `unlist`, `transfer` (list and sell exist in `secondary-v13.js`); escrow `accept`. Factory `mint`. Full entrypoint list **(unverified)**: read the `.sil` files.
- Series config (from `data/series-*.json` shape): `artist` (64-hex x-only), `price` (0 or at least 1 KAS), `royalty_bips` (1..2000), `mints_left` (at least 1).

**Serial and lineage (derived in `v13/mint-v13.js` and `secondary-v13.js`):**
- serial = blake2b-256("ReliksSerialV10" || txid || index as LE32), taken as a 63-bit integer.
- genesis lineage = blake2b-256("ReliksGenesisV2" || laneTxId || LE32 index).
- next lineage = blake2b-256("ReliksLineageV2" || lineage || H(newOwner)).
- `sales` increments on `buy` and escrow `accept` only. `transfer` advances lineage but not sales.
- seed = serial mod 2^32 (gate L5).

**Reliks-VM (art program):**
- A small deterministic stack machine renders SVG from `lanes`, `serial`, `pat` (from lineage) and `wear` (sales, capped at 255).
- Two independent interpreters must agree byte for byte: `v13/vm/rvm.js` (252 lines) and `v13/vm/rvm.py` (509 lines).
- Hard limits in `rvm.js`: FUEL 1,000,000; STACK 256; CALL 64; ELEMS 10,000; SEGS 2,048; SVG 1 MiB; MEM 1,024; GROUP 4; GRAD 8; STOP 8.
- The program bytes are baked into the factory template by `silverc --ctor`. `engine_lang` is 1 for the VM. `program_hash` is the blake2b-256 of the program bytes.
- Spec: `v13/RELIKS-VM-SPEC.md` and the HTML spec in `v13/` (draft, **unread by me**). Vectors: `v13/vm/gen_vectors.py`.

**marks3 program** (`v13/dagcity_marks3.py`, `v13/dagcity-marks3.hex`, 1745 B): the DAG-City clean port plus one small mark per sale, positioned from an xorshift32 stream seeded by lane 4 and the serial (never lineage or wear), so the first n marks are identical at every wear of at least n. The first 10 marks are drawn at 5x scale. The lineage-driven roof recolour ("patina") was removed.

**Mainnet site (v12):** static GitHub Pages at `https://weirdtualguy.github.io/Reliks` (repo `weirdtualguy/Reliks`, branch `main`). Gallery, Studio, Protocol tabs. Reads chain data through kascov. Wallet: Kaspire (extension or mobile via WalletConnect). Footer says "not audited". The v12 engine is a 3,888-byte JS engine (not the VM). Nothing from v13 is deployed there.

## 3. State as of 2026-10-02

| Series | Network | Details |
|---|---|---|
| Genesis: DAG-City (v12) | mainnet | Sold out. Browser mint code exists in `web/site-app.js`. Browser broadcast **never confirmed by a stranger** (see section 5). |
| VM series A | testnet-10 | DAG-City clean port, 1567 B, program_hash `cf1f1e60...`. 3 editions (sales 1, 3, 0), 5 mints left. Ledger `v13/ledger-vm-v13.json`. |
| VM series B (marks3) | testnet-10 | Lane covenant `ca4f4820...`, genesis tx `4fef24e9...`, program_hash `ce0f4fc0...`, price 1 KAS, royalty 500 bips (5%), artist key `ec7a4c67...`, 8 editions total. 1 minted (edition `c39e6533808b6d00...`), now at sales 2, owned by the operator key (`33fe25d1...`). 7 mints left. Ledgers: `v13/ledger-marks3-v13.json`, `v13/escrow-ledger-marks3-v13.json`. |

Verified on chain for series B: mint, list, buy, escrow offer, escrow accept. JS and Python renders MATCH at wear 0, 1 and 2 (hashes `7c36f36e...`, `c4b051e1...`, `8ef8789f...`). Escrow negative test: an accept that underpays the seller by 1 sompi was rejected by two public nodes ("script ran, but verification failed"). Not tested: negative cases for the royalty output, the edition output, `NEG=sales|lineage` on mainnet-class paths, spend/burn verification.

**Git:** branch `v13-lineage` is local only (never pushed). `main` is the published site. Known recent commits: `cec901a` (marks3 program), `6f7acc9`, `ccf40a2` (state checkpoints). Later checkpoint commits may exist; run `git log --oneline | head`.

## 4. Commands you will need

Session start: `cd ~/pixel-cove && cat STATE.md && sh tools/ctx.sh && sh tools/check.sh`.

marks3 series exports (run in the same shell as the scripts):
```
export RELIKS_FACTORY_ABI=v13/out/factory-marks3-v13.json RELIKS_ARGS=v13/factory-args-marks3-v13.json RELIKS_ENGINE=$PWD/v13/vm-engine-shim3.js RELIKS_LEDGER=v13/ledger-marks3-v13.json RELIKS_ESCROW=v13/escrow-ledger-marks3-v13.json RELIKS_HISTORY=v13/history-marks3-v13.json
```
Signing steps: `read -rs -p "PC_PRIV: " PC_PRIV; echo; export PC_PRIV`, run the script, then `unset PC_PRIV`. `PC_WALLET` must match the key (the lib checks this and also loads `secrets.env`).

Scripts: `node v13/secondary-v13.js list|buy|unlist|transfer|sell <edition> [price|pubkey]`, `node v13/offer-v13.js <edition> <ask>`, `node v13/accept-v13.js`, `node v13/mint-v13.js`, `node v13/deploy-v13.js`.

Read-only scripts (`verify-vm-render.js`, `gen-demo-v13.js`, `fetch-history.js`) need only a throwaway key. See `v13/SESSION-HANDOFF-v14.md` lines 18-20 for the prefix.

Verify: `node v13/verify-vm-render.js 0`. Programs: `PROG_HEX_FILE=<hex> node v13/cross-check-wear.js`, `node tools/preview-program.js <hex> <edition> <wear,list>`. New series args: `PROG_HEX_FILE=<hex> SHIM_OUT=<shim> node v13/gen-vm-factory-args.js data/series-testnet-v12.json <out.json>` (set `SHIM_OUT` or it overwrites `vm-engine-shim2.js`), then `silverc v13/SeriesFactory-v13-draft.sil --ctor <args> -o <abi>`.

After a mint or sale: `node tools/fetch-history.js`, then `node v13/gen-demo-v13.js`.

Generators: `node v13/make-v13-scripts.js` (fixed 2026-10-01: lane lookup uses `mintTxId`, and unlist/transfer honor `RELIKS_LEDGER`; regeneration output was verified identical to the hand patch). `v13/make-v13-escrow.js` is the escrow equivalent **(unreviewed)**.

## 5. Known blockers and findings

1. **Browser broadcast (the main blocker for third-party marketplaces).**
   - `data/mainnet-anchors.json` has `"wrpc": []`, deliberately empty after an audit finding against pinning public endpoints. The site's mint flow broadcasts only through the Kaspire extension (`pushTx`). Otherwise the user must paste their own node URL.
   - REST cannot carry covenant spends in practice: `secrets.env.example` says "covenant spends cannot use REST". `toRESTFormat` does map covenant and compute-budget fields, so the actual reason is unknown.
   - Kaspire Mobile over WalletConnect: the site requests only `kaspa_getAccounts`, `kaspa_getPublicKey`, `kaspa_signPskt`. It can sign but the site has no broadcast method for it.
   - `kaspire.kaslab.space/api` is a Swagger page. `/openapi.json` returned HTML. It answers OPTIONS with 501 on every path tried. It is not a usable submit endpoint.
   - dot.k (`@dotk/sdk-tx`, a comparable Silverscript dApp) uses a pattern worth copying: the dApp supplies a wRPC JSON node (`kaspad --rpclisten-json`), the wallet only signs by input index, and the dApp verifies every signature before submitting. It never asks the wallet to broadcast. Their README does not say which node endpoint their browser site uses. The owner drafted two outreach messages (Kaspire, dot.k); I do not know if they were sent.
   - **Pending probe:** `v13/ws-probe.html` tests whether a browser WebSocket can reach the public testnet wRPC nodes (`wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json`, `wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json`). Result not yet recorded. `NODE ANSWERED` means public nodes work from browsers. `REFUSED` means they do not. No mainnet endpoint is known in the repo.
   - Do not push the owner toward buying a VPS or running a node. He cannot. A Cloudflare Worker relay is an untested fallback.
2. **Wallets:** `web/kaspire.js` accepts mainnet only (it rejects other networks). The site's connect dialog says KasWare and Kastle work from a desktop browser with their extensions. The owner is not building a multi-wallet test matrix.
3. **`verifySigned` (web/reliks-chain.js)** checks that the wallet returned the same transaction and that each wallet input holds a signature of the right shape (`41...01`). It does not verify the signature against the sighash digest. The browser has no sighash code (only Node does, in `reliks-lib.js`). Low risk today (the node rejects bad signatures), but worth fixing in the SDK.
4. **Draft contracts and audit history:** the code mentions audit fixes (F-M1: the factory `mint` does not validate `buyerScheme`, guarded in the builder; ESC-INFO: offer refuses to lock funds unless the ledger price equals the ask). The `.sil` files are named "draft". No independent audit of v13 exists. The v12 site footer says "not audited".
5. **Creator flow needs CLI tools** (`silverc`, Node scripts). The Studio tab designs and gates an engine in the browser, then sends the user to "your computer". Whether a program can be patched into a precompiled template without `silverc` is **unknown**.
6. **Two parallel codebases** do the same transaction work: `reliks-lib.js` (CLI) and `web/reliks-chain.js` (browser). Nothing proves they stay in agreement.
7. **Cosmetic:** script output still says "V11 BUY" and "V5 OFFER"/"V5 ACCEPT"/"V12 MINT". The accept script, the escrow, and `make-v13-escrow.js` carry v5/v6 names.
8. **Cross-series coupling:** `gen-vm-factory-args.js` pins the DAG-City hashes unless `PROG_HEX_FILE` is set. `secondary-v13.js` reads the shared edition ABI `v13/out/v13.json`.

## 6. Roadmap for the infrastructure (proposal; only the mission itself is confirmed by the owner)

Principle: **freeze the on-chain protocol.** No new programs, factories or mechanisms until the spec, SDK and tests catch up. No marketplace UI work.

1. **Organize and document** (section 8): safe cleanup, a README for integrators, accurate `STATE.md`.
2. **Spec and conformance vectors.** Read `RELIKS-VM-SPEC.md`, reconcile it with `rvm.js` and `rvm.py`, make the vector generator run inside `tools/check.sh`, then mark spec v1 as frozen. A third implementation (a listed open item) is the best proof of a good spec.
3. **SDK.** Package the transaction logic once, with a read half (resolve lane, decode edition and lane state, verify a render against chain data) and a write half (plans for mint, list, buy, unlist, transfer, offer, accept). Interfaces modelled on dot.k's: `TxNode { utxosOf, feerate, submit, readyMass? }` and `Signer { sign(request) }` where the wallet only signs named inputs. Build the plan, measure mass, show the user, sign, **verify every signature against the digest**, then submit. Classify node rejections (transient, stale, fatal) and retry only transient with identical bytes. Unify `reliks-lib.js` and `web/reliks-chain.js` behind it, with a parity test.
4. **Integrator docs:** "Build a Reliks marketplace": data sources (kascov), an indexer-free design, a minimal static marketplace page based on the existing site, the broadcast options and their trade-offs.
5. **Creator tooling:** package `reliks-lens` and the L1-L8 gates, a series-config schema, and a documented deploy path. Resolve whether the compiler dependency can be avoided.
6. **Hardening:** negative tests for every entrypoint (royalty short, artist short, edition output short, wrong lineage, sales not incremented, wrong owner signature), then an independent audit, then a versioned release. Only after that: a mainnet series with the VM, and any "production-ready" claim.
7. **Broadcast path:** blocked on the probe and outreach. Decide after the result.

## 7. Immediate next actions (in order)

1. Finish the repo cleanup (section 8) and commit.
2. Run the WebSocket probe and record the result in `STATE.md`.
3. Read `v13/RELIKS-VM-SPEC.md` and `v13/reliks-2-design.md` (both unread by me) and write a one-page gap list against the code.
4. Start the SDK read half (pure functions, no network): decode states, verify renders. It needs no wallet, no node and no funds.

## 8. Repository map and cleanup rules

Reuse tiers (from review on 2026-10-02):
- **Tier 1, reusable as is:** `v13/vm/rvm.js`, `v13/vm/rvm.py`, `v13/RELIKS-VM-SPEC.md` (+ HTML), `v13/vm/gen_vectors.py`, `tools/preview-program.js`, `v13/cross-check-wear.js`, `v13/verify-vm-render.js` (demands a key although it never signs).
- **Tier 2, reusable with care:** `reliks-lib.js`, `web/reliks-chain.js`, `web/kaspire.js`, the three `.sil` contracts (drafts), `v13/gen-vm-factory-args.js`, `v13/gen-demo-v13.js`, the generated scripts via `v13/make-v13-scripts.js` and `v13/make-v13-escrow.js`.
- **Tier 3, low reuse:** `v13/dagcity*.py` and `dagcity-*.hex` (art-specific; the nine hex files from cap experiments are leftovers; keep `dagcity-marks3.hex`), one-shot migration scripts (`patch-lib-confirm.js`, `apply-transfer-lineage.js`, `apply-web-v13.js`, `gen-factory-args-v13.js`, `patch-network-wrpc*.js`), series records, `.bak` files.

**Gitignored records that exist only on the phone** (back up before touching): `v13/ledger-*.json`, `v13/escrow-ledger-*.json`, `v13/factory-args-*.json`, `v13/out/`, `v13/vm-engine-shim*.js`, `v13/history-*.json`, `v13/key2.env`. Last backup: `~/storage/downloads/reliks-backup/` (marks3 ledger, escrow ledger, factory args and ABI).

**Rules for moving files:**
- Scripts use hardcoded relative paths (`v13/out/...`, `require('../reliks-lib.js')`, `data/...`, `tools/ctx.sh` lists `v13/SESSION-HANDOFF-*.md`). **Never move a script or doc without grepping for its name first.** Run `sh tools/check.sh` after each step, and commit each step separately.
- Do not move `docs/` (it may be the Pages output; **unverified**) or anything under `web/` and `data/` unless the site build is understood.
- Move generated and obsolete files into `v13/archive/` with `git mv` only when no reference exists. Move untracked records to the backup folder, never delete them.

## 9. Do not

- Do not push `v13-lineage`, and do not touch `main` or the live site without an explicit request.
- Do not deploy or mint on mainnet. Do not call anything audited.
- Do not edit generated scripts. Do not `git add -A`.
- Do not ask for keys, and do not run signing steps without showing the cost first.
- Do not design new on-chain features. The mission is to make what exists complete, documented and testable.

## 10. Unverified or unknown

Full root listing and the contents of `data/`, `docs/`, `test/`, `.attic/`; what `tools/check.sh` covers beyond the four checks seen; the contents of `RELIKS-VM-SPEC.md`, `reliks-2-design.md`, `verify-chain.js`, `fund-key2.js`; the full entrypoint list of each contract; why REST rejects covenant spends; whether Kaspire Mobile has any broadcast method; whether any stranger has completed a mainnet mint from the browser; the cost and size of a mainnet node; kascov API limits.

## 11. Questions only the owner can answer

1. Which outreach messages (Kaspire, dot.k) were sent, and were there replies?
2. Is `docs/` the GitHub Pages output?
3. Should the SDK be a standalone package (own repo, npm) or stay inside this repo?
4. Is there any budget for an independent audit?

## 12. Root layout (listing 2026-10-02)
- Tracked root files: the v12 core (deploy-v12.js, mint-v12.js, secondary-v12.js, accept-v5.js, offer-v5.js, reliks-lib.js, reliks-templates.js, reliks-lens.js, reliks-engine-mainnet.js, reliks-engine-v10.js, gen-site.js, gen-gallery.js, gen-factory-args.js, network.js, config.js, bech32-kaspa.js, verify-render.js) and the dirs archive, data, docs (15 files, likely the Pages output; confirm via gen-site.js), sil (7), test (5), tools (5), v13 (38), web (8), .github.
- About 60 root files were untracked one-shot scripts (patch-*, fix-*, verify-v12-*, seed-*, SVGs); moved to .attic/root-2026-10 (local only).
- Secrets files secrets.env, secrets-v11.env, secrets.mainnet.env exist on the phone and must stay untracked. secrets.mainnet.env implies a mainnet key.
- Correction to section 8: v13/history-marks3-v13.json was not ignored before 2026-10-02; it is now.
- Untracked and not understood: tags.js, refs, tmp, lens-out, prune.txt, whitelist.txt. The reliks-audit-*.js files stayed in the root because the pre-commit hook may call them.

## 13. Corrections and confirmations (2026-10-02)
- docs/ is the GitHub Pages output, built by gen-site.js. Do not edit it by hand; regenerate. Resolved: question 2 in section 11.
- The pre-commit hook runs `node reliks-audit-loop.js --last` on the staged diff when its Qwen bridge is online, and blocks the commit if the audit fails (override: --no-verify, logs in docs/audit-log/). When the bridge is offline it prints "Skipping audit" and the commit goes through unaudited. Keep reliks-audit-*.js in the root.
- The audit that exists is automated review only (docs/AUDIT-SUMMARY.md; the site table says Audited: No). No independent audit of v12 or v13 exists.
- secrets.env, secrets-v11.env and secrets.mainnet.env are gitignored (.gitignore line 15). Do not read, print or copy them. Check that none holds the key from the burnt-key incident.
- list-via-rest.js and wait-for-list.js stayed in the root because tracked files reference them.

## 14. Untracked root items identified (2026-10-02)
- tags.js: KCC-01 dispatch-tag derivation test (blake3) with a template-hash check. Conformance-relevant; candidate for test/ and tools/check.sh once reviewed.
- lens-out/, tmp/: generated SVG renders (seeds 1, 42, 8675309, 999) from reliks-lens.js and earlier experiments. Regenerable; safe to move to .attic once nothing references them.
- prune.txt: lists data/chunks-16k.json, data/chunks-testnet-art.json, data/chunks.json. Purpose unknown.
- whitelist.txt: lists .gitignore, README.md, package.json. Purpose unknown (possibly used by a publish or audit step).
- refs/: empty directory.
- Do not delete any of these without confirming what reads them.

## 15. Results (2026-10-02)
- tags.js: ALL PASS for list, spend, __delegate dispatch tags. Informational line: KCC20 `__leader_transfer` derives to 501cb212 vs recorded 43997099 (cause unknown; Reliks may not use it).
- prune.txt and whitelist.txt are gitignored local helpers. lens-out/ is regenerated by reliks-lens.js.
- OPEN: tools/check.sh line 19 writes npm test output to /tmp/npmtest.log, and Termux has no /tmp. The test/ directory may not run under check.sh on this phone. Unverified. Fix: use $TMPDIR or $HOME.

## 16. check.sh coverage (2026-10-02)
- Before this date check.sh verified only series A (ledger-vm-v13.json) and the wear14 program. It now also verifies every marks3 edition on chain (JS=Python), the marks3 36-case cross-check, and tags.js. `sh tools/check.sh full` also runs npm test (5 test files; all pass).
- Section 15's /tmp concern was wrong: npm test runs only in `full` mode, and its log path now uses ${TMPDIR:-$HOME}.
