# Reliks: A Decentralized, Zero-Fee Generative Art Protocol on Kaspa

Reliks is a UTXO-native, covenant-based protocol for generative art NFTs on the Kaspa BlockDAG. It enforces trustless, on-chain royalties, carrier conservation, and deterministic rendering without relying on centralized servers, IPFS, or extracting platform fees.

## 🌟 Key Features

- **Zero-Fee Protocol**: 100% of the primary mint price goes directly to the artist. Secondary sales enforce exact-equality royalty splits (artist + owner) with **no platform rent extraction**.
- **Trustless Verification**: Every edition's engine, serial, and state are cryptographically anchored to the Kaspa BlockDAG. Anyone can verify the art locally using the provided gallery runtime without trusting a central API or server.
- **UTXO-Native Covenants**: Built with Silverscript, Reliks uses stateful UTXOs to enforce rules like carrier conservation (preventing value stripping) and deterministic serial derivation from lane outpoints.
- **Prune-Independent**: The protocol uses live UTXO anchoring, ensuring editions can be verified even if historical transaction data is pruned from the network.

## 🏗 Architecture

The protocol consists of three core covenant templates:

1. **`SeriesFactory-v12`**: Spawns editions, enforces carrier floors, and bakes the engine hash. It manages parallel minting lanes and ensures the artist receives the full mint price.
2. **`ReliksEdition-v12`**: The NFT asset state machine. It enforces exact-equality royalty splits on secondary sales and guarantees carrier conservation across all state transitions.
3. **`OfferEscrow-v5`**: A trustless, fee-neutral atomic swap contract for secondary market trades. It locks buyer funds and enforces the royalty split without taking a platform cut.

## 📂 Repository Structure

This repository contains the **Trustless Core** and **Reference Tooling** required to interact with the protocol.

- `sil/`: Silverscript source code for the covenants.
- `data/`: Compiled ABI artifacts (the API schema and dispatch tags for the contracts).
- `web/`: Trustless gallery runtime (`reliks-gallery-runtime.js`) and lens verification tools (`reliks-lens.js`).
- `*.js`: Reference builders and tooling for deploying, minting, and trading.
- `docs/`: Operational runbooks and architectural guides.

## 🚀 Getting Started

1. **Clone the repository**:
```bash
   git clone https://github.com/weirdtualguy/Reliks.git
   cd Reliks
```
2. **Install dependencies**:
```bash
   npm install
```
3. **Review the Runbook**:
   Read `docs/MAINNET-RUNBOOK.md` for the exact operational sequence for key generation, series configuration, and deployment.

## 🤝 Building on Reliks

Reliks is a public good. Because the core protocol is fee-neutral, developers are encouraged to build custom UIs, marketplaces, and galleries on top of it. If you wish to monetize a marketplace, you can fork `OfferEscrow-v5` to add an optional `marketplace_bips` field, while the base Reliks protocol remains free and open.

## 📜 License

This project is open-source and available under the MIT License. See the `LICENSE` file for details.
