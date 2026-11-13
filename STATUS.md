# Reliks: project status (updated 2026-11-13 — v13.0.0 final, v12 deprecated)

Everything below is committed and verified by `npm test` and `sh tools/check.sh`.

## What this is
Generative-art NFTs on Kaspa covenants. An edition's art is rendered from a small deterministic program stored in the covenant script, so anyone can verify it from chain data or an offline provenance bundle. The protocol and SDK let third parties build interfaces with no marketplace or node run by the author.

## What exists and is verified
- Mainnet (v12): one series with one edition, sold out. Read-only check: `sdk/verify-v12.js` (engine hash, script rebuild, live status), `cli/verify-render.js`, and offline provenance bundle `data/provenance-v12-genesis.json`.
- Testnet-10 (v13): a Reliks-VM series with 4 editions (the 4th minted through the SDK on 2026-10-06) and a second series (marks3) with 1 edition. Lineage and wear (sales) are tracked on chain. Offline provenance bundle: `v13/provenance-v13-demo.json`.
- Reliks-VM v1 rev 2 (`RVM\x01`): a deterministic bytecode machine that produces a canonical SVG. Three implementations (JavaScript `v13/vm/rvm.js`, Python `v13/vm/rvm.py`, C99 `v13/vm/rvm.c` under ASan/UBSan), 142 shared vectors (`v13/vm/check.js`), 135 C program vectors (`v13/vm/check3.js`), and ~12,000 differential-fuzzed programs agree. Spec: `v13/RELIKS-VM-SPEC.md` (v1 opcode space frozen for mainnet genesis; new VM series use `engine_lang = 2`).
- Verification site (`docs/index.html`) and VM Studio (`docs/studio.html`): both JS and Reliks-VM series render and verify in a Web Worker; includes an offline verification mode (accepting provenance bundles or covenant UTXO exports with zero network calls) and multi-source agreement checks when both kascov and Kaspa REST respond.
- Artist tooling: `cli/reliks-lens.js` (JS engines) and `cli/reliks-lens-vm.js` (Reliks-VM programs: sweeps serials × patina/wear corners, reports worst-case fuel, elements, SVG bytes, stack depth, and checks the 25,641-byte PUSHDATA2 baking ceiling).
- `PROTOCOL.md`: edition, factory and escrow contracts transcribed from their sources; each source recompiles to the deployed bytecode (`tools/verify-contract.js`). State encodings, serial, lineage, covenant-id derivations, minimal conforming indexer API, and signed ownership challenges (`ReliksOwnerChallengeV1`) are specified and tested.
- `sdk/`: read (editions, claims with provenance, signed ownership challenges, lanes), plan, sign, send, confirm, and a staged mint tool.

## What does not exist
- No hosted marketplace UI. The SDK has no list, buy, sell, transfer or offer planners in the browser yet (the CLI builders and contracts exist and are specified).
- The browser mint handshake through the Kaspire Extension is verified against mocks (`test/wallet-test.js`, `test/kaspire-mass-test.js`); the first live browser-extension mint on a fresh lane remains the pre-announcement gate (`docs/WALLET.md`).
- No outside implementation of the RVM (Rust/Zig) by a second author yet; `v13/RELIKS-VM-SPEC.md` §12 defines the stdin/stdout conformance harness contract for `v13/vm/check3.js`.

## Findings worth keeping (details in `v13/SPEC-GAPS.md`)
- Wear (sales) can be raised by self-sales at the cost of the royalty and the fee.
- The current state of a live edition cannot be read from public indexers without a supplied claim or provenance bundle; a client verifies a claimed state against the chain.
- `engine_lang` mapping is frozen in `PROTOCOL.md` §6: `1` is legacy JavaScript on v12 mainnet (and legacy VM on the two early testnet-10 series); `2` is required for all new and mainnet Reliks-VM v1 series. Verifiers dispatch on the program magic bytes (`52 56 4d 01`) first.

## To resume or verify
- Full offline suite: `npm test`
- Health check: `sh tools/check.sh`
- Verify provenance bundles offline: `npm run bundle:verify`
- Run VM lens on a program: `node cli/reliks-lens-vm.js web/vm-templates/iso.txt`
- Read first: `PROTOCOL.md`, `v13/RELIKS-VM-SPEC.md`, `sdk/README.md`, `v13/SPEC-GAPS.md`, `docs/STATE.md`

## Only on the author's phone (gitignored)
Ledgers (`data/`, `v13/ledger-*.json`), compiled ABIs (`v13/out/`), constructor args, and the key files. A snapshot of the ledgers and ABIs was taken at freeze time, and public render/anchor vectors are preserved in `data/provenance-v12-genesis.json` and `v13/provenance-v13-demo.json`.

Note on dates (F-10): the October 2026 freeze happened on 2026-10-06. The earlier tag `v13-freeze-2026-10-03` and the backup folder name carried a wrong date label; an annotated tag `v13-freeze-2026-10-06` documents the corrected freeze date, and entries in `docs/STATE.md` dated 2026-10-03 were written between 2026-10-03 and 2026-10-06.
