const V = require('./v8-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs, feeLoop, waitForConfirmation } = V;
const [,, cmd, kArg, priceArg] = process.argv;
const k = parseInt(kArg || '0', 10);
(async () => {

  // ESC-INFO FIX (audit): wallet/priv preflight guard (same as deploy/mint)
  const RG = (() => { const fs2 = require('fs'); const src = fs2.readFileSync(__dirname + '/web/reliks-gallery-runtime.js', 'utf8'); return new Function('RB2B', 'REG', 'self', src + ';return self.ReliksGallery;')(require('@noble/hashes/blake2b').blake2b, { hrp: require('./network.js').hrp }, {}); })();
  if (V.WALLET !== RG.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }

  const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), 'utf8'));
  const Ed = parts(JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8')));
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
      const ss = B.concat([pushMinInt(newPrice), pushMin(B.concat([rawSig, B.from([0x01])])), pushMin(TAG('list')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.price = Number(newPrice); ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS LIST:', txId, '| edition', ed.cov.slice(0, 16), '| newPrice', newPrice.toString());
    } else if (cmd === 'buy') {
    const price = BigInt(ed.price);
    if (price < 100000000n) throw new Error('not listed or below MIN_PRICE (1 KAS)');
    const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
    const ownerNet = price - roy;
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    const ownerSpk = '20' + ed.owner + 'ac';
    const artistSpk = '20' + LD.series.artist + 'ac';
    function build(feeTx) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(V.USER, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: ownerNet, scriptPublicKey: ownerSpk },
        { amount: roy, scriptPublicKey: artistSpk },
        { amount: wIn.amount - price - feeTx, scriptPublicKey: wIn.spk }
      ];
      const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(H(V.USER)), pushMinInt(1), pushMinInt(2), pushMin(TAG('buy')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.owner = V.USER; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS V11 BUY:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString(), '| platformFee 0 (Model B)');
  } else if (cmd === 'sell') {
    const askPrice = BigInt(priceArg);
    if (askPrice !== 0n && askPrice < 100000000n) throw new Error('askPrice below MIN_PRICE (1 KAS)');
    const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000n;
    const ownerNet = askPrice - roy;
    const buyer = V.USER;
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(feeTx) {
      const payOuts = askPrice === 0n ? [] : [
        { amount: ownerNet, scriptPublicKey: '20' + ed.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' }
      ];
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(buyer, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        ...payOuts,
        { amount: wIn.amount - askPrice - feeTx, scriptPublicKey: wIn.spk }
      ];
      const ownerSigRaw = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
      const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(H(buyer)), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(TAG('sell')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.owner = buyer; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS V11 SELL:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString());
} else { console.error('usage: node secondary-v4.js <list|buy|sell> <edIdx> [priceSompi]'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
