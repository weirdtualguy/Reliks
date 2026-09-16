/**
 * reveal-tx-builder.ts
 *
 * Rewrite target for ~/pixel-cove/src/kaspa-sighash-v1.ts.
 * House rule respected: whole-file rewrite, no slice-patching.
 *
 * CORRECTED MODEL (per docs.kaspa.org/toccata/transaction-v1 and /agent-brief,
 * checked 2026-09-06 — supersedes the handoff doc's Failure Atlas #1/#2):
 *
 *   - v1 sighash does NOT cover compute_budget. Only tx::hash (the full,
 *     mined encoding) commits to it. Signing order is therefore:
 *       1. size compute_budget (best-effort estimate is fine)
 *       2. build+sign the transaction (signature doesn't depend on the
 *          exact budget value)
 *       3. a relayer/miner may retune compute_budget afterward without
 *          invalidating your signature or changing the txid
 *   - REST /transactions failing is a RESOURCE failure (budget silently
 *     dropped -> script exceeds the free 9,999 SU allowance), not a
 *     signature-invalidation issue. Submitting through kaspa-wasm's wRPC
 *     client (which round-trips v1 fields) avoids this class of bug.
 *
 * Pricing constants below are confirmed current as of the same check:
 *   1 compute_budget unit  = 10,000 script units (SU)
 *   free allowance / input = 9,999 SU
 *   1 signature check      = 100,000 SU
 *   1 stack byte pushed    = 1 SU
 *   allowed_SU(budget) = budget * 10,000 + 9,999
 */

// ---------------------------------------------------------------------------
// 1. Budget sizing — pure math, no SDK dependency, safe to trust as-is.
// ---------------------------------------------------------------------------

export interface ScriptUnitEstimate {
  signatureChecks?: number;   // each OpCheckSig / Schnorr verify attempt
  hashedBytes?: number;       // bytes run through OpBlake2b / OpBlake3 etc.
  hashOp?: "blake2b" | "blake3" | "sha256"; // affects per-byte cost
  newStackBytes?: number;     // bytes newly pushed onto the stack this run
  oversizeSpentSpkBytes?: number; // bytes of spent SPK beyond the 35-byte standard
}

const HASH_COST_PER_BYTE: Record<NonNullable<ScriptUnitEstimate["hashOp"]>, number> = {
  sha256: 1,
  blake3: 1,
  blake2b: 2,
};

export function estimateScriptUnits(e: ScriptUnitEstimate): number {
  const sigSU = (e.signatureChecks ?? 0) * 100_000;
  const hashSU = (e.hashedBytes ?? 0) * HASH_COST_PER_BYTE[e.hashOp ?? "blake2b"];
  const stackSU = e.newStackBytes ?? 0;
  const spkSU = (e.oversizeSpentSpkBytes ?? 0) * 100;
  return sigSU + hashSU + stackSU + spkSU;
}

/** Mirrors rusty-kaspa's ComputeBudget::checked_covering_script_units */
export function computeBudgetFor(requiredScriptUnits: number): number {
  const FREE_ALLOWANCE = 9_999;
  const UNIT = 10_000;
  if (requiredScriptUnits <= FREE_ALLOWANCE) return 0;
  const charged = requiredScriptUnits - FREE_ALLOWANCE;
  const budget = Math.ceil(charged / UNIT);
  if (budget > 0xffff) throw new Error("required script units exceed u16 compute_budget field");
  return budget;
}

// Your two entries, sized from what's actually in NftInstance.sil:

/** spend(sig s, int witness) — IDENTIFIER_PUBKEY path: one checkSig + small stack pushes */
export const spendBudget = computeBudgetFor(
  estimateScriptUnits({ signatureChecks: 1, newStackBytes: 96 /* sig(64) + pubkey(32) roughly */ })
);
// -> matches your doc's "computeBudget >= 10" for the sig-checking path.

/** reveal(byte[568] candidate, byte[32] collection_check, int token_check) — no sig, just equality checks */
export const revealBudget = computeBudgetFor(
  estimateScriptUnits({ newStackBytes: 568 + 32 + 8 /* candidate + collection_check + token_check pushes */ })
);
// -> comes out to budget = 0 or 1; no signature check means this is cheap.
// Still run these through kascov's /preflight before broadcast rather than
// trusting the estimate blind — preflight is your one endpoint that's
// already proven against the live TN10 node.

