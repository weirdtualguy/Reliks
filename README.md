# Reliks

**Generative art on Kaspa where the artwork is a program, and its hash lives in the contract.**

A Reliks edition is `render(engine, serial)`. The engine is a few kilobytes of deterministic integer code. Its BLAKE2b hash is part of covenant state, and its bytes are baked into the contract template. Anyone can re-render any edition from public chain data. No IPFS, no server, no platform cut in the contracts.

**Live site:** https://weirdtualguy.github.io/Reliks/ (re-renders and verifies the mainnet series in your browser; connects to the [Kaspire](https://kaspire.kaslab.space) wallet).

## What Reliks is, and is not

| Reliks is | Reliks is not |
|---|---|
| Three Silverscript covenants (`sil/`), Node reference tools, and a static verification and mint page | A marketplace, an indexer or a hosted service |
| Art recomputable from `(engine, serial)`, with the engine hash anchored in the contract | Storage that survives pruning by itself: keep a copy of the engine (this repo has it) |
| No protocol fee: the artist gets exactly the primary price | Free to use: network fees apply (about 0.04 KAS per mint), plus a 1 KAS carrier that stays in your edition |
| Royalties enforced on covenant-priced resales (list/buy, escrow accept) | Royalties on plain `transfer` or zero-price `sell`, which are royalty-free by design |
| Open source (MIT) with automated review passes | Formally audited. Start small |
| Browser mint through Kaspire | Browser buy, sell or offers: those run through the CLI today |

## Mainnet status

The v12 mainnet genesis is a **single-edition series**: factory lane `1569a69f…9c09`, one DAG-city edition (serial `2884738305227171331`), primary price **1 KAS**, 5% resale royalty, engine hash `16440384…eaa4`. Its lane is sold out. The site recomputes every one of these from chain data and shows PASS or FAIL for each check. Do not take this paragraph on faith: open the site, or run `node verify-render.js`.

## Use it

```bash
git clone https://github.com/weirdtualguy/Reliks.git && cd Reliks
npm install
npm test          # network-free: codecs, engines, chain library, wallet layer, site guards
npm run site      # rebuild docs/index.html (the GitHub Pages site)
```

Open `docs/index.html` from any static server. There is no build step and no bundler.

### Wallet

| Path | Needs | Notes |
|---|---|---|
| **Kaspire Extension** (Chromium) | Nothing else | Injected `window.kaspire`. Signs your funding input and broadcasts with `pushTx`. Default. |
| **Kaspire Mobile** (Android) | WalletConnect, loaded only when chosen | Connects and signs. Public REST cannot carry covenant transactions, so broadcasting needs your own wRPC node address (or use the extension). |

Neither path gives the site a key. After signing, the site checks that every input, output and covenant binding still matches what you reviewed, and only then broadcasts. Details: [docs/WALLET.md](docs/WALLET.md).

### Publish a series (CLI, needs the external Silverscript compiler `silverc`)

```bash
cp secrets.env.example secrets.env   # PC_PRIV, PC_WALLET (+ PC_NET / PC_MAINNET_WRPC for mainnet)
set -a; . ./secrets.env; set +a
node reliks-lens.js my-engine.js                       # engine gate suite (or design it in the site's Studio tab)
node gen-factory-args.js series-my-engine.json
# compile sil/SeriesFactory-v12.sil with those args -> data/factory-abi-v12.json
npm run deploy && npm run mint && npm run verify && npm run gallery
```

Full sequence: [docs/MAINNET-RUNBOOK.md](docs/MAINNET-RUNBOOK.md). To list another series on the site, add it to [`data/mainnet-anchors.json`](data/mainnet-anchors.json) and run `npm run site`; the page treats every anchor as a claim to verify.

## Contracts

| Contract | Role |
|---|---|
| `SeriesFactory-v12` | Mint lanes: pays the artist, spawns an edition, decrements `mints_left`; `fork` splits a lane, `close` ends it |
| `ReliksEdition-v12` | The NFT: list / unlist / buy / sell / transfer / spend, royalty-only exact splits, carrier conservation |
| `OfferEscrow-v5` | Offers: owner-signed atomic `accept`, or permissionless `expire` refund |

Serials come from the consumed mint-lane outpoint, so parallel lanes never collide. Older versions are kept in `sil/legacy/` and `data/legacy/` as history; the v12 sources are frozen templates.

## Layout

| Path | Contents |
|---|---|
| `sil/`, `data/` | Canonical contracts and compiled ABIs; `data/mainnet-anchors.json` is what the site verifies |
| `web/` | Zero-dependency browser code: `blake2b.js`, `reliks-chain.js` (state codec, lane resolution, mint builder, post-sign verification), `kaspire.js` (wallet), `site-app.js`, `site.css` |
| `gen-site.js` | Builds the single-file `docs/index.html` (inlines everything; fails if an anchor stops matching its engine) |
| `reliks-templates.js` | Derives the browser contract templates from the compiled ABIs, so there is no pasted copy to drift |
| `reliks-lib.js`, `network.js`, `config.js`, `deploy-v12.js`, `mint-v12.js`, `secondary-v12.js`, `offer-v5.js`, `accept-v5.js` | Node reference builders |
| `reliks-lens.js`, `verify-render.js`, `gen-gallery.js` | Engine gates, chain-anchored verification, standalone gallery |
| `test/` | `self-test.js`, `chain-test.js`, `wallet-test.js`, `site-test.js` |

## Dependencies

Browser: none. The site is one HTML file with no external scripts, styles or fonts. The only optional third-party code is the pinned WalletConnect SDK, fetched when a visitor explicitly chooses Kaspire Mobile.
Node tooling: `@noble/curves`, `@noble/hashes`, `ws`.

## Building on Reliks

The base protocol stays fee-neutral. Marketplaces can fork `OfferEscrow-v5` to add their own premium field. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT
