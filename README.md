> **Deploy only from `contracts/`.** The canonical contracts are `contracts/SeriesFactory.sil` (v13, `029512ea…`), `contracts/ReliksEdition.sil` (v13, `9106b142…`), and `contracts/OfferEscrow.sil` (v6, `18e3d59a…`). Pinned hashes, sha256, and versions live in `TEMPLATE-HASHES.json`. `tools/verify-contract.js` recompiles every contract and hard-fails if any hash differs. Any change to a contract needs a fresh audit. Retired contracts live in `archive/deprecated/` — do not deploy them.
>
> **Status:** v13-final (2026-11-15). The v12 mainnet series `genesis-dag-city` is legacy — it stays in the indexer, flagged "legacy, unsafe" in the UI. The real v13 genesis has not happened yet. See [STATUS.md](STATUS.md) for what exists, what is verified, and how to deploy a v13 series.

# Reliks

**Generative art on Kaspa where the artwork is a program, and its hash lives in the contract.**

A Reliks edition is `render(engine, serial)` (or `render(program, serial, lineage, sales)` on v13 Reliks-VM). The engine is a few kilobytes of deterministic integer code or Reliks-VM (`RVM\x01`) bytecode. Its BLAKE2b hash is part of covenant state, and its bytes are baked into the contract template. Anyone can re-render any edition from public chain data or a self-contained provenance bundle. No IPFS required for integrity, no server, no platform cut in the contracts.

**Live site:** https://weirdtualguy.github.io/Reliks/ (re-renders and verifies both JavaScript and Reliks-VM series in your browser; supports offline provenance bundle verification and connects to the [Kaspire](https://kaspire.kaslab.space) wallet).

## What Reliks is, and is not

| Reliks is | Reliks is not |
|---|---|
| Three Silverscript covenants (`contracts/`), three independent Reliks-VM interpreters (`v13/vm/`), Node reference tools, and a static verification and mint page | A marketplace, an indexer or a hosted service |
| Art recomputable from `(engine, serial[, lineage, sales])`, with the engine hash anchored in the contract | Storage that survives node pruning by itself: keep a copy of the engine or export a provenance bundle (`npm run bundle`) |
| No protocol fee: the artist gets exactly the primary price | Free to use: network fees apply (about 0.04 KAS per mint), plus a 1 KAS carrier that stays in your edition |
| Royalties enforced on covenant-priced resales (list/buy, escrow accept) | Royalties on plain `transfer` or zero-price `sell`, which are royalty-free by design |
| Open source (MIT) with automated review passes and 142 cross-language VM conformance vectors | Formally audited. Start small |
| Browser mint through Kaspire (and offline bundle/claim verification) | Browser buy, sell or offers: those run through the CLI today |

## Mainnet & v13 VM status

The v12 mainnet genesis is a **single-edition series**: factory lane `1569a69f…9c09`, one DAG-city edition (serial `2884738305227171331`), primary price **1 KAS**, 5% resale royalty, engine hash `16440384…eaa4`. Its lane is sold out. Its factory (`b070609c…`) and edition (`0514190a…`) are legacy hashes — the indexer flags the series "legacy, unsafe". On testnet-10, v13 adds `lineage` and `sales` (wear) state fields and runs the **Reliks-VM** (`RVM\x01` deterministic bytecode with three agreeing implementations in Python, JavaScript and C99). The site recomputes every anchor from chain data (or offline provenance bundles) and shows PASS or FAIL for each check. Do not take this paragraph on faith: open the site, or run `node cli/verify-render.js` / `node tools/gen-provenance-bundle.js --verify data/provenance-v12-genesis.json`.

## Use it

```bash
git clone https://github.com/weirdtualguy/Reliks.git && cd Reliks
npm ci
npm test          # network-free: codecs, RVM (JS + C99 + ASan/UBSan), SDK, chain library, wallet layer, site/studio/bundle guards
npm run site      # rebuild docs/index.html (the GitHub Pages site)
npm run studio    # rebuild docs/studio.html (the standalone Reliks-VM Studio)
```

Open `docs/index.html` or `docs/studio.html` from any static server. There is no build step and no bundler.

### Wallet

| Path | Needs | Notes |
|---|---|---|
| **Kaspire Extension** (Chromium) | Nothing else | Injected `window.kaspire`. Signs your funding input and broadcasts with `pushTx`. Default. |
| **Kaspire Mobile** (Android) | WalletConnect, loaded only when chosen | Connects and signs. Public REST cannot carry covenant transactions, so broadcasting needs your own wRPC node address (or use the extension). |

Neither path gives the site a key. After signing, the site checks that every input, output and covenant binding still matches what you reviewed, and only then broadcasts. Details: [docs/WALLET.md](docs/WALLET.md).

### Publish a series (CLI, needs the external Silverscript compiler `silverc`)

```bash
cp secrets.env.example ~/reliks-private/secrets.env   # keep keys outside the repo; PC_PRIV, PC_WALLET (+ PC_NET / PC_MAINNET_WRPC for mainnet)
set -a; . ~/reliks-private/secrets.env; set +a
node tools/verify-contract.js   # hard-fails if any contract hash differs from TEMPLATE-HASHES.json — run first
node cli/reliks-lens.js my-engine.js                  # JS engine gate suite (or cli/reliks-lens-vm.js my-prog.rvm for Reliks-VM)
node cli/gen-factory-args.js series-my-engine.json    # or v13/gen-vm-factory-args.js for Reliks-VM (engine_lang = 2)
# compile contracts/SeriesFactory.sil with those args
npm run deploy && npm run mint && npm run verify && npm run gallery
```

