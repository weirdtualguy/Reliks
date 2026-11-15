# Mainnet runbook — v13-fixed (phase 3), throwaway series first

Claude's rule: **don't go to mainnet yet — do a throwaway series first, then
the real genesis, both on your own device (Termux).** The 5M royalty floor
rests on a third-party page + testnet behavior, not a mainnet mass check,
and the floor is baked into the template — a wrong guess means a new
template hash and a new genesis. This runbook is the exact sequence.

## 0. What is already fixed (do not change before the throwaway)

- Contracts: `contracts/ReliksEdition.sil`, `contracts/OfferEscrow.sil`,
  `contracts/SeriesFactory.sil` (branch `v13-fixed`). Deploy only from
  `contracts/`.
- ABIs: `audit-test/v13-fixed/out/{edition,escrow,factory}.json` —
  network-independent, no recompile needed for mainnet.
- Template hashes (`TEMPLATE-HASHES.json` at the repo root):
  edition `9106b142…`, escrow `18e3d59a…`, factory `029512ea…`.
  Run `node tools/verify-contract.js` first — it hard-fails on any mismatch.
- Constants: `MIN_ROYALTY_OUT = 5_000_000`, factory min royalty 5%
  (`royalty_bips >= 500`), `MIN_PRICE` 1 KAS.
- Builders: `deploy-mainnet.js`, `mint-mainnet.js`,
  `secondary-mainnet.js` in `audit-test/v13-fixed/` (copies of the
  testnet-fixed builders with the guard flipped to `PC_NET=mainnet`).

## 1. Prerequisites (on the device, Termux)

1. Check out branch `v13-fixed` and confirm the template hashes match
   `TEMPLATE-HASHES.json` (recompile with silverc if you want to verify).
2. **A fresh mainnet key, generated on the device.** Never reuse the
   testnet key. Never paste the mainnet key, or env-pass it, into any
   agent sandbox or chat — it lives only on the device.
   Keep it in a file only you can read, e.g. `~/.reliks-mainnet.env`
   (`chmod 600`), loaded per shell with:
   ```bash
   set -a; . ~/.reliks-mainnet.env; set +a
   ```
   The file holds `PC_NET=mainnet`, `PC_PRIV=<64-hex>`,
   `PC_WALLET=<kaspa: address of that key>`. The builders check
   `PC_WALLET` against `PC_PRIV` at startup and refuse on mismatch.
3. **A mainnet wRPC endpoint — raw JSON wRPC only (2026-11-15).**
   **Never `PC_USE_SDK=1` for covenant spends.** The SDK/Borsh submit path
   corrupts large covenant txs (a mint was rejected "script ran, but
   verification failed" on 3 live nodes while the identical tx mined via
   raw JSON wRPC on testnet). The SDK is only for node discovery and small
   non-covenant txs. Use raw JSON wRPC with failover:
   ```bash
   export PC_MAINNET_WRPC=wss://emma.kaspa.stream/kaspa/mainnet/wrpc/json,wss://eva.kaspa.green/kaspa/mainnet/wrpc/json
   # PC_USE_SDK must be UNSET
   ```
   These are the only two live mainnet JSON wRPC endpoints (probed
   2026-11-15). The resolver fleet otherwise serves Borsh only, and the
   kaspa-ng proxies (`us-1`/`eu-1.kaspa-ng.org`) are retired. Covenant
   spends still cannot use REST (it drops `computeBudget`).
   Proven on mainnet 2026-11-15: the throwaway rehearsal (genesis + mint
   + list + buy) all mined via raw JSON wRPC.
