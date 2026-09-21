const fs = require('fs');
const p = 'secondary-v10.js';
let s = fs.readFileSync(p, 'utf8');

// 1. Fix buy sigscript arg order (v5 ABI: buyer, ownerOutIdx, artistOutIdx, platformOutIdx)
const oldBuySs = "const ss = B.concat([pushMin(H(V.USER)), pushMin(B.from([0])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('buy')), pushMin(curRedeem)]);";
const newBuySs = "const ss = B.concat([pushMin(H(V.USER)), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('buy')), pushMin(curRedeem)]);";
if (!s.includes(oldBuySs)) { console.error('buy ss anchor not found'); process.exit(1); }
s = s.split(oldBuySs).join(newBuySs);

// 2. Fix buy output spks (must pay artist/platform to artistSpk, not buyer)
const oldBuySpks = `      const spk = '20' + V.USER + 'ac';
      function build(feeTx) {
        const outputs = [
          { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(V.USER, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
          { amount: price - roy - fee, scriptPublicKey: spk },
          { amount: roy, scriptPublicKey: spk },
          { amount: fee, scriptPublicKey: spk },
          { amount: wIn.amount - price - feeTx, scriptPublicKey: wIn.spk }
        ];`;
const newBuySpks = `      const ownerSpk = '20' + ed.owner + 'ac';
      const artistSpk = '20' + LD.series.artist + 'ac';
      function build(feeTx) {
        const outputs = [
          { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(V.USER, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
          { amount: price - roy - fee, scriptPublicKey: ownerSpk },
          { amount: roy, scriptPublicKey: artistSpk },
          { amount: fee, scriptPublicKey: artistSpk },
          { amount: wIn.amount - price - feeTx, scriptPublicKey: wIn.spk }
        ];`;
if (!s.includes(oldBuySpks)) { console.error('buy spks anchor not found'); process.exit(1); }
s = s.split(oldBuySpks).join(newBuySpks);

// 3. Fix sell sigscript arg order (v5 ABI: buyer, salePrice, ownerOutIdx, artistOutIdx, platformOutIdx, ownerSig)
const oldSellSs = "const ss = B.concat([pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(H(buyer)), pushMin(B.from([0])), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG('sell')), pushMin(curRedeem)]);";
const newSellSs = "const ss = B.concat([pushMin(H(buyer)), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(TAG('sell')), pushMin(curRedeem)]);";
if (!s.includes(oldSellSs)) { console.error('sell ss anchor not found'); process.exit(1); }
s = s.split(oldSellSs).join(newSellSs);

// 4. Fix sell roy calculation (integer division precision)
const oldRoy = "const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000000n * 1000n; // bips: *500/10000";
const newRoy = "const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000n;";
if (s.includes(oldRoy)) {
  s = s.split(oldRoy).join(newRoy);
}

fs.writeFileSync(p, s);
console.log('patched secondary-v10.js: buy/sell arg orders + buy spks + sell roy math');
