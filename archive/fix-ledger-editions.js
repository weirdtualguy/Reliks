const V = require('./v8-lib.js');
const fs = require('fs');
const LD = JSON.parse(fs.readFileSync('factory-ledger-v8.json', 'utf8'));
const out = [];
for (const e of LD.editions) {
  if (typeof e === 'object' && e.txId) { out.push(e); continue; }
  const cov = typeof e === 'string' ? e : e.cov;
  const rec = { cov, txId: LD.lanes[0].txId, index: 1, amount: Number(V.DUST), owner: V.USER, price: 0, serial: V.serialOf(LD.genesisTxId, 0) };
  out.push(rec);
  console.log('repaired:', JSON.stringify(rec));
}
LD.editions = out;
fs.writeFileSync('factory-ledger-v8.json', JSON.stringify(LD, null, 2));
console.log('CROSS-CHECK: serial above must equal the mint print 975712004904810359');
