# Audit summary

Condensed from the automated review passes in `docs/audit-log/raw/` and the
maintainers' remediation notes. Reviewed sources were v11; v12 carries every
fix and the deliberate decisions below. This is not a formal third-party audit.

| Finding (source) | Severity | Status |
|---|---|---|
| Escrow accept exceeded testnet-10 storage-mass cap (3-input, 524202 vs 500000) | High | Fixed: 2-input accept, offer locks `askPrice + FEE_BUFFER`. |
| Escrow royalty split sourced from offerer-declared fields | High | Fixed: `accept` binds `royalty_bips` and `artist` to the edition's authenticated state. |
| Covenant-ID ownership was dead code with no spend linkage; unconstrained `spend` | Critical | Reverted before freeze. Ownership is strict pubkey; `identifierType` kept in the schema for forward compatibility. |
| Escrow owner payment tolerated 0.1 KAS shortfall | Low | Fixed: exact equality. |
| `close()` had no successor check | High | Covered by the DECL `close` policy (termination allowed, empty state list). |
| `royalty_bips >= 1` "bricks" 0% series | Flagged | By design: a zero-value royalty output is consensus-invalid, so 0% editions would be unsellable. |
| `buyerScheme == IDENTIFIER_PUBKEY` hardcoded | Flagged | By design (see covenant-ID entry). Builders assert scheme 0 and a valid x-only key. |
| Unbounded engine size | Medium | Client gate: `reliks-lens.js` enforces the real PUSHDATA2 ceiling (25641 B default). |
| Output-index aliasing (`artistOutIdx == platformOutIdx`) | Info | Distinctness guards in Edition and Escrow; negative test rejected on-chain (testnet). |
| Free mints paid a treasury fee | Low | Removed with the v12 zero-fee pivot. |
| Stale `PC_WALLET` cross-wiring funding and signing | Operational | Fixed: `reliks-lib.js` derives the address from `PC_PRIV` and refuses to run on mismatch. |
| Mainnet REST cannot carry `compute_budget` | Operational | Covenant spends are wRPC-only; `network.js` exits on mainnet without `PC_MAINNET_WRPC`. |

## Known accepted risks
- **Listing sniping:** an underpriced open listing can be bought by anyone first. Seller always receives the listed price.
- **WalletConnect SDK** is no longer part of the page. The default path (Kaspire Extension) uses an injected provider with no third-party code. The Kaspire Mobile path fetches one pinned `@walletconnect/sign-client` build from esm.sh only after the visitor chooses it; the verification path and the extension flow never load it. Vendoring it would remove the last CDN dependency (see docs/WALLET.md).
- **Off-chain honesty of transfers:** `transfer` and zero-price `sell` are royalty-free by design (custody moves).
