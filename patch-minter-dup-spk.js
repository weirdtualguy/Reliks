const fs = require('fs');
const p = 'sil/ReliksMinter-v9.sil';
let s = fs.readFileSync(p, 'utf8');
const dup = '            int fee = (price * PLATFORM_BIPS) / 10000;\n            byte[36] artistSpk = new ScriptPubKeyP2PK(pubkey(artist));\n';
if (!s.includes(dup)) { console.log('anchor not found (already fixed?)'); process.exit(1); }
s = s.split(dup).join('            int fee = (price * PLATFORM_BIPS) / 10000;\n');
fs.writeFileSync(p, s);
console.log('removed duplicate artistSpk declaration in checkPrimaryPayments');
