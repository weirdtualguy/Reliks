# Mainnet Runbook

This runbook covers deploying and operating a canonical Reliks series on Kaspa mainnet.

## 1. Prerequisites

1. Verify that all canonical contract hashes match `TEMPLATE-HASHES.json`:
   ```bash
   node tools/verify-contract.js
   node tools/check-deprecated-hashes.js
   ```
2. **Generate a fresh mainnet key on your own device:**
   ```bash
   node tools/gen-mainnet-key.js
   set -a; . ~/.reliks-mainnet.env; set +a
   ```
   Never paste or pass your mainnet private key into any chat or sandbox.
3. **Configure raw JSON wRPC endpoints (never set `PC_USE_SDK=1` for covenant spends):**
   ```bash
   export PC_MAINNET_WRPC=wss://emma.kaspa.stream/kaspa/mainnet/wrpc/json,wss://eva.kaspa.green/kaspa/mainnet/wrpc/json
   unset PC_USE_SDK
   ```

## 2. Browser Deployment (Recommended for Artists)

1. Open [`docs/index.html#studio`](https://weirdtualguy.github.io/Reliks/#studio), load or write your Reliks-VM program, and click **Run gates**.
2. Set your **Price** (`>= 1 KAS`), **Royalty %** (`5%–20%`), and **Editions** count, then click **Publish on Chain (Kaspire)**.
3. Once confirmed, click **Submit to Marketplace (GitHub)** to list your series Anchor JSON in [`data/mainnet-anchors.json`](../data/mainnet-anchors.json).

## 3. CLI Deployment

```bash
node cli/reliks-lens.js my-program.txt
PROG_FILE=my-program.txt node cli/gen-factory-args.js series.json data/factory-args.json
RELIKS_ARGS=data/factory-args.json RELIKS_LEDGER=data/ledger-mainnet.json node cli/deploy.js
RELIKS_LEDGER=data/ledger-mainnet.json node cli/mint.js
```
