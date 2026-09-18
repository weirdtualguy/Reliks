const fs = require('fs');
let s = fs.readFileSync('mint-v8.js', 'utf8');
const OLD = "(LD.editions = LD.editions || []).push(edCov);";
const NEW = "(LD.editions = LD.editions || []).push({ cov: edCov, txId, index: 1, amount: Number(DUST), owner: V.USER, price: 0, serial });";
if (!s.includes(OLD)) { console.log('❌ anchor missing'); process.exit(1); }
s = s.split(OLD).join(NEW);
fs.writeFileSync('mint-v8.js', s);
console.log('✅ mint-v8 patched: editions ledger stores full tracking objects');
