const V = require('./v7-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, secp, fs, USER, DUST, feeLoop, fetchRetry, serialOf } = V;
(async () => {
  const LD = JSON.parse(fs.readFileSync('factory-ledger-v7.json', 'utf8'));
  const F = parts(JSON.parse(fs.readFileSync('factory-abi-v7.json', 'utf8')));
  const Ed = parts(JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8')));
  const TAG_MINT = H(F.c.entries.mint.dispatch_tag);
  const w = await (await fetchRetry('https://api-tn10.kaspa.org/addresses/' + V.WALLET + '/utxos')).json();
  const conf = w.filter(x => x.utxoEntry.blockDaaScore).sort((x, y) => Number(BigInt(y.utxoEntry.amount) - BigInt(x.utxoEntry.amount)));
  const price = BigInt(LD.series.price);
  const results = [];
  for (let k = 0; k < 2; k++) {
    const lane = LD.lanes[k];
    const wIn = { txId: conf[k].outpoint.transactionId, index: conf[k].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(conf[k].utxoEntry.amount) };
    const redeem = B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft }), F.suffix]);
    const spk = V.p2sh(redeem);
    const serial = serialOf(lane.txId, lane.index);
    const edState = { ownerIdentifier: USER, identifierType: 0, price: 0, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial };
    const edSpk = V.p2sh(B.concat([Ed.prefix, encState(Ed, edState), Ed.suffix]));
    const edCov = V.covIdGenesis(wIn.txId, wIn.index, [{ idx: 1, value: DUST, script: edSpk }]);
    const inputs = [ { txId: lane.txId, index: lane.index, sequence: 0, spk, amount: DUST }, wIn ];
    function build(fee) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft - 1 }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
        { amount: DUST, scriptPublicKey: edSpk, covenant: { authorizingInput: 1, covenantId: edCov } },
        { amount: price, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: wIn.amount - DUST - price - fee, scriptPublicKey: wIn.spk }
      ];
      const ss = B.concat([ pushMin(H(USER)), pushMinInt(2), pushMinInt(1), pushMin(TAG_MINT), pushMin(redeem) ]);
      const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      return { version: 1, inputs: [
          { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ss), sequence: 0, sigOpCount: 0, computeBudget: 100 },
          { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
        ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
    }
    const { txId, fee } = await feeLoop(build);
    results.push({ txId, serial, edCov, fee });
    LD.lanes[k] = { txId, index: 0, mintsLeft: lane.mintsLeft - 1 };
    (LD.editions = LD.editions || []).push(edCov);
  }
  fs.writeFileSync('factory-ledger-v7.json', JSON.stringify(LD, null, 2));
  console.log('PARALLEL MINTS (disjoint UTXO sets, no parent/child dependency):');
  results.forEach((r, i) => console.log('  lane ' + i + ': ' + r.txId + ' | serial ' + r.serial + ' | edition ' + r.edCov.slice(0, 16) + '... | fee ' + r.fee.toString()));
  if (results[0].serial === results[1].serial) throw new Error('serial collision!');
  console.log('serials unique ✓');
})().catch(e => { console.error(e); process.exit(1); });
