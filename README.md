# Reliks: Prune-Proof Generative Art on Kaspa L1

Reliks is a generative art NFT protocol and marketplace built natively on **Kaspa Toccata L1 Covenants** using SilverScript. 

Unlike traditional NFTs that rely on IPFS or centralized servers (which can die, taking the art with them), Reliks is **prune-proof**. The artwork is not stored as an image file; it is stored as a deterministic, integer-only mathematical engine anchored directly into the UTXO set. The art is a *consequence* of the chain state, regenerated trustlessly by anyone, anywhere, forever.

## 🏗️ Architecture (v11)
- **Covenant-Native:** Built on Kaspa's UTXO model using `SeriesFactory` and `ReliksEdition` covenants.
- **Model B Economics:** Three consensus-enforced revenue streams:
  1. **Mint Cut:** Fixed 1 KAS platform fee per paid mint.
  2. **Royalties:** Universal, on-chain artist royalties on every secondary sale.
  3. **Marketplace Premium:** 1% buyer-side premium handled via `OfferEscrow` covenants.
- **Trustless Gallery:** The `reliks-gallery-runtime.js` verifies the lineage of every edition output-by-output against live Kaspa nodes. If the chain data doesn't match the mathematical anchors, the art is withheld.
- **Zero IPFS:** No external storage dependencies. The engine bytes are physically embedded in the factory's redeem script and verified via the F1 gate.

## 📂 Repository Structure
- `sil/`: Frozen SilverScript covenant sources (v11 Factory, v11 Edition, v4 Escrow).
- `data/`: Compiled ABI artifacts, live testnet ledgers, and constructor arguments.
- `web/`: Browser-side gallery runtime and trustless verification logic.
- `*-lib.js`: The KCC-1 codec, UTXO pickers, and wRPC broadcast layers.
- `*-v11.js` / `*-v4.js`: The builder scripts for deploying, minting, and trading.

## 🚀 Running the Verifier
To verify the testnet rehearsal lineage trustlessly:
```bash
npm install @noble/hashes @noble/secp256k1 ws
node verify-render-v10.js
```

## ⚠️ Mainnet Status
The v11 template set is **frozen and audited**. Mainnet deployment requires offline key generation and the `secrets.mainnet.env` file (never committed to git).

*Built entirely on Termux/Node.js. No smart-contract VMs, no EVM wrappers. Pure Kaspa.*
