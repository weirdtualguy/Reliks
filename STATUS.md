# Reliks: project status (paused 2026-10-03)

Paused, not abandoned. Everything below is committed; nothing is half-done in the working tree.

## What this is
Generative-art NFTs on Kaspa covenants. An edition's art is rendered from a small program stored in the covenant script, so anyone can verify it from chain data. The last phase aimed at a protocol and SDK that others could build interfaces on, with no marketplace or node run by the author.

## What exists and is verified
- Mainnet (v12): one series with one edition, sold out. Read-only check: `sdk/verify-v12.js` (engine hash, script rebuild, live status). The SDK does not verify the art itself (the v12 engine is JavaScript).
- Testnet-10 (v13): a Reliks-VM series with 4 editions (the 4th minted through the SDK on 2026-10-03) and a second series (marks3) with 1 edition. Lineage and wear (sales) are tracked on chain.
- Reliks-VM rev 2: a small deterministic bytecode machine that produces a canonical SVG. Three implementations (JavaScript, Python, C), 142 shared vectors and about 12,000 fuzzed programs agree. Spec: `v13/RELIKS-VM-SPEC.md`. Not formally frozen: no mainnet VM series exists, and new VM series are meant to use engine_lang 2.
- `PROTOCOL.md`: edition, factory and escrow contracts transcribed from their sources; each source recompiles to the deployed bytecode (`tools/verify-contract.js`). State encodings and the serial, lineage and covenant-id derivations are checked against an independent Python reference.
- `sdk/`: read (editions, claims with provenance, lanes), plan, sign, send, confirm, and a staged mint tool (dry run, sign, send with a typed serial). One real mint went through it and was mined.

## What does not exist
- No marketplace. The SDK has no list, buy, sell, transfer or offer planners (the contracts exist and are specified).
- Nothing has been done on mainnet by the SDK. A mainnet VM series would be a new genesis and cannot be changed afterwards.
- No outside implementation, no users, and no demand was tested.

## Findings worth keeping (details in `v13/SPEC-GAPS.md`)
- Wear (sales) can be raised by self-sales at the cost of the royalty and the fee.
- The current state of a live edition cannot be read from public indexers; a client can only check a claimed state against the chain.
- engine_lang 1 means JavaScript on mainnet and the VM on testnet.

## To resume
- Health check: `sh tools/check.sh`
- Dry-run a mint: `PC_NET=testnet PC_WALLET=<address> node sdk/mint.js v13/ledger-vm-v13.json v13/out/factory-vm-v13.json`
- Read first: `PROTOCOL.md`, `sdk/README.md`, `v13/SPEC-GAPS.md`, `STATE.md`

## Only on the author's phone (gitignored)
Ledgers (`data/`, `v13/ledger-*.json`), compiled ABIs (`v13/out/`), constructor args, and the key files. A snapshot of the ledgers and ABIs was taken at freeze time.
