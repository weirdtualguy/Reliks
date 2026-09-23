# Reliks
**Trustless Generative Art on Kaspa Toccata**

Reliks is a UTXO-native generative art protocol built on Kaspa's Toccata L1 Covenants. The artwork's genome is baked directly into the chain state, rendering trustlessly from the ledger without IPFS or centralized servers.

## Architecture
- **Chain-Anchored Genomes:** The artwork's engine (integer-only JS) is baked directly into the covenant template. You cannot prune the art without pruning mathematics.
- **Trustless Verification:** Every edition is recomputed from the chain state. The gallery verifies the lineage gate suite directly in the browser against the live Kaspa UTXO set.
- **Deterministic PRNG:** Seeded xorshift randomness ensures byte-identical SVG output across Node.js and every browser, forever. Verified by dual-field lineage hashes.
- **Model B Economics:** On-chain artist royalties, marketplace escrow premiums, and permissionless secondary markets enforced entirely by covenant logic.

## Repository Structure
- `sil/` - Frozen Silverscript covenant sources (SeriesFactory, ReliksEdition, OfferEscrow).
- `data/` - Canonical series definitions and compiled portable ABIs.
- `web/` - Browser-side runtime, blake2b hashing, and Kaspire WalletConnect integration.
- `docs/` - GitHub Pages public hub (Gallery, Studio, Protocol).

## Tooling
- `deploy-v11.js` / `mint-v11.js` - Genesis and edition minting.
- `secondary-v11.js` - Direct secondary market listings and purchases.
- `offer-v4.js` / `accept-v4.js` / `expire-v4.js` - Escrow-based offers.
- `reliks-lens.js` - Pre-bake L0-L10 gate suite for engine validation.
- `verify-render-v10.js` - Post-mint chain-anchored lineage verifier.
- `gen-studio.js` / `gen-site.js` - Generators for the browser Studio and public hub.

## Prerequisites
- Node.js (v18+)
- `@noble/hashes`, `@noble/secp256k1`, `ws`
- `silverc` (Silverscript compiler)

## Mainnet Transport Requirement
Covenant spends require `compute_budget`, which Kaspa's REST broadcast drops. Therefore, **wRPC is strictly mandatory** for all covenant transactions. 
Set `PC_NET=mainnet` and provide a trusted wRPC endpoint via `PC_MAINNET_WRPC` in your `secrets.mainnet.env`. The client will hard-exit if wRPC is missing on mainnet, and strictly refuses REST fallback for covenant spends.

## Security & Audits
The protocol has undergone multiple rounds of rigorous auditing. Consensus-enforced invariants include:
- `buyerScheme == IDENTIFIER_PUBKEY`
- `royalty_bips >= 1` (prevents zero-royalty bricking)
- `program_hash == blake2b(engine_code)` (engine containment)
- Escrow `MAX_PRICE` bounds and pairwise-distinct output indices.

## License
MIT
