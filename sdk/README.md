# Reliks SDK

Programmatic Node helpers for reading, verifying, planning, signing, and submitting Reliks transactions.

## Modules
- `read.js`: `verifyEdition` (program hash + render through `vm/rvm.js`), `verifyAnchor` (serial 1, zero lineage, sales 0), `verifyEditionScript` (offline script rebuild), `verifyEditionOnChain` (freshness-gated kascov check).
- `claim.js`: Portable edition state claim verification (`verifyClaim`) and `ReliksOwnerChallengeV1` Schnorr ownership challenge signing/verification (`signOwnershipChallenge`, `verifyOwnershipProof`).
- `lane.js`: `resolveLaneKascov` resolves a single-lane series' live `SeriesFactory` state from a kascov record and verifies it against the live script.
- `escrow.js`: Encodes the 161-byte `OfferEscrow` state, rebuilds the escrow P2SH script from `contracts/escrow.json`, and verifies script commitments.
- `plan.js`, `sign.js`, `submit.js`, `mint-flow.js`: Transaction planning, BIP-340 Schnorr signing, and wRPC broadcast helpers.
