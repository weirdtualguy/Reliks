const fs = require('fs');
let s = fs.readFileSync('offer-lib.js', 'utf8');
const before = s;
s = s.replace(/conf\.sort\(\(a, b\) => \{[\s\S]*?\}\);/, "conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount))); // largest-first: storage-mass credit dominates");
if (s === before) { console.log('❌ sort anchor not found — inspect pickUtxoSafe manually'); process.exit(1); }
fs.writeFileSync('offer-lib.js', s);
console.log('✅ pickUtxoSafe patched: largest-first among confirmed UTXOs');
