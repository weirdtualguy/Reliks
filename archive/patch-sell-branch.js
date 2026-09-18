const fs = require('fs');
let s = fs.readFileSync('secondary-v4.js', 'utf8');
const OLD = "  } else { console.error('usage: node secondary-v4.js <list|buy> <edIdx> [priceSompi]'); process.exit(1); }";
if (!s.includes(OLD)) { console.log('❌ usage anchor missing'); process.exit(1); }
if (s.includes("cmd === 'sell'")) { console.log('skip: sell branch present'); process.exit(0); }
const NEW = `  } else if (cmd === 'sell') {
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
    fs.writeFileSync('factory-ledger-v8.json', JSON.stringify(LD, null, 2));
    console.log('RELIKS SELL:', txId, '| ownerNet', (askPrice - roy - fee).toString(), '| royalty', roy.toString(), '| platformFee', fee.toString());
  } else { console.error('usage: node secondary-v4.js <list|buy|sell> <edIdx> [priceSompi]'); process.exit(1); }`;
s = s.split(OLD).join(NEW);
fs.writeFileSync('secondary-v4.js', s);
console.log('✅ sell branch added');
