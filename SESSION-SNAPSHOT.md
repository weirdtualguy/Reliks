# Pixel-Cove — Session State Snapshot (testnet-10)
Decentralized NFT marketplace: on-chain generative art (2048-byte HTML/JS programs) held in
SilverScript covenants; browser-native dApp (no wallet extension); all tooling pure-JS in Termux.

## Environment
- Termux phone. Project root ~/pixel-cove; http-server root = ~/pixel-cove, page at /web/index.html (:8080).
- Compiler: ~/opt/silverscript/target/release/silverc (SilverScript; refs: DECL/TUTORIAL/lib.rs docs).
- Node scripts use noble hashes/secp256k1 + ws; browser uses esm.sh (@noble/hashes, @noble/curves).

## Contracts (v3, audit-remediated) & dispatch tags
- Edition-v3.sil: state [ownerIdentifier,identifierType,price,artist,royalty_bips,program_hash,factory_covid,serial];
  entries: list 5703f99d, buy 9909be01, sell 616a2258, transfer 694374e4, spend bf4a1660 (dust escape hatch — KEEP).
- SeriesFactory-v3.sil: 2KB art IN state (on-chain-art promise — do NOT hash-only); mint (conditional artist
  payment, OpCov singleton checks, in-contract blake2b(art)); close 53422444 (terminal at cap).
- Audit decisions: ACCEPTED transfer/conditional-royalty/close/in-contract-hash;
  REJECTED spend-removal, UTXO value conservation, 2KB-state removal (rationale in HANDOFF.md).

## Codec facts (all proven on-chain)
- sighash v1: blake2b keyed 'TransactionSigningHash'; outputs-hash includes covenant flag+authInput+covId.
- Covenant id: blake2b keyed 'CovenantID' over authOutpoint‖le64(1)‖le32(1)‖le64(amount)‖le16(0)‖le64(spkLen)‖spkHash.
- State ints: 8-byte fixed LE pushes; p2sh = 'aa20'+blake2b(redeem)+'87'; scriptPublicKey prefix '0000'.
- Kaspa txid EXCLUDES signature scripts. v1 txs: sigOpCount=0 on ALL inputs.
- Kaspa bech32 (bech32-solved.js): polymod 40-bit (mask 0x07ffffffff, top=c>>35), gens
  [0x98f2bc8e61,0x79b76d99e2,0xf33e5fb3c4,0xae2eabe2a8,0x1e4f43e470], feed=(hrp&0x1f)++[0]++data5++[0;8],
  ^1, low 40 bits as 5 BE bytes → conv8to5 → 8 symbols; separator ':'.
- Network: public nodes do NOT chain mempool (orphans disallowed) → confirmation gate (pc_lastout,
  kascov live outpoint == expected). kascov = lineages/live spks (NO sigscripts); kaspad REST
  api-tn10 = full txs WITH sigscripts + address UTXOs; browser wRPC broadcast works (native Origin OK).
- Art extraction: regex /4d0008([0-9a-f]{4096})/i over raw kaspad tx JSON; verify blake2b==program_hash.
- Indexer lag 10–60 s normal; testnet blocks ~1 s.

## On-chain inventory (testnet-10)
- v3 factory 1d2a18a7344eec8d2a849c7518f5c0fc94e15e16dc474ae9ad383f718b06f519 (genesis 85d2af83…);
  counter=3 after browser mints (verify via probe-fac-state.js / kascov).
