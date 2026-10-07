# Reliks: handoff for AI assistants (2026-10-06, project paused)

Read this file first. Open other files only when the task needs them; MANIFEST.md lists each file with an approximate token cost.

## 1. What Reliks is
Generative-art NFTs on Kaspa covenants (SilverScript). The art is rendered from a small program (Reliks-VM bytecode) baked into the series' factory script. An edition's serial derives from a lane outpoint, and its state (owner, price, lineage, sales) lives in its covenant script. Goal: something like fxhash on Kaspa, with no IPFS and minimal trusted third parties. Principle: verify, don't trust. A client checks that a program matches its hash, that a script matches a claimed state, and where an edition came from.

## 2. The layers
- Contracts (3 SilverScript sources in `v13/`): factory (mint, fork, close), edition (list, unlist, buy, sell, transfer, spend), offer escrow (accept, expire). Each recompiles to the deployed bytecode (`tools/verify-contract.js`).
- VM: `v13/RELIKS-VM-SPEC.md`, reference interpreter `v13/vm/rvm.js` (Python and C versions exist in the repo). Art programs are assembly; `v13/vm/dagcity.py` is an example.
- SDK (`sdk/`): verify editions and claims, resolve a lane, plan, sign, send, confirm, staged mint tool. Tests are in the repo, not in the lean zip.
- Site: static page generated into `docs/index.html` for the mainnet v12 series (mint-only, wallet connect in `web/kaspire.js`).

## 3. Status (honest)
- Mainnet (v12): one series, one edition, sold out, JavaScript engine, engine_lang 1. Read-only check only.
- Testnet-10 (v13): a VM series with 4 editions (the 4th minted through the SDK) and a second series (marks3) with 1.
- Verified: contract sources recompile to the deployed bytecode; state encodings and derivations agree with an independent Python reference; VM has 142 shared vectors, three implementations and about 12,000 fuzzed programs that agree; one real mint went through the SDK.
- Not built: list, buy, sell, transfer and offer planners; a marketplace UI; any mainnet VM series; any outside user or implementation. Demand is untested.
- The owner paused the project on 2026-10-06.

## 4. Reading order
1. This file, then `STATUS.md`.
2. `PROTOCOL.md`: state layouts, derivations, edition/factory/escrow rules, reading model, claim format.
3. `v13/SPEC-GAPS.md`: numbered findings. Read only the items you need.
4. VM work: `v13/RELIKS-VM-SPEC.md`. Route changes: the `.sil` files. Everything else: code on demand.

## 5. Facts that bite
- Kaspa nodes prune old block data (observed on public testnet nodes: 24 h old blocks served, 65 h old gone). Signature scripts are not retained, so state must live in UTXO scripts.
- Indexers cannot report a live edition's current owner. kascov shows a live output's script hash only; its `state_fields` label is unreliable; the REST API returned no record for covenant-era transactions. So a client checks a claimed state by rebuilding the script (see claims in PROTOCOL.md section 11).
- Index freshness: gate on tip age plus sync lag, not tip age alone. A record can lag behind the global tip.
- The public nodes' submitTransaction needs a top-level `mass: 0` (without it: "request deserialization error"). allowOrphan false was enough for a mint.
- A series' factory script embeds its program, so each series needs its own factory ABI. `reliks-templates.js` defaults to the mainnet v12 factory; use `sdk/templates.js` for other series.
- engine_lang 1 means JavaScript on mainnet and the VM on testnet. New VM series use 2. Readers must identify the engine from the program bytes (VM programs start `52 56 4d 01`).
- Serial is 63 bits from the lane outpoint the mint spends (not the mint transaction). Derivations: PROTOCOL.md section 3.
- Wear (sales) can be raised by self-sales at the cost of the royalty and fee, so it is not proof of market history.
- Ledger `spk` fields in the VM ledgers are hex of the ASCII script (140 hex characters).

## 6. Rules
- Never write to mainnet without the owner's explicit go-ahead. A genesis is irreversible and freezes the VM rules.
- Never ask for, print or store a private key. The SDK takes keys as parameters; the mint tool reads `PC_PRIV` from the shell environment.
- Never resubmit after a timeout or an ambiguous result; check the transaction's status first.
- Ledgers, compiled ABIs and key files are gitignored and not in this zip.
- The owner works only on Android (Termux): node 26, python 3.13, silverc installed, no desktop tools. Give copy-paste shell commands, small verified steps, and say what each output means.

## 7. The rest
Full repo: github.com/weirdtualguy/Reliks (branch main). It has tests, vectors, tools and older versions. `sh tools/make-handoff.sh full` builds a larger zip.
