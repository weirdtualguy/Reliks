const V = require('./v7-lib.js');
const { B, hex, sighash, parts, encState, pickUtxo, secp, fs, DUST } = V;
(async () => {
  const F = parts(JSON.parse(fs.readFileSync('factory-abi-v7.json', 'utf8')));
  const CH = JSON.parse(fs.readFileSync('chunks.json', 'utf8'));
  const series = { program_hash: CH.programHash, artist: V.USER, price: 100000000, royalty_bips: 500 };
  const state0 = { ...series, mints_left: 4 };
  const spk0 = V.p2sh(B.concat([F.prefix, encState(F, state0), F.suffix]));
  const wIn = await pickUtxo();
  const C = V.covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: DUST, script: spk0 }]);
  const outs = [
    { amount: DUST, scriptPublicKey: spk0, covenant: { authorizingInput: 0, covenantId: C } },
    { amount: wIn.amount - DUST - 2000000n, scriptPublicKey: wIn.spk }
  ];
  const sig = '41' + hex(secp.schnorr.signSync(sighash([wIn], outs, 0), V.PRIV)) + '01';
  const tx = { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  const txId = await V.broadcast(tx);
  console.log("  waiting for confirmation...");
  await V.waitForConfirmation(txId);
  if (!txId) throw new Error('v7 genesis failed');
  fs.writeFileSync('factory-ledger-v7.json', JSON.stringify({ C, genesisTxId: txId, series, lanes: [{ txId, index: 0, mintsLeft: 4 }] }, null, 2));
  console.log('V7 GENESIS:', txId, '| lane covenant C =', C);
})().catch(e => { console.error(e); process.exit(1); });
