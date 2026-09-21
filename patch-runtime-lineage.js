const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
const pairs = [
  ["var consumed = i === 0 ? REG.genesisTxId : eds[i - 1].txId;",
   "var consumed = i === 0 ? REG.genesisTxId : (eds[i - 1].mintTxId || eds[i - 1].txId);"],
  ["var mintTx = await fetchTx(ed.txId);",
   "var mintTx = await fetchTx(ed.mintTxId || ed.txId);"],
  ["REG.explorer + item.ed.txId + '",
   "REG.explorer + (item.ed.mintTxId || item.ed.txId) + '"],
  ["' + item.ed.txId.slice(0, 12) + '",
   "' + (item.ed.mintTxId || item.ed.txId).slice(0, 12) + '"]
];
for (const [a, b] of pairs) {
  if (!s.includes(a)) { console.error('runtime anchor not found:', a.slice(0, 50)); process.exit(1); }
  s = s.split(a).join(b);
}
fs.writeFileSync(p, s);
console.log('runtime lineage + mint link now use immutable mintTxId (fallback txId for pre-patch ledgers)');
