const V = require('./v8-lib.js');
const { B, hex, sighash, parts, encState, pickUtxo, secp, fs, DUST, feeLoop, waitForConfirmation } = V;
(async () => {
  const F = parts(JSON.parse(fs.readFileSync('data/factory-abi-v8.json', 'utf8')));
  const CH = JSON.parse(fs.readFileSync('data/chunks.json', 'utf8'));
  const series = { program_hash: CH.programHash, artist: V.USER, price: 1000000000, royalty_bips: 500 };
  const state0 = { ...series, mints_left: 1 };
  const spk0 = V.p2sh(B.concat([F.prefix, encState(F, state0), F.suffix]));
  const wIn = await pickUtxo();
  const C = V.covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: DUST, script: spk0 }]);
  function build(fee) {
    const outs = [
      { amount: DUST, scriptPublicKey: spk0, covenant: { authorizingInput: 0, covenantId: C } },
      { amount: wIn.amount - DUST - fee, scriptPublicKey: wIn.spk }
    ];
    const sig = '41' + hex(secp.schnorr.signSync(sighash([wIn], outs, 0), V.PRIV)) + '01';
    return { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }
  const { txId, fee } = await feeLoop(build);
  console.log('  waiting for confirmation...');
  await waitForConfirmation(txId);
  fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify({ C, genesisTxId: txId, series, lanes: [{ txId, index: 0, mintsLeft: 1 }] }, null, 2));
  console.log('RELIKS V8 GENESIS:', txId, '| fee', fee.toString(), '| lane covenant C =', C);
})().catch(e => { console.error(e); process.exit(1); });
