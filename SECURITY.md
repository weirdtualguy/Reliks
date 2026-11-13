# Security Policy

Reliks handles real value on the Kaspa mainnet. Security is our highest priority. This document outlines the security policy and procedures for the Reliks protocol.

## 🛡 Supported Versions

Only the latest major version of the protocol (**v12** on mainnet and **v13 / Reliks-VM v1** for upcoming genesis) is actively maintained and receives security updates. Legacy versions (v1-v11) are considered deprecated and are maintained on-chain only as historical artifacts.

## 🐛 Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

If you discover a security flaw in the Silverscript contracts, the Reliks-VM interpreters, the transaction building logic, or the trustless verification tools, please report it immediately via:

1. **GitHub Private Vulnerability Reporting (Primary Channel)**: Submit a confidential advisory directly at [https://github.com/weirdtualguy/Reliks/security/advisories/new](https://github.com/weirdtualguy/Reliks/security/advisories/new) (under the repository's **Security -> Report a vulnerability** tab).
2. **Maintainer Contact**: If you cannot use GitHub Security Advisories, contact `@weirdtualguy` via GitHub or open a minimal issue requesting an encrypted contact key without disclosing vulnerability details.

We will acknowledge your report within 48 hours and work with you to understand and resolve the issue.

## 🔍 Scope

The following components are in scope for security reporting:
- Silverscript covenant logic (`sil/*.sil`, `v13/*.sil`).
- Reliks-VM specification and reference interpreters (`v13/RELIKS-VM-SPEC.md`, `v13/vm/rvm.js`, `v13/vm/rvm.py`, `v13/vm/rvm.c`, `web/rvm-asm.js`).
- Transaction building, signing, and fee discovery logic (`lib/reliks-lib.js`, `web/reliks-chain.js`, `sdk/*.js`, `cli/*.js`).
- Trustless verification, rendering, and lens tooling (`web/site-app.js`, `web/reliks-gallery-runtime.js`, `cli/reliks-lens.js`, `cli/reliks-lens-vm.js`, `cli/verify-render.js`, `tools/gen-provenance-bundle.js`).

**Out of Scope**:
- UI/UX bugs in third-party marketplaces or galleries.
- Phishing, social engineering, or attacks targeting individual user wallets.
- Issues related to the Kaspa network itself (report those to the Kaspa core team).
- Known accepted protocol properties documented in `docs/AUDIT-SUMMARY.md` and `PROTOCOL.md` (such as public listing sniping, royalty-free plain `transfer` / zero-price `sell`, and cost-bounded `sales` increments via self-sell).

## 🛡 Best Practices for Users & Developers

- **Protect Your Keys**: Never share your `PC_PRIV` (private key) or commit it to a public repository. Use environment variables outside the repository (`~/reliks-private/secrets.env`) or hardware/browser wallets.
- **Verify Before You Buy**: Always use the verification site (`docs/index.html`), a provenance bundle (`tools/gen-provenance-bundle.js`), or `sdk/claim.js` to verify that the `program_hash`, `render_hash`, covenant ID, and state commitment of an edition match the on-chain state before purchasing.
- **Audit Custom Engines**: If you are an artist baking a custom generative engine, always run it through `cli/reliks-lens.js` (for JS engines) or `cli/reliks-lens-vm.js` (for Reliks-VM bytecode programs) to verify determinism, baking-size ceilings (`25,641` bytes for PUSHDATA2), and worst-case fuel/element/SVG headroom.

## 🏆 Recognition

We believe in recognizing the efforts of security researchers. Valid, previously unreported vulnerabilities that significantly impact the security or consensus determinism of the Reliks protocol (including divergences between the specification and the reference interpreters) may be eligible for a bounty or public acknowledgment, at the discretion of the maintainers.