Full sequence: [docs/MAINNET-RUNBOOK-v13-fixed.md](docs/MAINNET-RUNBOOK-v13-fixed.md). To list another series on the site, add it to [`data/mainnet-anchors.json`](data/mainnet-anchors.json) and run `npm run site`; the page treats every anchor as a claim to verify and supports both JS (`engine`) and Reliks-VM (`programHex`, `engine_lang: 2`) series.

## Contracts

| Contract | Role | Template hash |
|---|---|---|
| `contracts/SeriesFactory.sil` (v13) | Mint lanes: pays the artist, spawns an edition, decrements `mints_left`; `fork` splits a lane, `close` ends it | `029512ea…` |
| `contracts/ReliksEdition.sil` (v13) | The NFT: list / unlist / buy / sell / transfer / spend, royalty-only exact splits, carrier conservation (+ `lineage` and `sales` in v13) | `9106b142…` |
| `contracts/OfferEscrow.sil` (v6) | Offers: owner-signed atomic `accept`, or permissionless `expire` refund | `18e3d59a…` |

Serials are counter-based (the factory's `next_serial` assigns each edition its serial). Older contract versions (v1–v12, escrow v5, and every pre-fix v13/v6 draft) live in `archive/deprecated/` — do not deploy them.

## Layout

| Path | Contents |
|---|---|
| `contracts/` | The canonical contracts (the only deployable set) + the edition compile-args fixture |
| `audit-test/` | The audit evidence suite (testnet-10 test scripts, IN-01/IN-03 attack scripts, fixed-series ABIs). Testnet only. |
| `archive/deprecated/` | Retired contracts and pre-fix ABIs. Do not deploy. |
| `data/` | `mainnet-anchors.json`, offline provenance bundles (`data/provenance-v12-genesis.json`), and the v12 ABIs the live legacy series still needs (`factory-abi-v12.json`, `edition-abi-v12.json`) |
| `lib/` | Shared Node code: `reliks-lib.js` (signing, fees), `reliks-templates.js` (browser contract templates derived from the compiled ABIs), `reliks-engine-mainnet.js`, `network.js`, `config.js`, `bech32-kaspa.js` |
| `cli/` | Node reference builders (`deploy-v12.js`, `mint-v12.js`, `secondary-v12.js`, `offer-v5.js`, `accept-v5.js`) and gates (`reliks-lens.js`, `reliks-lens-vm.js`, `verify-render.js`, `gen-gallery.js`, `gen-factory-args.js`) |
| `web/` | Zero-dependency browser code: `blake2b.js`, `reliks-chain.js`, `kaspire.js` (wallet), `rvm-asm.js` (RVM assembler), `site-app.js`, `studio-vm-app.js`, `site.css` |
| `tools/` | `verify-contract.js` (hash gate), `check-deprecated-hashes.js` (grep gate), `gen-site.js` (builds `docs/index.html`), `gen-studio.js` (builds `docs/studio.html`), `gen-provenance-bundle.js` (builds & verifies offline provenance bundles), `check.sh` (health check), `tags.js`, chain and context helpers |
| `sdk/` | Read, plan, sign, send, confirm, claim verification, and signed ownership challenges for v12/v13 |
| `v13/` | Reliks-VM (`v13/vm/rvm.js`, `rvm.py`, `rvm.c`, 142 vectors), specs (`v13/RELIKS-VM-SPEC.md`), and provenance bundle (`v13/provenance-v13-demo.json`). Its contracts are archived in `archive/deprecated/v13/`. |
| `test/` | `self-test.js`, `chain-test.js`, `v13-codec-test.js`, `wallet-test.js`, `site-test.js`, `kaspire-mass-test.js`, `asm-test.js`, `studio-test.js`, `vm-conformance-test.js` |
| `docs/` | `index.html`, `studio.html`, architecture, runbook, audit summary, `STATE.md`, `AI-CONTEXT.md`, `history/` |

## Dependencies

Browser: none. The site is one HTML file with no external scripts, styles or fonts. The only optional third-party code is the pinned WalletConnect SDK, fetched when a visitor explicitly chooses Kaspire Mobile.
Node tooling: `@noble/curves`, `@noble/hashes`, `ws`.

## Safety rules (standing)

- Never `PC_USE_SDK=1` for covenant spends. Use raw JSON wRPC only.
- The mainnet key is generated on the user's own device. Never paste it or pass it into any agent sandbox or chat.
- Launch price >= 1 KAS (no free mint). Royalty 500–2000 bips. Canary supply 4–10 mints. `next_serial` starts at 0.
- The indexer shows an edition only if its genesis spent a lane of the real factory AND the edition output is covenant-bound.
- Wallets must warn offerers to cancel stale offers.

## Building on Reliks

The base protocol stays fee-neutral. Marketplaces can fork `contracts/OfferEscrow.sil` to add their own premium field. See [CONTRIBUTING.md](CONTRIBUTING.md), [PROTOCOL.md](PROTOCOL.md), and [SECURITY.md](SECURITY.md).

## License

MIT
