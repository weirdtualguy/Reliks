# Audit Summary

Condensed from static security reviews, the `testnet-10` on-chain exploit and negative test suite, `kaspa-redteam` consensus fuzzing (rusty-kaspa validator in-process), and the mainnet rehearsal. This is not a formal third-party audit.

## Canonical Contracts (`contracts/`, `TEMPLATE-HASHES.json`)
- `contracts/SeriesFactory.sil` — `029512ea7fa65643f5bc82f125cd23eb09b4ed5b2fe8fc9d33e5769cc3eb1014` (`144 B` state span, 8 fields)
- `contracts/ReliksEdition.sil` — `9106b1426f4bb67ba4133d040b5258a9f177939c338266d249a1f8780e0ea2e5` (`203 B` state span, 10 fields)
- `contracts/OfferEscrow.sil` — `18e3d59aa9403539ccb8bd04ef2c9c81fe21f0602f3ff55e9e6f0ce375d17a2b` (`161 B` state span, 8 fields)

| ID | Finding | Severity | Resolution & Verification |
|---|---|---|---|
| **C1** | `OfferEscrow.accept` did not bind `editionOutIdx` to the edition input's authorized output | Critical | **Resolved & Verified on-chain:** `require(OpAuthOutputCount(editionInIdx) == 1)` and `require(editionOutIdx == OpAuthOutputIdx(editionInIdx, 0))`. |
| **H1** | Payment outputs checked at caller-chosen indices could be shared across multiple covenant inputs | High | **Resolved & Verified on-chain:** Payment outputs pinned immediately after the authorized output (`base + 1`, `base + 2` in Edition/Escrow; `editionOutIdx + 1` in Factory). |
| **IN-01** | (`kaspa-redteam`) Two identical `OfferEscrow` inputs spent together could share one refund/payment output | High | **Resolved & Verified (`kaspa-redteam` 0 findings + on-chain):** `expire` binds refund to `tx.outputs[this.activeInputIndex]`; `accept` requires `this.activeInputIndex == editionInIdx + 1`. |
| **IN-03** | Cross-contract output collision between `OfferEscrow.expire` refund and `ReliksEdition.buy` seller payment | Medium-High | **Resolved & Verified on-chain:** `OfferEscrow.expire` requires `require(tx.inputs.length == 2)` (`[escrow, funding]`). |
| **M1** | Sub-dust royalty outputs could exceed the 500,000 storage-mass cap | Medium | **Resolved & Rehearsed on Mainnet:** `MIN_ROYALTY_OUT = 5,000,000` sompi (`0.05 KAS`) and `MIN_ROYALTY_BIPS = 500` (`5%`). Mainnet `1 KAS @ 5%` buy mined at mass `15,603`. |
| **M2** | Outpoint-derived serials could be ground by chaining mints | Medium | **Resolved & Verified on-chain:** Replaced with monotonic `next_serial` counter in `SeriesFactory` state (split into disjoint ranges on `fork`). |
| **M3** | `silverc 0.1.0` cannot express `this.ageDaa < expireAge` in `OfferEscrow.accept` | Medium | **Mitigated on-chain:** Added offerer-signed `cancel(sig offererSig)` to `OfferEscrow` so offerers can withdraw stale offers at any time. |
| **M4** | Counterfeit standalone edition genesis claiming a spoofed `factory_covid` | Medium | **Enforced in Indexer & Verifier:** Indexers verify that an edition's genesis tx spent a real factory lane AND bound the edition output to a KIP-20 covenant ID. |
| **Lows** | Forked lane under 1 KAS; unvalidated factory constructor args at genesis | Low | **Resolved:** `SeriesFactory.fork` requires `>= 1 KAS` per output lane; `tools/verify-contract.js --validate` validates constructor arguments pre-deploy. |
