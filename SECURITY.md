# Security Policy

## Supported versions
| Version | Status |
| --- | --- |
| v11 (audit2 freeze) | Supported |
| v10 and earlier | Deprecated (testnet monuments only) |

## Security model layers
1. Consensus-enforced invariants (Silverscript require):
   - buyerScheme == IDENTIFIER_PUBKEY (no bricked identifier types)
   - royalty_bips >= 1 (Kaspa rejects 0-value dust; 0 would brick buy())
   - program_hash == blake2b(engine_code) (engine containment on-chain)
   - OfferEscrow MAX_PRICE (i64 overflow guard on askPrice * bips)
   - pairwise-distinct payment/royalty/mkt/edition output indices
   - close() requires OpAuthOutputCount == 0 (true burn, no state carry)
2. Client-side transport gates:
   - feeLoop: covenantSpend defaults true; wRPC-only; hard-throws on
     non-fee wRPC failure; REST reachable only via explicit opt-out
     (no shipped caller opts out)
   - network.js: PC_NET=mainnet without PC_MAINNET_WRPC => process.exit(1)
   - bake pipeline: inline assertion that compiled bytecode embeds the
     exact ENGINE_SRC bytes before any deploy
3. Deterministic verification:
   - verify-render-v10.js: 14 gates (genesis spk, program_hash, render
     conformance, per-edition lane-consumption / serial recompute /
     covenant_id / edition spk / continuation spk, F1 redeem containment)
   - hard-stop provenance guard: RELIKS_ENGINE hash != ledger
     program_hash => exit(1) before any rendering
4. Economics:
   - checkPayments: exact royalty to artist, >= price-royalty to owner,
     platform 0 on secondary (Model B); escrow exact royalty + mktFee,
     >= owner net; zero surplus to burn or steal
<!-- EOF-SEC-1 -->

## Reporting vulnerabilities
- Do NOT open public issues. Contact the maintainer via the repo profile,
  or request PGP for encrypted reports.
- Include: description, reproduction steps, impact class (theft / brick /
  royalty bypass / lineage break), suggested fix if any.
- Allow a 30-day coordinated disclosure window.
- Expect acknowledgment within 48h; credit on disclosure unless anonymous.

## Audit history
- Audit 1: protocol review; findings E-1, F-M1, F-M2, ESC-INFO closed in
  tooling guards.
- Audit 2: contract-level patches (the six invariants above), proven on
  testnet Series E/F; REST compute_budget limitation discovered and pinned.
- Audit 3: transport + provenance fixes (strict wRPC, edition spk assert
  wired into the check() tally); verified 14/14 on Series F.
- Continuous: reliks-audit-loop.js / reliks-audit-core.js adversarial
  review via local bridge; logs in docs/audit-log/ (gitignored).
- On-chain rehearsal: testnet-10 Series B-G including the ~25.6 KB TITAN
  at the PUSHDATA2 boundary; fee/mass law verified at every stop.

## Known limitations
- Engine ceiling ~25.6 KB (PUSHDATA2; engine carried twice in mint redeem).
- REST cannot carry compute_budget: wRPC mandatory for covenant spends.
- royalty_bips must be >= 1 (dust rule); OTC-only series unsupported.
- Gallery/Studio are convenience UIs; verification is reproducible from
  verify-render-v10.js plus public chain data alone.

## Responsible use
Keys never leave offline storage; test on testnet first; verify every
transaction before signing. Covenant-aware wallets (e.g. Kaspire) display
all outputs for review - read them before approving.
<!-- EOF-SEC-2 -->

## Mass model (four dimensions, testnet-10 measured)
1. Fee mass (mempool): normalized transient mass = 2*tx_bytes at 100 sompi/unit.
2. Compute allowance: compute_budget*10000+9999 script units per v1 input.
3. Consensus mass: storage+compute <= MAX_TRANSACTION_MASS.
4. Storage mass: per-UTXO storage pricing; testnet-10 per-tx cap 500000.
The escrow accept (edition+escrow+funding inputs; owner/artist/mkt/continuation/
change outputs) is the heaviest route: 524202 storage mass post-audit4, over the
500000 cap. Mitigations in order: owner absorbs change output; escrow derives
royalty/artist from prevEd (field removal); 2-input accept redesign.
MAINNET TODO: query mainnet max transaction mass param and re-validate the
accept route against it before genesis; testnet-10 cap is not evidence.

## Escrow accept: 2-input design with offer-side fee buffer
Storage-mass cap (500000 on testnet-10) forbids the 3-input accept (519992).
The 2-input accept cannot deduct the miner fee from owner/royalty/market
outputs (edition checkPayments floors/equalities). Therefore the OFFER locks
askPrice + mktFee + FEE_BUFFER (5M sompi); accept spends edition+escrow only,
pays owner exactly askPrice - roy, and the buffer becomes the miner fee.
Orphaned pre-buffer escrow bab83ad2... remains refundable via expire after
expireAge; it is deliberately left unspent on testnet.
