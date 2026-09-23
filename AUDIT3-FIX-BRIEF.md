# AUDIT3 FIX PACKAGE (response to audit2-delta review)

Scope: only files changed since the reviewed delta (tree at e694f21).
Exact changes: audit3-fixes.diff (git diff e694f21..HEAD for the four files).
Evidence: audit3-verify-f.log (Series F ledger, 14/14 checks incl. new SPK asserts).

## Finding 1 - feeLoop treated REST as a valid fallback for covenant spends
FIXED in offer-lib.js. feeLoop(buildFn, initialFee, opts) now takes
opts.covenantSpend (default TRUE). Covenant path: wRPC only; on wRPC failure
it parses fee-discovery regexes and retries, doubles on fee-ish messages,
and HARD-THROWS 'covenant spend requires wRPC; wRPC failed: ...' on any
other rejection. broadcastREST is unreachable unless a caller explicitly
passes covenantSpend:false. All Reliks builders (deploy/mint/secondary/
offer/accept/expire) call feeLoop with defaults, i.e. covenantSpend=true,
so no covenant transaction can be attempted over REST by any shipped flow.
The REST branch remains only for hypothetical non-covenant transfers
(none exist in the codebase); delete it if you prefer zero dead surface.

## Finding 2 - network.js warned instead of enforcing
FIXED in network.js. PC_NET=mainnet with empty PC_MAINNET_WRPC now
process.exit(1) at profile load ('FATAL: PC_NET=mainnet requires
PC_MAINNET_WRPC for covenant spends.'). Combined with Finding 1, a mainnet
session without wRPC cannot even initialize, and with wRPC present no
covenant spend ever touches REST.

## Finding 3 - computed edSpk unused in verify-render per-edition loop
FIXED in verify-render-v10.js. Each edition now asserts
edSpk === spkHex(mintTx.outputs[1]) with PASS/FAIL output and ok=false on
mismatch ('PASS [#i] edition spk == mintTx.outputs[1].scriptPubKey').
Covenant-id equality alone no longer stands as the output check; the full
state-encoded scriptPubKey is compared. Check count 12 -> 14 on Series F.

## Unchanged since your review
sil/* (your five requires, verbatim), provenance hard-stop, data artifacts,
gallery, engines. No on-chain activity since Series F.
