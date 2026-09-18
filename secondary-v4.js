const V = require('./v8-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs, feeLoop, waitForConfirmation } = V;
const [,, cmd, kArg, priceArg] = process.argv;
const k = parseInt(kArg || '0', 10);
(async () => {
  const LD = JSON.parse(fs.readFileSync('data/factory-ledger-v8.json', 'utf8'));
  const Ed = parts(JSON.parse(fs.readFileSync('data/edition-abi-v4.json', 'utf8')));
  const TAG = n => H(Ed.c.entries[n].dispatch_tag);
  const ed = LD.editions[k];
  if (!ed) throw new Error('edition ' + k + ' not in ledger');
  const DUST = BigInt(ed.amount);
  const stateOf = (owner, price) => ({ ownerIdentifier: owner, identifierType: 0, price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial });
  const redeemOf = st => B.concat([Ed.prefix, encState(Ed, st), Ed.suffix]);
  const curRedeem = redeemOf(stateOf(ed.owner, ed.price));
  const edIn = { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curRedeem), amount: DUST };
  if (ed.spk && hex(edIn.spk) !== ed.spk) throw new Error('F-B17 template drift: ledger spk ' + ed.spk.slice(0, 18) + '... != recomputed ' + hex(edIn.spk).slice(0, 18) + '... — on-chain edition bound to a different template than the on-disk ABI');
  const rpc = (inputs, outputs, ssHex, sigW) => ({ version: 1, inputs: [
    { previousOutpoint: { transactionId: edIn.txId, index: edIn.index }, signatureScript: ssHex, sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: inputs[1].txId, index: inputs[1].index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
  if (cmd === 'list') {
    const newPrice = BigInt(priceArg);
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(fee) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(ed.owner, newPrice))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: wIn.amount - fee, scriptPublicKey: wIn.spk }
      ];
      const rawSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
    const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(B.concat([rawSig, B.from([0x01])])), pushMinInt(newPrice), pushMin(TAG('list')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.price = Number(newPrice); ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS LIST:', txId, '| edition', ed.cov.slice(0, 16), '| newPrice', newPrice.toString());
  } else if (cmd === 'buy') {
    const price = BigInt(ed.price);
    if (price < 500000000n) throw new Error('not listed or below MIN_PRICE');
    const fee = price * 100n / 10000n;
    const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    const spk = '20' + V.USER + 'ac';
    function build(feeTx) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(V.USER, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: price - roy - fee, scriptPublicKey: spk },
        { amount: roy, scriptPublicKey: spk },
        { amount: fee, scriptPublicKey: spk },
        { amount: wIn.amount - price - feeTx, scriptPublicKey: wIn.spk }
      ];
      const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(H(V.USER)), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('buy')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.owner = V.USER; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS BUY:', txId, '| ownerNet', (price - roy - fee).toString(), '| royalty', roy.toString(), '| platformFee', fee.toString());
  } else if (cmd === 'sell') {
    const askPrice = BigInt(priceArg);
    if (askPrice < 500000000n) throw new Error('askPrice below MIN_PRICE (5 KAS)');
    const fee = askPrice * 100n / 10000n;
    const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000000n * 1000n; // bips: *500/10000
    const royCheck = askPrice * BigInt(LD.series.royalty_bips) / 10000n;
    if (roy !== royCheck) throw new Error('royalty math drift');
    const buyer = V.USER;
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(feeTx) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(buyer, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: askPrice - roy - fee, scriptPublicKey: '20' + ed.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: fee, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: wIn.amount - askPrice - feeTx, scriptPublicKey: wIn.spk }
      ];
      const ownerSigRaw = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
      const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(H(buyer)), pushMin(B.from([0])), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('sell')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.owner = buyer; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS SELL:', txId, '| ownerNet', (askPrice - roy - fee).toString(), '| royalty', roy.toString(), '| platformFee', fee.toString());
  } else { console.error('usage: node secondary-v4.js <list|buy|sell> <edIdx> [priceSompi]'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
