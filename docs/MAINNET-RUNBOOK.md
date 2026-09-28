# Mainnet runbook (v12)

## Prerequisites
1. A trusted mainnet wRPC endpoint (own node recommended). Covenant spends cannot use REST.
```bash
export PC_NET=mainnet
export PC_MAINNET_WRPC="ws://localhost:17110"      # comma-separate multiple
export PC_PRIV=<64-hex mainnet key>
export PC_WALLET=<address of that key>             # checked against PC_PRIV at startup
```
2. Series config (`data/examples/series.example.json` is the template):
```json
{ "artist": "<64-hex x-only pubkey>", "price": 100000000, "royalty_bips": 500, "mints_left": 8 }
```
   Price is 0 or at least 1 KAS; `royalty_bips` is 1 to 2000.
3. The Silverscript compiler `silverc`. Compile against fixed template args in `data/edition-args.json` and `data/escrow-args.json`.

## Steps
```bash
node reliks-lens.js reliks-engine-mainnet.js            # 1. engine must be green
node gen-factory-args.js data/series-mainnet.json       # 2. writes data/factory-args-v12.json
# 3. compile sil/SeriesFactory-v12.sil with those args -> data/factory-abi-v12.json
node deploy-v12.js                                      # 4. genesis; writes data/factory-ledger-v12.json
node mint-v12.js                                        # 5. mint next edition
node verify-render.js                                   # 6. all gates must PASS
node gen-gallery.js                                     # 7. self-contained gallery HTML
```
Secondary market:
```bash
node secondary-v12.js list <edition-index> <price-sompi>
node secondary-v12.js buy  <edition-index>
node offer-v5.js <edition-index> <ask-sompi> <expire-daa>
node accept-v5.js
```
Defaults target the v12 files and `reliks-engine-mainnet.js`. Override with `RELIKS_ENGINE`, `RELIKS_ARGS`, `RELIKS_LEDGER`, `RELIKS_FACTORY_ABI`. `verify-render.js` fails fast if the engine hash differs from the ledger's `program_hash`.

## Monitoring
`https://kascov.io/mainnet/c/<covenant-id>` and `https://kascov.io/mainnet/tx/<txid>`.

## Troubleshooting
- "orphan where orphan is disallowed": endpoint lag; rotation tries the next one. Wait ~10 s.
- "already in the mempool": tx is valid and pending. Don't re-run; poll kascov.
- "NOT confirmed within 120000ms": REST and kascov both silent. Check connectivity, then kascov before retrying.
- "covenant spend requires wRPC": every endpoint rejected; verify they are mainnet-capable.
- "PC_WALLET does not match": stale `PC_WALLET` from another key.