4. Node + `ws`. Try the real `ws` package first. If wRPC fails with
   `SSL routines: wrong version number`, use the shim instead: copy
   `audit-test/node_modules/ws/` (package `ws@9.9.9-shim`, a wrapper
   around Node's global WebSocket) over `node_modules/ws`, or run with
   `NODE_PATH` pointing at the directory that holds the shim.
5. Fund the fresh key with **~10 KAS** (throwaway budget — see §3).
   Nothing else needs funding.

## 2. Throwaway series config

Same contracts, same numbers as testnet, new artist (your fresh key):

```json
{ "artist": "<64-hex x-only pubkey of the fresh mainnet key>",
  "price": 200000000, "royalty_bips": 500, "mints_left": 4 }
```

```bash
node audit-test/v13-fixed/gen-factory-args-fixed.js series-mainnet-throwaway.json audit-test/v13-fixed/factory-args-mainnet-throwaway.json
```

The deploy runs genesis validation first (artist key, royalty 500–2000,
`mints_left > 0`, `program_hash == blake2b(engine_code)`) and refuses a
bad genesis — that check is in the tooling because the script cannot
check its own constructor.

## 3. Throwaway sequence (the real mainnet mass check)

```bash
export RELIKS_ARGS=audit-test/v13-fixed/factory-args-mainnet-throwaway.json
export RELIKS_LEDGER=audit-test/v13-fixed/ledger-mainnet-throwaway.json

node audit-test/v13-fixed/deploy-mainnet.js        # genesis; 1 KAS lane
node audit-test/v13-fixed/mint-mainnet.js          # mint edition 0 (serial 0)
node audit-test/v13-fixed/secondary-mainnet.js list 0 100000000   # list 1 KAS @ 5%
node audit-test/v13-fixed/secondary-mainnet.js buy 0              # THE MASS CHECK
```

Cost: deploy lane 1 KAS + mint (price 2 KAS + 1 KAS carrier) + list/buy
fees + the 1 KAS buy itself ≈ 5 KAS + fees; 10 KAS funding covers it.
(The buy is from the same wallet — a wash, fine for a throwaway whose
only purpose is the mass check. Use a second funded key if you want a
two-party buy.)

**Interpret the buy:**
- **Buy mines → mainnet cap is 500k → ship the 5M floor.** The real
  series goes on the same template hashes.
- **Buy rejected with a mass error (mass > 100,000) → mainnet is still
  100k → switch the floor to 25M**, recompile all three contracts (new
  template hashes), regenerate args, redeploy the throwaway, re-run the
  buy. Only then start the real series, on the 25M template.

**Update 2026-11-15: the throwaway already PASSED** (genesis `aaa1b9b9…`,
mint `3bb75c97…`, list `89ac1e57…`, buy `a1240b00…`, all mined on mainnet;
royalty exactly 5,000,000 = the floor). **The 5M floor SHIPS; the 25M
fallback is DEAD.** The "buy rejected" branch above is now historical —
it did not happen. The real genesis (§4) runs on the same template
hashes (`029512ea…`, `9106b142…`, `18e3d59a…`).

Verify each step on `https://kascov.io/mainnet/tx/<txid>` and the lane at
`https://kascov.io/mainnet/c/<covenant-id>`.

## 4. Real genesis (only after the throwaway passes)

1. Fresh series config for the real series (same contracts; new artist
   key if you want it separate from the throwaway key — never reuse the
   throwaway key's funds blindly, it is still your key, just a different
   series).
2. Regenerate args, deploy, mint, and smoke-test list + buy on mainnet.
3. Record the real genesis tx + lane covenant id in the report.

## 5. Operational rules (standing)

- **Wallet UI: warn offerers to cancel stale offers.** The accept-side
  hole stays open by design (offers are fillable until cancelled /
  expired / accepted); the `cancel` entry is the mitigation, and the UI
  must surface it.
- **Indexer (M4): show an edition only if its genesis tx spent a lane
  of the real factory covenant.** Checker:
  `tools/check-edition-genesis.js <mintTxId> <editionIndex>
  <factoryCovenantId>` (testnet-verified both ways).
- **Lineage is cosmetic only; cap the wear effect.** Lineage is
  grindable by whoever takes ownership (N1); `sales` is cheap to inflate
  (N2) and is not proof of demand. Do not let either drive rarity or
  pricing.

## Troubleshooting

- `PC_NET=mainnet requires PC_MAINNET_WRPC` — set §1.3.
- `orphan where orphan is disallowed` — endpoint lag; rotation tries the
  next one. Wait ~10 s and retry (a rejected tx consumes nothing).
- `already in the mempool` — tx is valid and pending. Don't re-run; poll
  kascov.
- `SSL routines: wrong version number` — use the `ws` shim (§1.4).
- `PC_WALLET does not match` — stale `PC_WALLET` from another key.
- `GENESIS VALIDATION FAILED` — fix the series config (royalty must be
  500–2000, artist a valid x-only key, `mints_left > 0`); the script
  cannot deploy a bad genesis, and bypassing the check (as the 499
  testnet test did) only proves the on-chain floor — never do it for a
  real series.
