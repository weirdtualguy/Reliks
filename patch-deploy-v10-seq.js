const fs = require('fs');
const p = 'deploy-v10.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes("sequence: 0, spk: '20' + V.USER")) { console.log('already patched'); process.exit(0); }
const anchor = "wIn = { txId: next.outpoint.transactionId, index: next.outpoint.index, spk: '20' + V.USER + 'ac', amount: BigInt(next.utxoEntry.amount) };";
if (!s.includes(anchor)) { console.error('anchor not found'); console.error(s.split('\n').filter(l=>l.includes('wIn = {')).join('\n')); process.exit(1); }
s = s.split(anchor).join("wIn = { txId: next.outpoint.transactionId, index: next.outpoint.index, sequence: 0, spk: '20' + V.USER + 'ac', amount: BigInt(next.utxoEntry.amount) };");
fs.writeFileSync(p, s);
console.log('patched deploy-v10.js: added sequence: 0 to constructed wIn');
