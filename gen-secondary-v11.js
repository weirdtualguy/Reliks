const fs = require('fs');
const { execSync } = require('child_process');
execSync("sed -e 's|data/factory-ledger-v10-market.json|data/factory-ledger-v11.json|g' -e 's|data/edition-abi-v5.json|data/edition-abi-v6.json|g' secondary-v10.js > secondary-v11.js");
let s = fs.readFileSync('secondary-v11.js', 'utf8');
const buyStart = "} else if (cmd === 'buy') {";
const sellStart = "} else if (cmd === 'sell') {";
const tail = "} else { console.error('usage:";
const iBuy = s.indexOf(buyStart), iSell = s.indexOf(sellStart), iTail = s.indexOf(tail);
if (iBuy < 0 || iSell < 0 || iTail < 0) { console.error('branch anchors not found'); process.exit(1); }
const NEW_BUY = `  } else if (cmd === 'buy') {
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
    fs.writeFileSync('data/factory-ledger-v11.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS V11 BUY:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString(), '| platformFee 0 (Model B)');
`;
const NEW_SELL = `  } else if (cmd === 'sell') {
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
    fs.writeFileSync('data/factory-ledger-v11.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS V11 SELL:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString());
`;
s = s.slice(0, iBuy) + NEW_BUY + NEW_SELL + s.slice(iTail);
fs.writeFileSync('secondary-v11.js', s);
console.log('secondary-v11.js generated: royalty-only splits, v11 push orders, 1 KAS floor');
