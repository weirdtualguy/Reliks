const fs = require('fs');
let s = fs.readFileSync('mint-v8.js', 'utf8');

const OLD_WIN = "const wIn = await pickUtxo();";
const NEW_WIN = `const REQUIRED = price + BigInt(DUST) + 50000000n; // price + edition dust + fee buffer
  const allUtxos = await (await fetch(V.rest + '/addresses/' + V.WALLET + '/utxos')).json();
  if (!Array.isArray(allUtxos)) throw new Error('UTXO fetch failed');
  const confirmed = allUtxos.filter(x => x.utxoEntry && x.utxoEntry.blockDaaScore).sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const walletInputs = [];
  let totalWalletIn = 0n;
  for (const u of confirmed) {
    if (totalWalletIn >= REQUIRED) break;
    walletInputs.push({ txId: u.outpoint.transactionId, index: u.outpoint.index, sequence: 0, spk: '20' + V.USER + 'ac', amount: BigInt(u.utxoEntry.amount) });
    totalWalletIn += BigInt(u.utxoEntry.amount);
  }
  if (totalWalletIn < REQUIRED) throw new Error('insufficient wallet funds: have ' + totalWalletIn.toString() + ' need ' + REQUIRED.toString());
  console.log('funding mint with', walletInputs.length, 'UTXO(s) totaling', Number(totalWalletIn)/1e8, 'KAS');`;
if (!s.includes(OLD_WIN)) { console.log('❌ wIn anchor missing'); process.exit(1); }
s = s.split(OLD_WIN).join(NEW_WIN);

const OLD_INPUTS = `const inputs = [
    { txId: lane.txId, index: lane.index, sequence: 0, spk: laneSpk, amount: DUST },
    wIn
  ];`;
const NEW_INPUTS = `const inputs = [
    { txId: lane.txId, index: lane.index, sequence: 0, spk: laneSpk, amount: DUST },
    ...walletInputs
  ];`;
if (!s.includes(OLD_INPUTS)) { console.log('❌ inputs anchor missing'); process.exit(1); }
s = s.split(OLD_INPUTS).join(NEW_INPUTS);

const OLD_BUILD = `function build(txFee) {
    const outputs = [
      { amount: DUST, scriptPublicKey: V.p2sh(B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft - 1 }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: DUST, scriptPublicKey: edSpk, covenant: { authorizingInput: 1, covenantId: edCov } },
      { amount: artistCut, scriptPublicKey: artistSpk },
      { amount: fee, scriptPublicKey: artistSpk },
      { amount: wIn.amount - price - DUST - txFee, scriptPublicKey: wIn.spk }
    ];
    const ssLane = B.concat([pushMin(H(V.USER)), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG_MINT), pushMin(redeemLane)]);
    const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
    return { version: 1, inputs: [
        { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ssLane), sequence: 0, sigOpCount: 0, computeBudget: 100 },
        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }`;
const NEW_BUILD = `function build(txFee) {
    const change = totalWalletIn - price - BigInt(DUST) - txFee;
    const outputs = [
      { amount: DUST, scriptPublicKey: V.p2sh(B.concat([F.prefix, encState(F, { ...LD.series, mints_left: lane.mintsLeft - 1 }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: DUST, scriptPublicKey: edSpk, covenant: { authorizingInput: 1, covenantId: edCov } },
      { amount: artistCut, scriptPublicKey: artistSpk },
      { amount: fee, scriptPublicKey: artistSpk },
      { amount: change, scriptPublicKey: walletInputs[0].spk }
    ];
    const ssLane = B.concat([pushMin(H(V.USER)), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG_MINT), pushMin(redeemLane)]);
    const txInputs = [
      { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ssLane), sequence: 0, sigOpCount: 0, computeBudget: 100 },
      ...walletInputs.map((w, i) => ({ previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, i + 1), V.PRIV)) + '01', sequence: 0, sigOpCount: 0, computeBudget: 10 }))
    ];
    return { version: 1, inputs: txInputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  }`;
if (!s.includes(OLD_BUILD)) { console.log('❌ build anchor missing'); process.exit(1); }
s = s.split(OLD_BUILD).join(NEW_BUILD);

fs.writeFileSync('mint-v8.js', s);
console.log('✅ mint-v8 patched for multi-UTXO funding');
