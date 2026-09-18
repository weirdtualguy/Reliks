const V = require('./v8-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs, feeLoop, waitForConfirmation } = V;
const [,, cmd, kArg, priceArg, ageArg] = process.argv;
(async () => {
  const LD = JSON.parse(fs.readFileSync('data/factory-ledger-v8.json', 'utf8'));
  const O = parts(JSON.parse(fs.readFileSync('data/offer-abi-v2.json', 'utf8')));
  const Ed = parts(JSON.parse(fs.readFileSync('data/edition-abi-v4.json', 'utf8')));
  const TAGO = n => H(O.c.entries[n].dispatch_tag);
  const TAGE = n => H(Ed.c.entries[n].dispatch_tag);
  const edRedeem = ed => B.concat([Ed.prefix, encState(Ed, { ownerIdentifier: ed.owner, identifierType: 0, price: ed.price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial }), Ed.suffix]);
  const ofState = of => ({ ownerIdentifier: of.owner, identifierType: 0, edition_covid: of.covEd, askPrice: of.askPrice, expireAge: of.expireAge, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, offerer: of.offerer });
  const ofRedeem = of => B.concat([O.prefix, encState(O, ofState(of)), O.suffix]);
  if (cmd === 'deploy') {
    const ed = LD.editions[parseInt(kArg || '0', 10)];
    const askPrice = BigInt(priceArg);
    const expireAge = BigInt(ageArg || '3600');
    if (askPrice < 500000000n) throw new Error('ask below MIN_PRICE (5 KAS)');
    const wIn = await pickUtxo();
    const redeem = ofRedeem({ owner: ed.owner, covEd: ed.cov, askPrice: Number(askPrice), expireAge: Number(expireAge), offerer: V.USER });
    const spk = V.p2sh(redeem);
    const cov = V.covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: askPrice, script: spk }]);
    function build(txFee) {
      const outputs = [
        { amount: askPrice, scriptPublicKey: spk, covenant: { authorizingInput: 0, covenantId: cov } },
        { amount: wIn.amount - askPrice - txFee, scriptPublicKey: wIn.spk }
      ];
      const sig = '41' + hex(secp.schnorr.signSync(sighash([wIn], outputs, 0), V.PRIV)) + '01';
      return { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    (LD.offers = LD.offers || []).push({ cov, covEd: ed.cov, txId, index: 0, amount: Number(askPrice), askPrice: Number(askPrice), expireAge: Number(expireAge), offerer: V.USER, owner: ed.owner, edIdx: parseInt(kArg || '0', 10) });
    fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS OFFER:', txId, '| escrow cov', cov.slice(0, 16), '| ask', askPrice.toString(), '| expireAge', expireAge.toString());
  } else if (cmd === 'accept') {
    const j = parseInt(kArg || '0', 10);
    const of = LD.offers[j];
    const ed = LD.editions[of.edIdx];
    const askPrice = BigInt(of.askPrice);
    const fee = askPrice * 100n / 10000n;
    const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000n;
    const wIn = await pickUtxo();
    const inputs = [
      { txId: of.txId, index: of.index, sequence: 0, spk: V.p2sh(ofRedeem(of)), amount: BigInt(of.amount) },
      { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(edRedeem(ed)), amount: BigInt(ed.amount) },
      wIn
    ];
    function build(txFee) {
      const outputs = [
        { amount: BigInt(ed.amount), scriptPublicKey: V.p2sh(edRedeem({ ...ed, owner: of.offerer, price: 0 })), covenant: { authorizingInput: 1, covenantId: ed.cov } },
        { amount: askPrice - roy - fee, scriptPublicKey: '20' + of.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: fee, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: wIn.amount - txFee, scriptPublicKey: wIn.spk }
      ];
      const s0 = B.concat([secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV), B.from([0x01])]);
      const s1 = B.concat([secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV), B.from([0x01])]);
      const s2 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 2), V.PRIV)) + '01';
      const ssEscrow = B.concat([pushMin(s0), pushMinInt(0), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAGO('accept')), pushMin(ofRedeem(of))]);
      const ssEd = B.concat([pushMin(s1), pushMin(H(of.offerer)), pushMin(B.from([0])), pushMin(TAGE('transfer')), pushMin(edRedeem(ed))]);
      return { version: 1, inputs: [
        { previousOutpoint: { transactionId: inputs[0].txId, index: inputs[0].index }, signatureScript: hex(ssEscrow), sequence: 0, sigOpCount: 0, computeBudget: 300 },
        { previousOutpoint: { transactionId: inputs[1].txId, index: inputs[1].index }, signatureScript: hex(ssEd), sequence: 0, sigOpCount: 0, computeBudget: 100 },
        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: s2, sequence: 0, sigOpCount: 0, computeBudget: 10 }
      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.owner = of.offerer; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(edRedeem(ed)));
    LD.offers.splice(j, 1);
    fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS ACCEPT:', txId, '| ownerNet', (askPrice - roy - fee).toString(), '| royalty', roy.toString(), '| platformFee', fee.toString());
  } else if (cmd === 'expire') {
    const j = parseInt(kArg || '0', 10);
    const of = LD.offers[j];
    const wIn = await pickUtxo();
    const escIn = { txId: of.txId, index: of.index, sequence: of.expireAge, spk: V.p2sh(ofRedeem(of)), amount: BigInt(of.amount) };
    function build(txFee) {
      const outputs = [
        { amount: BigInt(of.amount), scriptPublicKey: '20' + of.offerer + 'ac' },
        { amount: wIn.amount - txFee, scriptPublicKey: wIn.spk }
      ];
      const ss = B.concat([pushMin(TAGO('expire')), pushMin(ofRedeem(of))]);
      const sigW = '41' + hex(secp.schnorr.signSync(sighash([escIn, wIn], outputs, 1), V.PRIV)) + '01';
      return { version: 1, inputs: [
        { previousOutpoint: { transactionId: escIn.txId, index: escIn.index }, signatureScript: hex(ss), sequence: escIn.sequence, sigOpCount: 0, computeBudget: 50 },
        { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
      ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    LD.offers.splice(j, 1);
    fs.writeFileSync('data/factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS EXPIRE:', txId, '| refund to offerer (F-B6: outputs[0])');
  } else { console.error('usage: node offer-v2.js <deploy|accept|expire> <idx> [askSompi] [expireAge]'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
