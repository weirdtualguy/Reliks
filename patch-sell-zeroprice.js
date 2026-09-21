const fs = require('fs');
const p = 'secondary-v10.js';
let s = fs.readFileSync(p, 'utf8');
const oldGuard = "if (askPrice < 500000000n) throw new Error('askPrice below MIN_PRICE (5 KAS)');";
const newGuard = "if (askPrice !== 0n && askPrice < 500000000n) throw new Error('askPrice below MIN_PRICE (5 KAS)');";
if (!s.includes(oldGuard)) { console.error('sell guard anchor not found'); process.exit(1); }
s = s.split(oldGuard).join(newGuard);
const oldOuts = `      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(buyer, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: askPrice - roy - fee, scriptPublicKey: '20' + ed.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: fee, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: wIn.amount - askPrice - feeTx, scriptPublicKey: wIn.spk }
      ];`;
const newOuts = `      const payOuts = askPrice === 0n ? [] : [
        { amount: askPrice - roy - fee, scriptPublicKey: '20' + ed.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: fee, scriptPublicKey: '20' + LD.series.artist + 'ac' }
      ];
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(buyer, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        ...payOuts,
        { amount: wIn.amount - askPrice - feeTx, scriptPublicKey: wIn.spk }
      ];`;
if (!s.includes(oldOuts)) { console.error('sell outputs anchor not found'); process.exit(1); }
s = s.split(oldOuts).join(newOuts);
fs.writeFileSync(p, s);
console.log('patched secondary-v10.js: zero-price signed handoff supported (contract-parity)');
