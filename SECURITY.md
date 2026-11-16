# Security Policy

Reliks handles real value on the Kaspa mainnet. Security is our highest priority.

## Supported Scope

The canonical Reliks protocol (`contracts/` and `vm/`) is actively maintained:
- Silverscript covenant logic (`contracts/SeriesFactory.sil`, `contracts/ReliksEdition.sil`, `contracts/OfferEscrow.sil`, and `TEMPLATE-HASHES.json`).
- Reliks-VM specification and reference interpreters (`vm/RELIKS-VM-SPEC.md`, `vm/rvm.js`, `vm/rvm.py`, `vm/rvm.c`, `web/rvm-asm.js`).
- Transaction building, signing, and fee discovery logic (`lib/reliks-lib.js`, `web/reliks-chain.js`, `sdk/*.js`, `cli/*.js`).
- Trustless verification, rendering, and lens tooling (`web/site-app.js`, `cli/reliks-lens.js`, `tools/gen-provenance-bundle.js`).

## Reporting a Vulnerability

**Do not open public GitHub issues for security vulnerabilities.**

Please report vulnerabilities via:
1. **GitHub Private Vulnerability Reporting**: [https://github.com/weirdtualguy/Reliks/security/advisories/new](https://github.com/weirdtualguy/Reliks/security/advisories/new)
2. **Maintainer Contact**: Contact `@weirdtualguy` via GitHub.

We will acknowledge your report within 48 hours.
