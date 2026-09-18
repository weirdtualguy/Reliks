const fs = require('fs');
let s = fs.readFileSync('secondary-v4.js', 'utf8');
const L = "ed.price = Number(newPrice); ed.txId = txId; ed.index = 0;";
const Bb = "ed.owner = V.USER; ed.price = 0; ed.txId = txId; ed.index = 0;";
if (!s.includes(L) || !s.includes(Bb)) { console.log('❌ anchors missing'); process.exit(1); }
if (s.includes('ed.spk = hex(V.p2sh')) { console.log('skip: spk sync already present'); }
else {
  s = s.split(L).join(L + "\n    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));");
  s = s.split(Bb).join(Bb + "\n    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));");
  fs.writeFileSync('secondary-v4.js', s);
  console.log('✅ list/buy now maintain ledger spk across transitions');
}
