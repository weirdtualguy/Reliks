# Contributing to Reliks

Reliks is a decentralized, open-source public good. We welcome contributions that enhance security, improve tooling, or build new user interfaces on top of the protocol.

## 🧠 Philosophy

- **UTXO-Native First**: Do not model covenants as account-style global mutable contracts. State lives in the redeem script preimage, and transitions must validate successor outputs.
- **Zero-Fee Core**: The base protocol extracts no rent. If you are building a marketplace UI, your fees should be optional and implemented via forked escrow contracts, not baked into the core Reliks covenants.
- **Security Over Speed**: Any changes to `.sil` contracts or `reliks-lib.js` must be accompanied by rigorous testing and, ideally, a formal audit.

## 🛠 How to Contribute

1. **Fork and Clone**: Start by forking the repository and cloning it to your local machine.
2. **Understand the Stack**: Before writing code, read the reference documents in the repo (or the Kaspa Toccata documentation) to understand:
   - Covenant State and Transaction V1 semantics.
   - Silverscript syntax and DECL macro lowering.
   - The KCC20 model for inter-covenant communication.
3. **Make Your Changes**: 
   - Keep changes focused and atomic.
   - Ensure your code adheres to the existing style and naming conventions.
   - Update the ABI artifacts (`data/*.json`) if you modify any contract state or entrypoints.
4. **Test Thoroughly**: Run `npm test` and `verify-render.js` (and the reference builders on testnet) to ensure your changes do not break the trustless verification chain.
5. **Open a Pull Request**: 
   - Clearly describe the problem you are solving.
   - Explain your solution and how to test it.
   - Link any relevant issues or audit reports.

## 🚫 What We Won't Accept

- Changes that introduce centralized dependencies or trust assumptions.
- Modifications to the core economic model (e.g., adding hidden platform fees to the base contracts).
- Code that fails the `reliks-lens.js` security gates (e.g., using `Math.random`, `Date`, or `eval` in generative engines).

## 💬 Community

For discussions, questions, or to propose new features, please open a GitHub Discussion or reach out via the Kaspa developer channels.
