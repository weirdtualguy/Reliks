# Reliks

**Zero-fee, UTXO-native generative art NFTs on Kaspa.** The artwork is a small deterministic program whose hash is baked into a covenant. Anyone can re-render any edition from public chain data. No IPFS, no server, no platform cut.

## Why it's different
- **Art is code, anchored on-chain.** `program_hash = blake2b(engine)` lives in covenant state. The image is `render(engine, serial)`, so it survives pruning and can't be swapped.
- **Zero rent.** Primary sale: `artistCut == price`. Secondary sale: `owner >= price - royalty`, `artist == royalty`, enforced by exact-equality covenant checks.
- **Serials without shared state.** Serial = hash of the consumed mint-lane outpoint, so parallel mint lanes never collide.
- **Verify, don't trust.** The gallery reconstructs every P2SH script from claimed state and compares it to chain data. The registry is only a hint. Art is withheld on any mismatch.
- **Artist-controlled royalties for everyone.** The escrow binds the split to the edition's authenticated state, so third-party integrations can't bypass it.

## Contracts (`sil/`)
| Contract | Role |
|---|---|
| `SeriesFactory-v12` | Mint lanes: pays artist, spawns edition, decrements `mints_left`; `fork` splits a lane, `close` ends it. |
| `ReliksEdition-v12` | The NFT: list / unlist / buy / sell / transfer / spend, royalty-only exact splits, carrier conservation. |
| `OfferEscrow-v5` | Trustless offers: `accept` (owner-signed atomic swap) or permissionless `expire` refund. |

Older versions live in `sil/legacy/` and `data/legacy/` as history. The v12 sources are the frozen templates; changing them changes template hashes.

## Quick start
```bash
git clone https://github.com/weirdtualguy/Reliks.git && cd Reliks
npm install
npm test            # network-free self-test: address codec, BLAKE2b, engines, repo integrity
```

Publishing a series (needs the external Silverscript compiler `silverc`):
```bash
cp secrets.env.example secrets.env   # fill PC_PRIV, PC_WALLET (and PC_NET / PC_MAINNET_WRPC for mainnet)
set -a; . ./secrets.env; set +a
node reliks-lens.js reliks-engine-mainnet.js      # engine gate suite
node gen-factory-args.js data/examples/series.example.json
# compile sil/SeriesFactory-v12.sil with those args -> data/factory-abi-v12.json
npm run deploy && npm run mint && npm run verify && npm run gallery
```
Full sequence: [docs/MAINNET-RUNBOOK.md](docs/MAINNET-RUNBOOK.md).

## Layout
| Path | Contents |
|---|---|
| `sil/` | Canonical contracts (`legacy/` for history) |
| `data/` | Canonical ABIs and template-compile args (`legacy/`, `examples/`) |
| `reliks-lib.js`, `network.js`, `config.js` | Tx construction, signing, fee discovery, network profiles |
| `deploy-v12.js`, `mint-v12.js`, `secondary-v12.js`, `offer-v5.js`, `accept-v5.js` | Reference builders |
| `gen-factory-args.js` | Series config to compiler args |
| `reliks-lens.js` | Pre-deploy gate for generative engines (L0-L10) |
| `verify-render.js`, `gen-gallery.js` | Chain-anchored verification and self-contained gallery |
| `web/`, `gen-site.js`, `gen-studio.js` | Browser runtime, site and Studio generators |
| `docs/` | Architecture, runbook, audit summary, engineering notes |

## Dependencies
Runtime: `@noble/curves`, `@noble/hashes`, `ws`. The browser gallery ships a zero-dependency BLAKE2b that is cross-validated against `@noble/hashes` at build time. The Studio and site load the WalletConnect SDK from a pinned esm.sh URL (see [docs/AUDIT-SUMMARY.md](docs/AUDIT-SUMMARY.md)).

## Status
The maintainers' notes record a v12 mainnet genesis (factory `029c14e5…b904`, one DAG-city edition, engine hash `16440384…eaa4`). Don't take that on faith: point `verify-render.js` at a ledger and check.

## Building on Reliks
The base protocol stays fee-neutral. Marketplaces can fork `OfferEscrow-v5` to add their own premium field. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License
MIT
