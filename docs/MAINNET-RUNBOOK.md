# Kaspa Mainnet Genesis — v12 Zero-Fee Protocol

## Prerequisites

1. **Trusted mainnet wRPC endpoint** (set `PC_MAINNET_WRPC`):
```bash
   # Example: own full node
   export PC_MAINNET_WRPC="ws://localhost:9013"
   
   # Example: multiple trusted nodes (comma-separated)
   export PC_MAINNET_WRPC="wss://node1.kaspa.org/wrpc,wss://node2.kaspa.org/wrpc"
```
   **Critical for covenant spends**: The previous testnet list was copy-pasted public nodes that turned out to be testnet-only. Mainnet requires your own or trusted endpoints.

2. **Mainnet keys**:
```bash
   export PC_NET=mainnet
   export PC_PRIV=<64-hex-mainnet-private-key>
   export PC_WALLET=<mainnet-kaspa-address>
```

3. **Series config** (create `data/series-mainnet-v12.json`):
```json
   {
     "artist": "<artist-pubkey-32-bytes-hex>",
     "price": 1000000000,
     "royalty_bips": 500,
     "mints_left": 1000
   }
```

## Deployment Steps

### 1. Generate mainnet factory args
```bash
node gen-factory-args-v11.js data/series-mainnet-v12.json data/factory-args-v12.json
# (Note: gen-factory-args-v11.js still has treasury logic; manually remove the
# treasury arg from the generated JSON, or create a v12 generator)
```

### 2. Deploy factory
```bash
export RELIKS_ENGINE="./reliks-engine-mainnet.js"
export RELIKS_LEDGER="data/factory-ledger-v12.json"
export RELIKS_FACTORY_ABI="data/factory-abi-v12.json"
export RELIKS_ARGS="data/factory-args-v12.json"

node deploy-v12.js
```

### 3. Mint first edition
```bash
node mint-v12.js
```

### 4. List/Secondary/Offers
```bash
node secondary-v12.js list <edition-index> <price>
node secondary-v12.js buy <edition-index>
node offer-v5.js <edition-index> <ask-price> <expire-age>
node accept-v5.js
```

## Verification

After each transaction, the builder will:
- Broadcast via wRPC (rotating endpoints on rejection)
- Confirm via kascov fallback (if REST /transactions/ returns 404)
- Auto-update the ledger (no manual seeding needed)

## Monitoring

- **Factory lane**: `https://kascov.io/mainnet/c/<lane-covenant-id>`
- **Edition lineage**: `https://kascov.io/mainnet/c/<edition-covenant-id>`
- **Transaction explorer**: `https://kascov.io/mainnet/tx/<txid>`

## Troubleshooting

- **"orphan where orphan is disallowed"**: wRPC endpoint misclassification; the rotation fix will try the next endpoint.
- **"NOT confirmed within 120000ms"**: Both REST and kascov failed; check endpoint connectivity.
- **"covenant spend requires wRPC"**: All wRPC endpoints rejected; verify endpoints are mainnet-capable.
