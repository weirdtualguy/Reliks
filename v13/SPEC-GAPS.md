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

## Resolved (2026-10-03)
10. Deployed code advances lineage on transfer (apply-transfer-lineage.js; AI-CONTEXT, INFRA-HANDOFF). reliks-v13-spec.md sec 3 and reliks-2-design.md are stale. On-chain script not independently confirmed (kascov stale).
11. Serial is a 63-bit integer (INFRA-HANDOFF, web/reliks-chain.js comment). AI-CONTEXT said "int64"; fixed.
14. Domain tags: code uses ReliksLineageV2 / ReliksGenesisV2 everywhere; reliks-v13-spec.md says V13. Spec stale.

## Found 2026-10-03 (mainnet v12 read-only check)
15. engine_lang collision: the mainnet v12 series has engine_lang 1 and a JS engine (3,888 B, starts "\nfun", not RVM magic 52564d01); the testnet VM series also use engine_lang 1. One value, two meanings. No VM series exists on mainnet yet, so the VM can take engine_lang 2 before any mainnet genesis (impossible after). The SDK must dispatch on engine_lang AND the program magic.
16. Mainnet engine size: this ledger's engine is 3,888 B; VM spec sec 0 says the mainnet DAG-City engine is 5,323 B. Unreconciled (two mainnet engines, or source vs template).
17. network.js has no default mainnet wRPC (deliberate, audit finding): every integrator supplies PC_MAINNET_WRPC; REST and kascov work without it. Document in the protocol spec.

## Decision 2026-10-03 (owner)
15a. New Reliks-VM series use engine_lang 2. Existing testnet VM series keep 1. Readers dispatch on the program bytes first (sdk/read.js engineKind: RVM magic -> vm, accepts lang 1 or 2; "function" text -> js, accepts lang 0 or 1; else unknown, never rendered). The contract copies engine_lang through every transition without checking it, so the value is opaque on chain.
15b. Unexplained: root gen-factory-args.js and v13/gen-factory-args-v13.js both set ENGINE_LANG = 0 ("integer-only SVG") but the mainnet lane decodes as engine_lang 1 (HANDOFF-LOCAL2). Do not document an engine_lang enum until the history is checked (git log -S).
