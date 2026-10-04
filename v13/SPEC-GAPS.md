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
15c. git log -S"ENGINE_LANG = 1" on gen-factory-args.js and v13/gen-factory-args-v13.js finds nothing: no commit ever set it to 1 there, so mainnet's 1 came from outside those files (unknown). v13/gen-vm-factory-args.js now defaults to 2 (ENGINE_LANG env overrides). No series has used engine_lang 2 on any chain yet; the factory contract copies the value without checking it.
18. VM spec sec 5 says wear (sales) is not grindable. sellPolicy lets the owner sell to any key at any price >= 1 KAS, so sales can be raised by a self-sell at the cost of royalty + fee (fee only if the owner is the artist); the sales-3 step on marks3 edition 0 was a 1 KAS self-sell (STATE.md). Reword the VM spec: wear is rate-limited by cost, not ungrindable. PROTOCOL.md sec 4 states it.
19. Edition source header still says DRAFT / "Not verified with silverc"; SeriesFactory-v13-draft.sil likewise. Both recompile to the deployed bytecode (tools/verify-contract.js). Fix comments and names later, once no tool references the paths.
20. Factory requires 1 <= royalty_bips <= 2000: a series deployed outside that can never mint, and deploy tooling does not warn. planMint now flags it.
21. UNREVIEWED: the rest of the engineBaked() statement; how the edition output's covenant id is checked at mint; internals of validateOutputStateWithTemplate / validateOutputState.
19. Edition source header still says DRAFT / "Not verified with silverc"; SeriesFactory-v13-draft.sil likewise. Both recompile to the deployed bytecode (tools/verify-contract.js). Fix comments and names later, once no tool references the paths.
20. Factory requires 1 <= royalty_bips <= 2000: a series deployed outside that can never mint, and deploy tooling does not warn. planMint now flags it.
21. UNREVIEWED: the rest of the engineBaked() statement; how the edition output's covenant id is checked at mint; internals of validateOutputStateWithTemplate / validateOutputState.
21a. engineBaked(): require(blake2b(engine_code + lane input txid) != 32 zero bytes). Always true; appears to exist only to keep the engine bytes in the compiled script (compiler folds pure expressions, see HANDOFF-LOCAL.md line 389). Inferred. Readers must find the program in the lane script and hash it. Still unreviewed from item 21: edition covenant-id check at mint; validateOutputStateWithTemplate / validateOutputState internals.
22. Escrow has no cancel route: the offerer's funds are locked until expireAge (accept and expire are the only exits).
23. An offer binds the edition's current owner, price and listing; any change strands it until expiry. Accepting needs a public listing at askPrice, so a third party can buy first.
24. The fee buffer in the escrow comments is not enforced on chain; expire() refunds the full input value, so its fee must come from another input (inferred).
25. Escrow accept raises sales like a sale and the offerer can be any key: same purchasable-sales property as item 18. Collection-wide offers (reliks-2-design.md) are not implemented.
26. kascov decodes one state field for spent edition outputs and labels it program_hash; for testnet VM edition 1 its value equals neither the decoded ownerIdentifier nor the decoded program_hash, and holders is empty. Do not use kascov state_fields; decode revealed_hex with the codec.
27. Chain history of testnet VM edition 1 (3 spent outputs decoded from revealed scripts + the ledger's live state): serial and program_hash constant and equal to the series; all 3 transitions kept the owner, advanced lineage by the rule, sales +1, price 0 -> 0, i.e. self-sells. Confirms sec 2/3/4 on chain history and gap 18 in practice; an owner can precompute the lineage chain for any number of self-sells.
28. The current state of a live edition cannot be read from kascov: the live output shows only its script hash (no revealed script) and holders is empty. A UI needs a published state, or must replay the last spend (feasibility pending: REST returns no record for covenant-era txs; node getBlock probe pending).
28a. Probe 2026-10-03 (getBlock with transactions on both public testnet nodes): ok for a fresh block and one 24.4 h old; "cannot find header" for one 65.3 h old, so retention ends between them. The marks3 ed0 transition tx was not in its accepting block (inferred: merge set). Signature-script contents were not reached. Replay of the last spend is not a general method; PROTOCOL.md sec 10 states the reading model. resolveEdition(covenantId) is dropped; replaced by a claim format plus verifyClaim.
29. Counterfeit editions (inferred from the source, not tested on chain): the edition contract has no mint-origin check, so anyone may create an output with the edition script and any state (including a real lane as factory_covid). verifyClaim reports provenance 'unchecked'. Provenance needs the lane's mint events to list the edition covenant; probe pending.
30. Claim format v1 specified (PROTOCOL.md sec 11, sdk/claim.js): replaces resolveEdition. current = committed state of a live output on a fresh index; stale_state is final and not freshness-gated.
29a. Provenance check implemented (sdk/claim.js checkProvenance): the lane lists the covenant in a mint event whose tx is the covenant's genesis tx, and the genesis state follows from the lane input of the mint. Reached listed_and_derived for all 4 testnet editions. Still not excluded: a counterfeit placed in the same mint transaction (depends on the mint's covenant-id rule, UNREVIEWED). Needs an index exposing with_covenants, spent_txid and genesis_txid.
31. Applied 2026-10-03 to v13/RELIKS-VM-SPEC.md and rvm.js: items 1 (status line), 2 (105 vs 103 noted; the 2 extra checks are not itemized), 3 (clean port recorded), 4 (stop-opacity rule), 6 (rvm.js comment), 18 (wear wording). Still open: 5 (RND/RNDR fault order unverified), 7 (SVG size boundary vectors), 12 (third implementation).
32. Gap 5 closed 2026-10-03: RND/RNDR fault order (operands popped, then E_RNG, then range check) is stated in the VM spec sec 7 and pinned by two new vectors; both interpreters agree (107 pass). Still open for the VM freeze: item 7 (SVG size boundary vectors) and item 12 (third implementation).
33. Gap 7 closed 2026-10-03: 4 SVG size boundary vectors (exactly 1,048,576 bytes passes; one byte over only via </svg> faults; fault during execution beats the final size check; emission over the running total faults before a later fault). Both interpreters agree (111 pass). The emission-versus-final check order is now stated in the VM spec sec 7. Still open for the VM freeze: item 12 (third implementation).
34. Third VM implementation (C, v13/vm/rvm.c) written 2026-10-03 from the spec text; 104/104 program cases of vectors.json agree with the Python and JS interpreters. Not strictly independent (its author had read parts of rvm.js). Choices made without a vector to check them: a path must start with M and M is only allowed first; an empty PEND is E_PATH; check order in GOPEN is range, path, depth; GRADSTOP checks gradient state before ranges; drawing and style ops are allowed while a path is open. Differential fuzzing across all three implementations is next.
35. Fuzz 2026-10-03 (1500 random programs, JS/Python/C): JS and Python agreed on every program; the only divergence was the C (12 programs): GOPEN with a path open and an out-of-range operand. The references check the open path BEFORE the operand range (E_PATH), the spec lists E_PATH and E_GROUP for GOPEN but not the order against E_RANGE. C fixed to match. Only 15 of 1500 programs rendered an SVG (most faulted early), so the generator is being retuned and the other order questions are being probed (path start rules, empty PEND, drawing/style ops with a path open, first gradient id, GRADSTOP check order).
36. Differential fuzz and probes 2026-10-03: JS and Python agreed on every fuzz program and on all 25 probes. The C implementation differed only on GOPEN check order (fixed, pinned) and on GCLOSE with a path open (fixed, pinned; E_PATH). The 24 other rules the spec left open were already what the references do and are now pinned by 25 rule_* vectors and stated in VM spec sec 4 (vectors 111 -> 136; C 104 -> 129 program cases). Open: the order of the two GCLOSE errors when both apply, and GRADSTOP past 8 stops versus an out-of-range offset (probes printed, not yet pinned).
