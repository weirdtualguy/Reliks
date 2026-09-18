const L = require('./offer-lib.js');
const { B, hex, H, pushMin, pushMinInt, sm8, p2sh, sighash, broadcast, parts, encState, pickUtxo, secp, crypto, fs, USER } = L;
(async () => {
  const [,, edCov, amtArg, ageArg] = process.argv;
  if (!edCov) { console.error('usage: node deploy-offer.js <editionCovId> [amountSompi] [expireAge]'); process.exit(1); }
  const amount = BigInt(amtArg || '500000000');
  const age = parseInt(ageArg || '100', 10);
  const E = parts(JSON.parse(fs.readFileSync('offer-escrow-abi.json', 'utf8')));
  const priv = crypto.randomBytes(32);
  const offerer = hex(B.from(secp.getPublicKey(priv, true)).subarray(1, 33));
  fs.writeFileSync('offer-keys.json', JSON.stringify({ priv: hex(priv), pub: offerer }, null, 2));
  const state = { edition_covid: edCov, amount: Number(amount), offerer, expire_age: age };
  const redeem = B.concat([E.prefix, encState(E, state), E.suffix]);
  const spk = p2sh(redeem);
  const wIn = await pickUtxo();
  const outs = [
    { amount, scriptPublicKey: spk },
    { amount: wIn.amount - amount - L.FEE, scriptPublicKey: wIn.spk }
  ];
  const ins = [wIn];
  const sig = '41' + hex(secp.schnorr.signSync(sighash(ins, outs, 0), L.PRIV)) + '01';
  const tx = { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  const txId = await broadcast(tx);
  if (!txId) throw new Error('offer deploy failed');
  fs.writeFileSync('offer-ledger.json', JSON.stringify({ txId, index: 0, amount: Number(amount), editionCovId: edCov, offerer, expireAge: age, spk }, null, 2));
  console.log('OFFER LOCKED:', txId + ':0', '| amount', amount.toString(), '| offerer', offerer.slice(0, 16) + '...', '| expireAge', age);
})().catch(e => { console.error(e); process.exit(1); });
