# Reliks

**UTXO-native generative art on Kaspa covenants where the artwork is a deterministic program, and its BLAKE2b hash lives in the contract.**

A Reliks edition is `render(program, serial, lineage, sales)` executed by **Reliks-VM** (`RVM\x01`), a deterministic stack-based SVG bytecode machine. The generative program is baked directly into the `SeriesFactory` covenant template, and its 32-byte BLAKE2b hash is anchored in every edition's on-chain covenant state. Anyone can re-render and verify any edition from public Kaspa chain data or a self-contained offline provenance bundle — with zero servers, zero IPFS dependency for integrity, and zero platform fees in the base protocol.

- **Live App (Gallery, Secondary Market, Studio & Offline Verifier):** [https://weirdtualguy.github.io/Reliks/](https://weirdtualguy.github.io/Reliks/)
- **Standalone Air-Gapped Reliks-VM Studio:** [https://weirdtualguy.github.io/Reliks/studio.html](https://weirdtualguy.github.io/Reliks/studio.html)
- **Wallet Integration:** Connects to [Kaspire Extension](https://kaspire.kaslab.space) (Chromium) and **Kaspire Mobile** (Android via on-demand WalletConnect).

> **Canonical Contract Set:** Deploy **only** from `contracts/`. The canonical Silverscript contracts are `contracts/SeriesFactory.sil` (`029512ea…`), `contracts/ReliksEdition.sil` (`9106b142…`), and `contracts/OfferEscrow.sil` (`18e3d59a…`). Exact template hashes, SHA-256 digests, and state spans are pinned in [`TEMPLATE-HASHES.json`](TEMPLATE-HASHES.json) and enforced by `node tools/verify-contract.js` and `node tools/check-deprecated-hashes.js`.

## Highlights at a Glance

| Capability | How Reliks Works |
|---|---|
| **On-Chain Generative Art** | Artwork is computed deterministically from `(program, serial, lineage, sales)`. Both `program_hash` and `render_hash` (at `serial = 1, lineage = 0, sales = 0`) are anchored on chain. |
| **Reliks-VM (`RVM\x01`)** | Deterministic stack-based SVG bytecode runtime with three independent implementations (JS `vm/rvm.js`, Python `vm/rvm.py`, C99 `vm/rvm.c` under ASan/UBSan) verified across 142 shared vectors and 135 C program vectors. |
| **Visual No-Code Layer Builder & DSL** | Stack and customize generative layers (*Radial Glow*, *Concentric Rings*, *Matrix Grid*, *Starfield Orbs*, *Radial Rays*, *Crystal Shards*, *Wave Ribbons*, *Skyline Monoliths*) with interactive sliders and color pickers — or write High-Level Reliks-Script DSL that compiles directly to `RVM\x01` bytecode. |
| **1-Click Browser Publishing** | Assemble, preview patina & wear (with an optional `Enable wear` toggle), run the 6-gate determinism suite, and deploy your `SeriesFactory` covenant in 1 click via Kaspire — no CLI or `silverc` required. |
| **Permissionless Marketplace** | Submit a deployed Series Anchor JSON via a [GitHub Issue](https://github.com/weirdtualguy/Reliks/issues/new?template=submit-series.yml); GitHub Actions verifies `RVM\x01` determinism and on-chain KIP-20 covenant bindings and auto-syncs live editions every 15 minutes. |
| **In-Browser Secondary Market** | Mint primary editions, **List for Sale**, **Buy**, **Cancel Listing**, **Transfer**, or place/accept **2-Party Atomic Bids/Offers** (`ReliksEdition.sell` via PSKT) directly in the browser with automatic multi-UTXO coin selection. |
| **Zero Protocol Rent** | Artists receive **100%** of primary mints and **5%–20%** enforced royalties on covenant-priced resales (OTC `transfer` is royalty-free, see [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md)) (`buy`, `sell`, `OfferEscrow.accept`, with a `0.05 KAS` royalty mineability floor). Network fees (~0.04 KAS) and a 1 KAS edition carrier apply. |

## Canonical Contracts & Security Properties

| Contract | Role & Routes | State Span | Template Hash (`silverc 0.1.0`) |
|---|---|---|---|
| [`contracts/SeriesFactory.sil`](contracts/SeriesFactory.sil) | Primary mint lanes (`mint`, `fork`, `close`). Pays 100% of `price` to artist, spawns covenant-bound edition, assigns monotonic `next_serial`, and decrements `mints_left`. | `144 B` (8 fields) | `029512ea7fa65643f5bc82f125cd23eb09b4ed5b2fe8fc9d33e5769cc3eb1014` |
| [`contracts/ReliksEdition.sil`](contracts/ReliksEdition.sil) | Edition NFT state machine (`list`, `unlist`, `buy`, `sell`, `transfer`, `spend`). Enforces carrier conservation, contiguous payment indices, royalty splits, provenance `lineage`, and `sales` wear. | `203 B` (10 fields) | `9106b1426f4bb67ba4133d040b5258a9f177939c338266d249a1f8780e0ea2e5` |
| [`contracts/OfferEscrow.sil`](contracts/OfferEscrow.sil) | Trustless offer escrow (`accept`, `cancel`, `expire`). Owner-signed atomic `accept`, offerer-signed immediate `cancel`, or permissionless `expire` refund after `expireAge`. | `161 B` (8 fields) | `18e3d59aa9403539ccb8bd04ef2c9c81fe21f0602f3ff55e9e6f0ce375d17a2b` |

### Audit & Red-Team Verification

The canonical contracts underwent static review, an on-chain exploit and negative test suite on `testnet-10`, consensus fuzzing with `kaspa-redteam` (rusty-kaspa validator in-process), and a live mainnet rehearsal (genesis, mint, list at 1 KAS @ 5%, and buy):

- **Authorized Edition Output Binding:** `OfferEscrow.accept` binds `editionOutIdx == OpAuthOutputIdx(editionInIdx, 0)` so an unbound decoy output cannot satisfy the escrow.
- **Contiguous Payment Output Binding:** `ReliksEdition.checkPayments` and `OfferEscrow.accept` pin `ownerOutIdx == base + 1` and `artistOutIdx == base + 2`; `SeriesFactory.mint` pins `artistOutIdx == editionOutIdx + 1` so payment outputs cannot be shared across inputs.
- **Royalty Storage-Mass Mineability Floor:** Enforces `MIN_ROYALTY_OUT = 5,000,000` sompi (`0.05 KAS`) and `MIN_ROYALTY_BIPS = 500` (`5%`), verified on mainnet where a `1 KAS @ 5%` buy mined at mass `15,603` (3% of the `500,000` cap).
- **Monotonic Counter Serials:** `SeriesFactory` assigns serials from its `next_serial` state counter (split into disjoint ranges on `fork`), seeding initial lineage via `blake2b("ReliksGenesisV2" || factory_covid || le64(next_serial))`.
- **Offer Cancellation & Input/Output Isolation:** `OfferEscrow` provides offerer-signed `cancel(sig offererSig)` for immediate withdrawal, enforces input adjacency (`this.activeInputIndex == editionInIdx + 1`) in `accept`, and binds `expire` refunds to `tx.outputs[this.activeInputIndex]` with `require(tx.inputs.length == 2)`.

See [`docs/AUDIT-SUMMARY.md`](docs/AUDIT-SUMMARY.md) and [`STATUS.md`](STATUS.md) for full details.

## Workflow for Artists & Collectors (Browser)

### 1. Create & Publish a Generative Series (Studio)
1. Open the [**Studio** tab](https://weirdtualguy.github.io/Reliks/#studio) in **Visual Builder (No-Code)** mode, pick a visual preset (*Cyber Grid & Neon Orbs*, *Solar Mandala & Waves*, *Synthwave Skyline Monoliths*, or *Bauhaus Geometric Composition*), and customize your palette, layers, and sliders — or switch to **Code Editor (DSL / ASM)** to write High-Level Reliks-Script DSL directly.
2. Preview different serials and lineages, and toggle **Enable wear** to choose whether secondary sales age the artwork or leave it pristine.
3. Click **Run gates** to verify bytecode size (`<= 25,641 B`), anchor rendering, double-render determinism, and 30-render worst-case fuel/element/SVG headroom.
4. Enter your **Price** (`>= 1 KAS`), **Royalty %** (`5%–20%`), and **Editions** supply, then click **Publish on Chain (Kaspire)** to deploy your `SeriesFactory` covenant in 1 click.
5. Click **Submit to Marketplace (GitHub)** to open a pre-filled GitHub Issue; the automated workflow verifies your series on-chain and lists it in the public Gallery.

### 2. Mint, Collect, Bid & Trade (Gallery)
1. Browse verified series in the [**Gallery** tab](https://weirdtualguy.github.io/Reliks/#gallery) and filter editions by **All Editions**, **Listed for Sale**, **My Collection**, or **Active Bids**.
2. Connect **Kaspire Extension** or **Kaspire Mobile** (which automatically combines up to 4 wallet UTXOs when your balance is fragmented).
3. Click **Mint** on any active series, **Buy** on any listed edition, **Place Bid / Offer** on any edition (listed or unlisted) to create a 2-party atomic PSKT bid, or **List for sale** / **Cancel listing** / **Transfer** on editions you own.

## Quick Start (Local Development & CLI)

```bash
git clone https://github.com/weirdtualguy/Reliks.git && cd Reliks
npm ci
npm test          # runs all 10 offline test suites (codecs, RVM JS/C99/ASan/UBSan, SDK, wallet, site, studio, marketplace)
node tools/verify-contract.js          # recompiles contracts/*.sil and verifies hashes against TEMPLATE-HASHES.json
node tools/check-deprecated-hashes.js  # ensures no deprecated template hashes appear in the repo
npm run site      # rebuilds docs/index.html
npm run studio    # rebuilds docs/studio.html
```

### CLI Series Packaging & Deployment
If you prefer the command line over the browser Studio:
```bash
node cli/reliks-lens.js web/vm-templates/iso.txt                 # run Reliks-VM determinism & headroom gates
PROG_FILE=web/vm-templates/iso.txt node cli/gen-factory-args.js series.json
npm run deploy && npm run mint
```
For full mainnet CLI deployment instructions, see [`docs/MAINNET-RUNBOOK.md`](docs/MAINNET-RUNBOOK.md).

## Repository Layout

| Path | Contents |
|---|---|
| `contracts/` | Canonical Silverscript contracts (`SeriesFactory.sil`, `ReliksEdition.sil`, `OfferEscrow.sil`), compiled ABIs (`factory.json`, `edition.json`, `escrow.json`), and constructor-arg fixtures |
| `vm/` | Reliks-VM specification (`vm/RELIKS-VM-SPEC.md`), reference interpreters (`vm/rvm.js`, `vm/rvm.py`, `vm/rvm.c`), conformance vectors, and assembly corpus |
| `web/` | Zero-dependency browser modules: `blake2b.js`, `reliks-chain.js` (covenant codecs & tx builders), `kaspire.js` (wallet), `rvm-asm.js` (Reliks-Script DSL & assembler), `site-app.js`, `studio-vm-app.js`, `vm-templates/` |
| `tools/` | `verify-contract.js` (hash & genesis gate), `check-deprecated-hashes.js`, `gen-site.js`, `gen-studio.js`, `gen-provenance-bundle.js`, `verify-and-add-series.js`, `sync-marketplace.js`, `check.sh` |
| `sdk/` | Programmatic Node SDK for reading lanes/editions, verifying claims & signed ownership challenges (`ReliksOwnerChallengeV1`), planning, signing, and broadcasting |
| `cli/` | Artist gate & deployment tools (`reliks-lens.js`, `gen-factory-args.js`, `deploy.js`, `mint.js`, `secondary.js`, `offer.js`, `accept.js`, `cancel.js`, `expire.js`, `verify-render.js`, `gen-gallery.js`) |
| `data/` | `mainnet-anchors.json`, offline provenance bundle (`provenance-demo.json`), and example series configuration |
| `docs/` | Generated GitHub Pages site (`index.html`, `studio.html`, `marketplace-index.json`), `ARCHITECTURE.md`, `WALLET.md`, `AUDIT-SUMMARY.md`, `MAINNET-RUNBOOK.md` |
| `test/` | 10 automated offline test suites executed by `npm test` and GitHub Actions CI |

## Standing Safety Rules

- **Raw JSON wRPC for Covenant Spends:** Never set `PC_USE_SDK=1` for covenant spends; use raw JSON wRPC endpoints (`wss://emma.kaspa.stream/kaspa/mainnet/wrpc/json`, `wss://eva.kaspa.green/kaspa/mainnet/wrpc/json`) or Kaspire Extension `pushTx`.
- **Key Hygiene:** Never commit, paste, or pass a mainnet private key into any chat or sandbox. Keep CLI keys in `~/.reliks-mainnet.env` (`chmod 600`) outside the repository, or sign in-browser with Kaspire.
- **Series Parameters:** Launch with `price >= 1 KAS` (no free mints), `royalty_bips` in `500..2000` (`5%–20%`), and `next_serial = 0`.
- **Indexer & Offer Hygiene:** Indexers only list editions whose genesis transaction spent a real `SeriesFactory` lane AND bound the edition output to a covenant ID. Offerers should cancel stale offers via `OfferEscrow.cancel`.

## Contributing & Security

The base protocol is MIT-licensed and fee-neutral. See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`PROTOCOL.md`](PROTOCOL.md), and [`SECURITY.md`](SECURITY.md).

## License

[MIT](LICENSE)
