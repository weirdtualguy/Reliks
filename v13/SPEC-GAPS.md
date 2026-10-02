# SPEC GAPS (2026-10-02)
Compared RELIKS-VM-SPEC.md rev 2 to rvm.js/rvm.py: limits, opcodes, header/decode, fuel/halt, emit order, size check, E_RNG, stop-opacity. Per-op semantics rest on the 105 vectors (pass).

## VM spec text fixes
1. Status line says no contract uses the VM; testnet series A and B do.
2. Sec 10 sums to 103 (5+98); vectors.json runs 105. Fix breakdown.
3. Sec 0 / 11.2 faithful-vs-clean is closed: series A is clean, B is marks3 (does not use PAT). Record it.
4. State: stop-opacity emitted only when stop opacity != 100, same text format as opacity (both interpreters).
5. State RND/RNDR fault order: operands popped (E_UNDERFLOW), then E_RNG. Order vs hi<lo E_RANGE: UNVERIFIED.
6. rvm.js header comment claims a blake2b.js dependency it does not have.
7. Add size vectors: exactly MAX_SVG passes, MAX_SVG+1 E_SIZE, and the 6-byte </svg> window followed by a different fault.

## Protocol docs vs code
8. No normative spec of the deployed protocol. Serial, lineage and state layout sit only in reliks-v13-spec.md (pseudocode, "not compiled").
9. reliks-2-design.md uses names the code does not (Collection/Relik/owner_kind vs SeriesFactory/ReliksEdition/ownerIdentifier). It also proposes new features (covenant owners, splits, mint modes), which conflicts with the freeze. Mark it non-normative.
10. Transfer: reliks-2-design.md says transfer copies lineage; AI-CONTEXT and INFRA-HANDOFF say the code advances lineage on transfer. UNVERIFIED which is right; check v13 spec sec 3 and the .sil.
11. Serial width: VM spec says 63-bit, AI-CONTEXT says int64 mask. UNVERIFIED; check code.

## Open
12. Third implementation (Rust, from the spec alone).
