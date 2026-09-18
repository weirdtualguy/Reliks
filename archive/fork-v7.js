const V = require('./v7-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs, DUST, feeLoop } = V;
(async () => {
  const LD = JSON.parse(fs.readFileSync('factory-ledger-v7.json', 'utf8'));
  const F = parts(JSON.parse(fs.readFileSync('factory-abi-v7.json', 'utf8')));
  const TAG = H(F.c.entries.fork.dispatch_tag);
  const li = parseInt(process.argv[2] || '0', 10);
  const a = parseInt(process.argv[3] || '2', 10), b = parseInt(process.argv[4] || '2', 10);
  const lane = LD.lanes[li];
  if (a + b !== lane.mintsLeft) throw new Error('split must conserve allowance');
  const redeem = B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft }), F.suffix]);
  const spk = V.p2sh(redeem);
  const wIn = await pickUtxo();
  const inputs = [ { txId: lane.txId, index: lane.index, sequence: 0, spk, amount: DUST }, wIn ];
  function build(fee) {
    const outputs = [
      { amount: DUST, scriptPublicKey: V.p2sh(B.concat([F.prefix, encState(F, { ...LD.series, mints_left: a }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: DUST, scriptPublicKey: V.p2sh(B.concat([F.prefix, encState(F, { ...LD.series, mints_left: b }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: wIn.amount - DUST - fee, scriptPublicKey: wIn.spk }
    ];
    const sig0 = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
    const ss = B.concat([ pushMin(B.concat([sig0, B.from([0x01])])), pushMinInt(a), pushMinInt(b), pushMin(TAG), pushMin(redeem) ]);
    const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
    return { version: 1, inputs: [
        { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ss), sequence: 0, sigOpCount: 0, computeBudget: 100 },
        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }
  const { txId, fee } = await feeLoop(build);
  LD.lanes.splice(li, 1, { txId, index: 0, mintsLeft: a }, { txId, index: 1, mintsLeft: b });
  fs.writeFileSync('factory-ledger-v7.json', JSON.stringify(LD, null, 2));
  console.log('FORK:', txId, '| fee', fee.toString(), '| live lanes now', LD.lanes.length);
})().catch(e => { console.error(e); process.exit(1); });