- cap-2 factory CLOSED: close tx faef97a7…, live_utxos 0 (proof of reclaim path).
- Editions: cd6a4eb5 (v3#0, transfer OUT/BACK 37a89dc9/4ca950b0), 32afb018+b4eaf203 (cap2),
  browser-born serial1 (mint 0fc4c90b, sold 6b517590), serial2 (mint 270e1267, list 47d23ac1,
  buy e78cf3a5 royalty→artist, transfer 35191d35).
- Keys (TESTNET ONLY — rotate for mainnet): Termux hot PRIV in drip.js (pub 33fe25d1…,
  addr kaspatest:qqelufw3…); browser session key in localStorage pc_priv (pub 420ba582…,
  addr kaspatest:qppqhfvz…).

## Files
Scripts: deploy-v3/mint-art-v3/mint-cap2/close-cap2/transfer-v3/marketplace-v3/register-v3/verify-v3/
drip/merge-overlay/probe-fac-state/gen-factory-args-*/solve-bech32-v3/bech32-solved/patch-*.js.
Ledgers: factory-ledger-v3.json, factory-ledger-cap2.json, editions-ledger.json, *-abi-v3.json, factory-args-v3.json.
Web: web/index.html (session wallet, chain-verified art, overlay pc_overlay/pc_fac/pc_lastout,
confirmation gate, mint/buy/list/sell/transfer buttons, export-overlay button).

## Pending (ordered)
1. Run patch-dapp-sleep.js + patch-dapp-export.js if not yet applied; export overlay → merge-overlay.js → verify-v3.js.
2. Append HANDOFF.md addendum (bech32 recipe, txid/sigOpCount/orphan rules, source division, proof txids) if not yet done.
3. Mainnet prep: externalize keys to env, self-funded genesis builder (kascov /deploy is testnet-only),
   VPS (recommended Hetzner CPX21/31: 3–4 vCPU, 8 GB, NVMe), then redeploy + re-point dApp constants.
4. Optional proofs: conditional-royalty 3-output buy (owner==artist) — PROVEN (0d4761ae).

## Working conventions
Verify-first: pin every codec against known-good vectors before use; probe schemas before guessing;
patchers use split/join on exact anchors; one command per line in Termux; expect indexer lag; 🐼.

## v4 AUDIT ERA — Gemini audit remediation (pinned 2026-09-17)
External audit (Gemini) of Edition-v3.sil + SeriesFactory-v3.sil. Verdict: v3 significantly improved;
three actionable findings, all remediated in SeriesFactory-v4.sil (Edition unchanged, stays v3):
- [HIGH] unsold-collection trap: close required counter>=cap → artist locked out of storage mass on a
  partially-sold series. FIX: gate removed; artist may close at any time (early close caps supply,
  harms no existing holder — editions already minted keep all rights).
- [MEDIUM] mint siphon: mint (untrusted caller) did not conserve factory UTXO value → an over-funded
  genesis deposit drainable by the first minter. FIX: require(tx.outputs[factoryOutIdx].value >=
  tx.inputs[this.activeInputIndex].value). Deploy/mint scripts preserve value exactly, so >= passes.
- [LOW] royalty_bips unbounded below. FIX: require(royalty_bips >= 0 && royalty_bips <= 10000).
- [INFO] mempool sniping on buy: ACCEPTED RISK (inherent to open single-UTXO listing covenants;
  seller always receives full listed price; commit-reveal / permissioned-taker deferred).
Audit PASSED table: transfer transition, conditional royalty (buy/sell), conditional mint payment,
spend dust recovery, 2KB on-chain art encoding.

Structural diff v3→v4 (factory-abi-v3.json vs -v4.json): dispatch tags identical; state span identical;
runtime state fields identical; template hash DIFFERS (logic change baked in); bytecode 6413→6419 bytes;
factory-args-v4.json embeds the unchanged Edition-v3 template hash. ⇒ dApp JS codec unaffected by v4;
only ABI/ledger file pointers would change.

On-chain proofs (testnet-10). The v4 instance is a PROOF ARTIFACT and is now CLOSED:
- factory covenant 7ede0e9d357915cacad9bfa1d300d5b51268da177ec99c5ed1cbc20c39e88100
- genesis/deploy e30468bb6f8e20bde9b7521770abd966f35a2b1e6742e653768cd8e76a513ffd
- mint #0 fe2e3f2718a95b0ea0c44c41924f3b166e3d5557b07d406275fe4658732c68ab
  (edition covenant c661b14cfd1065c7a495053398026331fa5b94475fe8d278ff8dfdcc5f553eae — still LIVE;
  its art remains resolvable after factory close because the lineage/genesis tx stays queryable)
- EARLY CLOSE at counter=1 with cap=64: 27504b7750c21ec8d8aaa4f192d9fa1cf5fb7c00f4706c443c58ee7b63f67807
- lineage: genesis e30468bb -> transition fe2e3f27 -> burn 27504b77 | live utxos 0
  = on-chain certificate the [HIGH] fix works (v3 would have locked the 5 KAS deposit forever).
Mint success simultaneously certifies the [MEDIUM] guard does not break the legitimate path.
Negative siphon test (underfund continuation → expect consensus script failure): DEFERRED/OPTIONAL.

Artifacts: ~/opt/silverscript/contracts/SeriesFactory-v4.sil; factory-abi-v4.json (bytecode 6419),
factory-args-v4.json, factory-ledger-v4.json, editions-ledger-v4.json;
scripts patch-factory-v4.js, gen-factory-args-v4.js, deploy-v4.js, mint-v4.js, close-early-v4.js.
Mainnet candidate = v4 artifacts. Live testnet dApp factory remains v3 (1d2a18a7…) until migrated.

Pending (supersedes earlier list):
1. Overlay merge (apply patch-dapp-sleep/export if unapplied →  export → merge-overlay.js → verify-v3.js).
2. dApp v4 support: point web/index.html at factory-abi-v4/ledger-v4 for NEW series (dual-factory
   gallery), or migrate wholesale after closing v3 — decide during mainnet prep.
3. Mainnet prep: secrets.env key rotation, self-funded genesis builder, VPS (Hetzner CPX31), deploy v4.
4. Optional proofs: negative siphon rejection; 3-output buy with owner==artist (royalty skip path).
