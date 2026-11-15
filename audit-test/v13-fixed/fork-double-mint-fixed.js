// Fork + double-mint negative test (H1 across lanes, 2026-11-14). Testnet only.
// Runs as the ARTIST (key1). Steps:
//   1. Deploy a fresh series with a 3 KAS lane (fork needs >= 2x 1 KAS lanes).
//   2. Fork the lane into left (2 mints, next_serial 0) + right (2 mints, next_serial 2).
//   3. ATTACK: mint from BOTH lanes in one tx, sharing ONE artist payment
//      output. Must be REJECTED (right lane requires artistOutIdx ==
//      editionOutIdx + 1 = 5, the shared output is at 2).
//   4. CONTROL: honest mint from the right lane (serial 2). Must SUCCEED —
//      proves the fork produced usable lanes and the counter serial works.
// Ledger: audit-test/v13-fixed/ledger-fork.json
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const F = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/factory.json', 'utf8')));
const Ed = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/edition.json', 'utf8')));
const args = JSON.parse(fs.readFileSync('audit-test/v13-fixed/factory-args.json', 'utf8'));
const covIdGenesis = V.covIdGenesis;
const hxb = (i) => B.from(args[i].value).toString('hex');
const series = { program_hash: hxb(0), artist: hxb(1), price: args[2].value, royalty_bips: args[3].value, mints_left: args[4].value, engine_lang: args[6].value, render_hash: hxb(7), next_serial: args[11].value };
const TAG_F = (n) => B.from(F.c.entries[n].dispatch_tag, 'hex');
const TAG_E = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const laneRedeem = (st) => B.concat([F.prefix, V.encState(F, st), F.suffix]);
const laneSpk = (st) => V.p2sh(laneRedeem(st));
const lineageOf = (serial) => B.from(V.blake2b(B.concat([B.from('ReliksGenesisV2', 'utf8'), B.from(LD.C, 'hex'), (() => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(serial)); return b; })()]), { dkLen: 32 })).toString('hex');
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
const LEDGER_PATH = 'audit-test/v13-fixed/ledger-fork.json';
let LD = { C: null, genesisTxId: null, series, lanes: [], editions: [] };
if (fs.existsSync(LEDGER_PATH)) LD = JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
const save = () => fs.writeFileSync(LEDGER_PATH, JSON.stringify(LD, null, 2));
const CARRIER = 100000000n;
const PRICE = BigInt(series.price);
(async () => {
  // ---- 1. deploy (3 KAS lane) ----
  if (!LD.genesisTxId) {
    const GV = require('../../tools/verify-contract.js');
    const gvErrs = GV.validateFactoryArgs(args);
    if (gvErrs.length) { console.error('GENESIS VALIDATION FAILED:'); gvErrs.forEach(e => console.error('  - ' + e)); process.exit(1); }
    const wIn = await pickUtxo();
    const redeem = laneRedeem(series);
    const C = covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: 300000000, script: V.p2sh(redeem) }]);
    const hsInputs = [{ txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
    const inputs = [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }];
    function build(fee) {
      const outputs = [
        { amount: 300000000n, scriptPublicKey: V.p2sh(redeem), covenant: { authorizingInput: 0, covenantId: C } },
        { amount: BigInt(wIn.amount) - 300000000n - fee, scriptPublicKey: wIn.spk }
      ];
      inputs[0].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV)) + '01';
      return rpc(inputs, outputs);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    LD.C = C; LD.genesisTxId = txId;
    LD.lanes = [{ txId, index: 0, mints_left: 4, next_serial: 0, amount: 300000000 }];
    save();
    console.log('FORK-TEST GENESIS:', txId, '| C =', C.slice(0, 16));
  }
  const lane0 = LD.lanes[0];
  // ---- 2. fork into left (2 mints, serial 0) + right (2 mints, serial 2) ----
  if (LD.lanes.length === 1) {
    const leftState = { ...series, mints_left: 2, next_serial: 0 };
    const rightState = { ...series, mints_left: 2, next_serial: 2 };
    const laneAmt = BigInt(lane0.amount);
    const wIn = await pickUtxo();
    const hsInputs = [
      { txId: lane0.txId, index: 0, sequence: 0, spk: laneSpk({ ...series, mints_left: 4, next_serial: 0 }), amount: laneAmt },
      { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }
    ];
    const inputs = [
      { previousOutpoint: { transactionId: lane0.txId, index: 0 }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ];
    function build(fee) {
      const outputs = [
        { amount: laneAmt / 2n, scriptPublicKey: laneSpk(leftState), covenant: { authorizingInput: 0, covenantId: LD.C } },
        { amount: laneAmt / 2n, scriptPublicKey: laneSpk(rightState), covenant: { authorizingInput: 0, covenantId: LD.C } },
        { amount: BigInt(wIn.amount) - fee, scriptPublicKey: wIn.spk }
      ];
      const artistSigRaw = secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV);
      inputs[0].signatureScript = hex(B.concat([pushMin(B.concat([artistSigRaw, B.from([0x01])])), pushMinInt(2), pushMinInt(2), pushMin(TAG_F('fork')), pushMin(laneRedeem({ ...series, mints_left: 4, next_serial: 0 }))]));
      inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
      return rpc(inputs, outputs);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    LD.lanes = [
      { txId, index: 0, mints_left: 2, next_serial: 0, amount: Number(laneAmt / 2n) },
      { txId, index: 1, mints_left: 2, next_serial: 2, amount: Number(laneAmt / 2n) }
    ];
    save();
    console.log('FORK-TEST FORK:', txId, '| left (2 mints, serial 0) + right (2 mints, serial 2)');
  }
  const [left, right] = LD.lanes;
  const leftState = { ...series, mints_left: left.mints_left, next_serial: left.next_serial };
  const rightState = { ...series, mints_left: right.mints_left, next_serial: right.next_serial };
  const edStateFor = (serial) => ({ ownerIdentifier: V.USER, identifierType: 0, price: 0, artist: series.artist, royalty_bips: series.royalty_bips, program_hash: series.program_hash, factory_covid: LD.C, serial, lineage: lineageOf(serial), sales: 0 });
  // ---- 3. ATTACK: double-mint sharing one artist output ----
  if (!LD.attackTxId) {
    const wIn = await pickUtxo();
    const edA = edStateFor(left.next_serial);
    const edB = edStateFor(right.next_serial);
    const edRedeemA = B.concat([Ed.prefix, V.encState(Ed, edA), Ed.suffix]);
    const edRedeemB = B.concat([Ed.prefix, V.encState(Ed, edB), Ed.suffix]);
    const covA = covIdGenesis(wIn.txId, wIn.index, [{ idx: 1, value: Number(CARRIER), script: V.p2sh(edRedeemA) }]);
    const covB = covIdGenesis(wIn.txId, wIn.index, [{ idx: 4, value: Number(CARRIER), script: V.p2sh(edRedeemB) }]);
    const hsInputs = [
      { txId: left.txId, index: left.index, sequence: 0, spk: laneSpk(leftState), amount: BigInt(left.amount) },
      { txId: right.txId, index: right.index, sequence: 0, spk: laneSpk(rightState), amount: BigInt(right.amount) },
      { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }
    ];
    const inputs = [
      { previousOutpoint: { transactionId: left.txId, index: left.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
      { previousOutpoint: { transactionId: right.txId, index: right.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ];
    function build(fee) {
      const outputs = [
        { amount: BigInt(left.amount), scriptPublicKey: laneSpk({ ...leftState, mints_left: left.mints_left - 1, next_serial: left.next_serial + 1 }), covenant: { authorizingInput: 0, covenantId: LD.C } },
        { amount: CARRIER, scriptPublicKey: V.p2sh(edRedeemA), covenant: { authorizingInput: 2, covenantId: covA } },
        { amount: PRICE, scriptPublicKey: '20' + series.artist + 'ac' },
        { amount: BigInt(right.amount), scriptPublicKey: laneSpk({ ...rightState, mints_left: right.mints_left - 1, next_serial: right.next_serial + 1 }), covenant: { authorizingInput: 1, covenantId: LD.C } },
        { amount: CARRIER, scriptPublicKey: V.p2sh(edRedeemB), covenant: { authorizingInput: 2, covenantId: covB } },
        // wallet funds the shared artist payment (200M) + both edition
        // carriers (2x 100M); the lanes fund their own continuations
        { amount: BigInt(wIn.amount) - PRICE - 2n * CARRIER - fee, scriptPublicKey: wIn.spk }
      ];
      inputs[0].signatureScript = hex(B.concat([pushMin(B.from(V.USER, 'hex')), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMin(TAG_F('mint')), pushMin(laneRedeem(leftState))]));
      inputs[1].signatureScript = hex(B.concat([pushMin(B.from(V.USER, 'hex')), pushMin(B.from([0])), pushMinInt(4), pushMinInt(2), pushMin(TAG_F('mint')), pushMin(laneRedeem(rightState))]));
      inputs[2].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 2), V.PRIV)) + '01';
      return rpc(inputs, outputs);
    }
    try {
      const { txId } = await feeLoop(build, 3000000n);
      console.log('!!! ATTACK SUCCEEDED (tx ' + txId + ') — THE H1 FIX DOES NOT HOLD ACROSS LANES !!!');
      LD.attackTxId = txId; save();
      process.exit(1);
    } catch (e) {
      const m = String((e && e.message) || e);
      if (/failed to verify the signature script/i.test(m)) {
        console.log('H1 ACROSS LANES HOLDS: node rejected the double-mint with a shared artist output (script verification failed).');
        LD.attackTxId = 'rejected:' + (m.match(/Rejected transaction ([0-9a-f]{64})/) || [])[1];
        save();
      } else { console.log('ATTACK FAILED FOR ANOTHER REASON (test script bug?): ' + m.slice(0, 300)); process.exit(1); }
    }
  }
  // ---- 4. CONTROL: honest mint from the right lane (serial 2) ----
  if (!LD.editions.length) {
    const wIn = await pickUtxo();
    const serial = right.next_serial;
    const edState = edStateFor(serial);
    const edRedeem = B.concat([Ed.prefix, V.encState(Ed, edState), Ed.suffix]);
    const cov = covIdGenesis(wIn.txId, wIn.index, [{ idx: 1, value: Number(CARRIER), script: V.p2sh(edRedeem) }]);
    const hsInputs = [
      { txId: right.txId, index: right.index, sequence: 0, spk: laneSpk(rightState), amount: BigInt(right.amount) },
      { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }
    ];
    const inputs = [
      { previousOutpoint: { transactionId: right.txId, index: right.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ];
    function build(fee) {
      const outputs = [
        { amount: BigInt(right.amount), scriptPublicKey: laneSpk({ ...rightState, mints_left: right.mints_left - 1, next_serial: right.next_serial + 1 }), covenant: { authorizingInput: 0, covenantId: LD.C } },
        { amount: CARRIER, scriptPublicKey: V.p2sh(edRedeem), covenant: { authorizingInput: 1, covenantId: cov } },
        { amount: PRICE, scriptPublicKey: '20' + series.artist + 'ac' },
        { amount: BigInt(wIn.amount) - PRICE - CARRIER - fee, scriptPublicKey: wIn.spk }
      ];
      inputs[0].signatureScript = hex(B.concat([pushMin(B.from(V.USER, 'hex')), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMin(TAG_F('mint')), pushMin(laneRedeem(rightState))]));
      inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
      return rpc(inputs, outputs);
    }
    const { txId } = await feeLoop(build, 3000000n);
    await waitForConfirmation(txId);
    LD.editions.push({ txId, index: 1, mintTxId: txId, mintIndex: 1, cov, serial, lineage: lineageOf(serial), sales: 0, owner: V.USER, price: 0, amount: Number(CARRIER), spk: hex(V.p2sh(edRedeem)) });
    LD.lanes[1] = { txId, index: 0, mints_left: right.mints_left - 1, next_serial: right.next_serial + 1, amount: right.amount };
    save();
    console.log('FORK-TEST CONTROL MINT OK:', txId, '| serial', serial, '(counter, from right lane) | lineage', lineageOf(serial).slice(0, 16) + '...');
  }
  console.log('FORK-TEST DONE');
})().catch(e => { console.error(e); process.exit(1); });
