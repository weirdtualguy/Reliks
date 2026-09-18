# Reliks Protocol

**Reliks** is a fully UTXO-native, covenant-enforced NFT protocol built on the Kaspa Mainnet DAG using the Toccata programmability stack. 

Unlike account-based smart contract chains, Reliks enforces ownership, royalties, and protocol fees purely through cryptographic state transitions in Kaspa's UTXO model. No intermediary holds funds, and no centralized database tracks ownership. The rules are etched into the DAG forever.

## 🏛️ Genesis Artifacts (Kaspa Mainnet)

The Reliks Genesis series (Supply: 1) was permanently deployed to Kaspa Mainnet on September 19, 2026.

| Artifact | Identifier / Hash |
| :--- | :--- |
| **Factory Covenant ID** | `63fccd996d17aaf8e7dcfe0f19c0be253c6789f3b7b41044ac0df54a3f6ae6cb` |
| **Edition Covenant ID** | `23b4157d1ae02951...` |
| **Genesis Mint Tx** | [`4490949a4b60571b5be9a2efb5b32104dee4af7864d53a8cfc505fad8330919b`](https://explorer.kaspa.org/transactions/4490949a4b60571b5be9a2efb5b32104dee4af7864d53a8cfc505fad8330919b) |
| **Art Reveal Tx** | [`f28990f7918778b519aa113a8108d40cf0b2ac231cd1f4e7ec9b94ec62ab7042`](https://explorer.kaspa.org/transactions/f28990f7918778b519aa113a8108d40cf0b2ac231cd1f4e7ec9b94ec62ab7042) |
| **Program Hash (BLAKE2b)** | `5b6a913b5640f4841573a24f03fd66895309002cfd54be228673aa7fcb30571f` |

## ⚙️ Core Architecture

Reliks is built on three hand-written Silverscript (Toccata) covenants:

1. **SeriesFactory-v8**: Manages the issuance lanes, bakes the generative art `program_hash` into state, and enforces the primary mint split.
2. **Edition-v4**: The NFT state machine. Enforces exact-equality secondary market splits (5% Artist Royalty + 1% Reliks Protocol Fee) and prevents unauthorized state transitions.
3. **OfferEscrow-v2**: A trustless bidding/offer system with exact-equality refund mechanics and relative DAA-score time locks.

### Key Features
* **Math-Enforced Royalties:** The 5% royalty and 1% protocol fee are not platform suggestions; they are exact-equality consensus requirements. A secondary sale transaction will be rejected by the Kaspa network if the outputs do not perfectly match the covenant's fee math.
* **Trustless 16KB Art Pipeline:** Generative art programs (up to 16KB) are hidden on-chain via a `commit -> reveal` pipeline. The art bytes are permanently inscribed in the transaction signature scripts.
* **Mass-Safe Parameter Set:** Carefully calibrated `MIN_PRICE` (5 KAS) and `DUST` (1 KAS) thresholds ensure that covenant UTXOs never violate Kaspa's storage mass limits, preventing accidental UTXO consolidation failures.
* **Mobile-First Audit:** The entire protocol, including reverse-engineering the Kaspa v1 REST API schema and bridging wRPC network gaps, was audited and deployed to mainnet entirely from a Termux shell on an Android device.

## 🖼️ The Trustless Gallery

The repository includes `reliks-gallery.html`, a zero-backend, trustless NFT viewer. 

When you open the gallery, it:
1. Fetches the Art Reveal transaction directly from the Kaspa REST API.
2. Parses the signature scripts to reconstruct the raw HTML/JS art program bytes.
3. Hashes the reconstructed bytes using BLAKE2b.
4. **Refuses to render** unless the hash perfectly matches the `program_hash` baked into the Factory Covenant's on-chain state.
5. Renders the art in a sandboxed `<iframe>` with a gold disclosure panel showing the exact on-chain fee split.

To view the Genesis piece locally:
```bash
# Ensure you have a local server or just open the file directly
termux-open reliks-gallery.html
```

## 📂 Repository Layout

* **`/` (Root)**: Active Node.js builders, CLI utilities, and core libraries (`v8-lib.js`, `network.js`).
* **`data/`**: Mainnet ledger state, chunk registries, and ABI/constructor artifacts.
* **`sil/`**: The raw Silverscript (`.sil`) source code for the Toccata covenants.
* **`web/`**: Gallery UI assets and the generated mainnet registry JSON.
* **`archive/`**: The complete audit history, including 90+ patch scripts, network probes, testnet backups, and legacy protocol iterations.
* **`docs/`**: Reference materials and session snapshots.

## 🛡️ Security & Immutability

Covenants on Kaspa are immutable. The bytecode of a live covenant UTXO cannot be patched or upgraded. If a bug is discovered in a deployed covenant, the value is never trapped (escape hatches like `spend` and `expire` are built-in), but the template must be redeployed as a new genesis. 

The Reliks Genesis factory lane remains permanently open on the DAG with `mints_left: 0`, serving as an immutable monument to the protocol's launch.

---
*Built on Kaspa. Enforced by Math.*
