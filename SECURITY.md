# Security Policy

Reliks handles real value on the Kaspa mainnet. Security is our highest priority. This document outlines the security policy and procedures for the Reliks protocol.

## 🛡 Supported Versions

Only the latest major version of the protocol (currently **v12**) is actively maintained and receives security updates. Legacy versions (v1-v11) are considered deprecated and are maintained on-chain only as historical artifacts.

## 🐛 Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

If you discover a security flaw in the Silverscript contracts, the transaction building logic, or the trustless verification tools, please report it immediately via:

1. **GitHub Private Vulnerability Reporting**: Use the "Security" tab in this repository to submit a private report.
2. **Direct Contact**: If you prefer, you can reach out to the maintainers directly via secure channels (e.g., Keybase or encrypted email, details available upon request).

We will acknowledge your report within 48 hours and work with you to understand and resolve the issue.

## 🔍 Scope

The following components are in scope for security reporting:
- Silverscript covenant logic (`sil/*.sil`).
- Transaction building, signing, and fee discovery logic (`reliks-lib.js`, `deploy-v12.js`, `mint-v12.js`, etc.).
- Trustless verification and rendering logic (`reliks-lens.js`, `verify-render.js`, `web/reliks-gallery-runtime.js`).

**Out of Scope**:
- UI/UX bugs in third-party marketplaces or galleries.
- Phishing, social engineering, or attacks targeting individual user wallets.
- Issues related to the Kaspa network itself (report those to the Kaspa core team).

## 🛡 Best Practices for Users & Developers

- **Protect Your Keys**: Never share your `PC_PRIV` (private key) or commit it to a public repository. Use environment variables or secure secret managers.
- **Verify Before You Buy**: Always use the `reliks-gallery-runtime.js` to verify that the `program_hash` and `render_hash` of an edition match the on-chain state before purchasing.
- **Audit Custom Engines**: If you are an artist baking a custom generative engine, always run it through `reliks-lens.js` to ensure it contains no banned constructs (e.g., `Math.random`, `fetch`, `Date`) and is fully deterministic.

## 🏆 Recognition

We believe in recognizing the efforts of security researchers. Valid, previously unreported vulnerabilities that significantly impact the security of the Reliks protocol may be eligible for a bounty or public acknowledgment, at the discretion of the maintainers.
