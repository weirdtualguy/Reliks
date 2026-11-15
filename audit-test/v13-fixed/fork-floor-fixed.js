// Fork lane floor negative test (2026-11-14). Testnet only. Runs as the ARTIST (key1).
//   1. Deploy a fresh series with a 2 KAS lane (mints 2, royalty 500).
//   2. ATTACK: fork into left 1.2 KAS + right 0.8 KAS (right lane under the
//      1 KAS floor). Must be REJECTED — the fork entry requires both lane
//      outputs >= 100,000,000.
//   3. CONTROL: fork the same lane 1 KAS + 1 KAS. Must SUCCEED.
// Ledger: audit-test/v13-fixed/ledger-fork-floor.json
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const F = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/factory.json', 'utf8')));
const args = JSON.parse(fs.readFileSync('audit-test/v13-fixed/factory-args.json', 'utf8'));
const covIdGenesis = V.covIdGenesis;
const hxb = (i) => B.from(args[i].value).toString('hex');
const series = { program_hash: hxb(0), artist: hxb(1), price: args[2].value, royalty_bips: args[3].value, mints_left: 2, engine_lang: args[6].value, render_hash: hxb(7), next_serial: 0 };
const TAG_F = (n) => B.from(F.c.entries[n].dispatch_tag, 'hex');
const laneRedeem = (st) => B.concat([F.prefix, V.encState(F, st), F.suffix]);
const laneSpk = (st) => V.p2sh(laneRedeem(st));
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
const LEDGER_PATH = 'audit-test/v13-fixed/ledger-fork-floor.json';
let LD = { C: null, genesisTxId: null, series, lanes: [], attackTxId: null, controlTxId: null };
if (fs.existsSync(LEDGER_PATH)) LD = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
const save = () => fs.writeFileSync(LEDGER_PATH, JSON.stringify(LD, null, 2));
const LANE = 200000000n;
async function forkTx(leftAmt, rightAmt) {
  const lane0 = LD.lanes[0];
  const leftState = { ...series, mints_left: 1, next_serial: 0 };
  const rightState = { ...series, mints_left: 1, next_serial: 1 };
  const wIn = await pickUtxo();
  const hsInputs = [
    { txId: lane0.txId, index: 0, sequence: 0, spk: laneSpk({ ...series, mints_left: 2, next_serial: 0 }), amount: LANE },
    { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }
  ];
  const inputs = [
    { previousOutpoint: { transactionId: lane0.txId, index: 0 }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ];
  function build(fee) {
    const outputs = [
      { amount: leftAmt, scriptPublicKey: laneSpk(leftState), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: rightAmt, scriptPublicKey: laneSpk(rightState), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: BigInt(wIn.amount) - fee, scriptPublicKey: wIn.spk }
    ];
    const artistSigRaw = secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV);
    inputs[0].signatureScript = hex(B.concat([pushMin(B.concat([artistSigRaw, B.from([0x01])])), pushMinInt(1), pushMinInt(1), pushMin(TAG_F('fork')), pushMin(laneRedeem({ ...series, mints_left: 2, next_serial: 0 }))]));
    inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  return feeLoop(build);
}
(async () => {
  if (!LD.genesisTxId) {
    const GV = require('../../tools/verify-contract.js');
    const gvErrs = GV.validateFactoryArgs(args);
    if (gvErrs.length) { console.error('GENESIS VALIDATION FAILED:'); gvErrs.forEach(e => console.error('  - ' + e)); process.exit(1); }
    const wIn = await pickUtxo();
    const redeem = laneRedeem(series);
    const C = covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: Number(LANE), script: V.p2sh(redeem) }]);
    const hsInputs = [{ txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
    const inputs = [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }];
    function build(fee) {
      const outputs = [
        { amount: LANE, scriptPublicKey: V.p2sh(redeem), covenant: { authorizingInput: 0, covenantId: C } },
        { amount: BigInt(wIn.amount) - LANE - fee, scriptPublicKey: wIn.spk }
      ];
      inputs[0].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV)) + '01';
      return rpc(inputs, outputs);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    LD.C = C; LD.genesisTxId = txId;
    LD.lanes = [{ txId, index: 0, mints_left: 2, next_serial: 0, amount: Number(LANE) }];
    save();
    console.log('FORK-FLOOR GENESIS:', txId, '| C =', C.slice(0, 16), '| 2 KAS lane');
  }
  // ---- ATTACK: right lane 0.8 KAS (under the 1 KAS floor) ----
  if (!LD.attackTxId) {
    try {
      const { txId } = await forkTx(120000000n, 80000000n);
      console.log('!!! UNDER-FLOOR FORK SUCCEEDED (tx ' + txId + ') — THE LANE FLOOR DOES NOT HOLD !!!');
      LD.attackTxId = txId; save();
      process.exit(1);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/failed to verify the signature script/i.test(m)) {
        console.log('FORK LANE FLOOR HOLDS: node rejected the 1.2 + 0.8 KAS fork (script verification failed).');
        LD.attackTxId = 'rejected:' + (m.match(/Rejected transaction ([0-9a-f]{64})/) || [])[1];
        save();
      } else { console.log('FORK ATTACK FAILED FOR ANOTHER REASON (test script bug?): ' + m.slice(0, 300)); process.exit(1); }
    }
  }
  // ---- CONTROL: even 1 + 1 KAS fork ----
  if (!LD.controlTxId) {
    const { txId } = await forkTx(100000000n, 100000000n);
    await waitForConfirmation(txId);
    LD.controlTxId = txId;
    LD.lanes = [
      { txId, index: 0, mints_left: 1, next_serial: 0, amount: 100000000 },
      { txId, index: 1, mints_left: 1, next_serial: 1, amount: 100000000 }
    ];
    save();
    console.log('FORK-FLOOR CONTROL OK:', txId, '| 1 + 1 KAS fork succeeded');
  }
  console.log('FORK-FLOOR DONE');
})().catch(e => { console.error(e); process.exit(1); });