// ---------------------------------------------------------------------------
// 2. Transaction assembly — kaspa-wasm skeleton.
//
// IMPORTANT: I can't verify the exact current field names in your installed
// kaspa-wasm build from here (the Toccata-era bindings are a moving target —
// same caveat the official Agent Brief gives for Silverscript/Argent/vprogs).
// Before wiring this in:
//
//   npm i kaspa-wasm            # or `kaspa` if you need the wRPC/isomorphic-ws wrapper
//   node -e "console.log(require('kaspa-wasm').version())"
//   grep -n "computeBudget\|compute_budget" node_modules/kaspa-wasm/**/*.d.ts
//
// and confirm the TransactionInput shape took a computeBudget field (the
// Python SDK's 2.0.0 changelog shows the equivalent: "TransactionInput(...)
// gained a compute_budget parameter before utxo"). Adjust the field name
// below to match whatever the .d.ts says.
// ---------------------------------------------------------------------------

import {
  RpcClient,
  Resolver,
  PrivateKey,
  Transaction,
  TransactionInput,
  TransactionOutput,
  ScriptPublicKey,
  createTransactions, // NOTE: the high-level Generator API is built for
                       // ordinary P2PK transfers and likely won't build a
                       // custom P2SH-covenant signature script for you —
                       // expect to construct Transaction/TransactionInput
                       // manually for spend/reveal, as sketched below.
} from "kaspa-wasm";

interface BuildRevealTxArgs {
  covenantOutpoint: { transactionId: string; index: number };
  covenantValueSompi: bigint;         // 1_000_000_000n for the current UTXO
  redeemScriptHex: string;            // full 780-byte compiled program, from print-program.ts
  candidateArtPayloadHex: string;     // 568-byte real trait art, once ready
  collectionIdHex: string;            // 31044a8e...299a34c
  tokenId: number;                    // 1
  changeOutputSpk: string;            // where value returns to (likely same P2SH, re-committing state if this becomes a real transition)
  network: "testnet-10";
}

export async function buildAndPreflightRevealTx(args: BuildRevealTxArgs) {
  // 1) Assemble the signature script: redeem script + entry args + dispatch tag.
  //    This part is contract-ABI-specific and should come from your existing
  //    compiler-bridge.ts / cli-debugger output rather than being hand-built
  //    here — check whether cli-debugger has an --emit-witness or
  //    --entry reveal flag that produces the correctly-ordered pushdata and
  //    KCC-01 dispatch tag (blake3("reveal(byte[568],byte[32],int)")[0..4]
  //    per your notes). Don't hand-encode this blind; verify against the
  //    debugger's own output first.
  const signatureScriptHex = "TODO_FROM_compiler_bridge_or_cli_debugger";

  const budget = revealBudget; // or recompute per-payload once real art size is confirmed

  const input = new TransactionInput({
    previousOutpoint: args.covenantOutpoint,
    signatureScript: signatureScriptHex,
    sequence: 0n,
    // computeBudget: budget,   // <-- confirm exact field name against your installed .d.ts
  } as any);

  const output = new TransactionOutput({
    value: args.covenantValueSompi,
    scriptPublicKey: args.changeOutputSpk,
  } as any);

  const tx = new Transaction({
    version: 1,
    inputs: [input],
    outputs: [output],
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000", // native
    gas: 0n,
    payload: "",
  } as any);

  // 2) Preflight against kascov BEFORE you touch a signer or broadcaster —
  //    this is your one proven verdict endpoint (budgets, mass, fee).
  const preflightRes = await fetch(
    `https://kascov.io/data/${args.network}/preflight`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tx: tx.serializeToJSON?.() ?? tx }),
    }
  );
  const preflight = await preflightRes.json();
  console.log("preflight verdict:", preflight);
  if (!preflight?.ok) {
    throw new Error(`preflight rejected tx: ${JSON.stringify(preflight)}`);
  }

  // 3) Sign. For `reveal`, NftInstance.sil takes no sig() param at all —
  //    it only checks candidate/collection_check/token_check equality — so
  //    there may be nothing to Schnorr-sign for this entry specifically.
  //    For `spend` (IDENTIFIER_PUBKEY path) you do need this:
  //
  //    const key = new PrivateKey(PRIVATE_KEY_HEX);
  //    tx.sign([key]);   // confirm exact method name in your build's .d.ts
  //
  // 4) Submit via wRPC (NOT the generic REST endpoint that dropped your
  //    computeBudget before):
  const rpc = new RpcClient({
    resolver: new Resolver(),
    networkId: args.network,
  } as any);
  await rpc.connect();
  const submitResult = await rpc.submitTransaction({ transaction: tx } as any);
  await rpc.disconnect();

  return { tx, preflight, submitResult };
}
