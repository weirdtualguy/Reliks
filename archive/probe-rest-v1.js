const V = require('./v7-lib.js');
const N = require('./network.js');
const { B, hex, sighash, secp, pickUtxo, covIdGenesis, p2sh } = V;
(async () => {
  const wIn = await pickUtxo();
  const spk = p2sh(B.from([0x51]));
  const C = covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: 10000000n, script: spk }]);
  function build(fee) {
    const outputs = [
      { amount: 10000000n, scriptPublicKey: spk, covenant: { authorizingInput: 0, covenantId: C } },
      { amount: wIn.amount - 10000000n - fee, scriptPublicKey: wIn.spk }
    ];
    const sig = '41' + hex(secp.schnorr.signSync(sighash([wIn], outputs, 0), V.PRIV)) + '01';
    return { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }
  const r = await V.feeLoop(build).catch(e => ({ err: e.message }));
  if (r.err) { console.log('PROBE REJECTED:', r.err.slice(0, 400)); process.exit(1); }
  console.log('PROBE TX:', r.txId, '| probe covenant C =', C);
  console.log('VERIFY BINDING:', (N.kascov || 'https://kascov.io/mainnet') + '/c/' + C + '.json');
})().catch(e => { console.error(e); process.exit(1); });
