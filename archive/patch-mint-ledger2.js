const fs = require('fs');
let s = fs.readFileSync('mint-v8.js', 'utf8');
const OLD = "(LD.editions = LD.editions || []).push({ cov: edCov, txId, index: 1, amount: Number(DUST), owner: V.USER, price: 0, serial });";
const NEW = "(LD.editions = LD.editions || []).push({ cov: edCov, txId, index: 1, amount: Number(DUST), owner: V.USER, price: 0, serial, spk: hex(edSpk), templateHash: (Array.isArray(Ed.c.compiled.template_hash) ? Buffer.from(Ed.c.compiled.template_hash).toString('hex') : Ed.c.compiled.template_hash) });";
if (!s.includes(OLD)) { console.log('❌ anchor missing'); process.exit(1); }
fs.writeFileSync('mint-v8.js', s.split(OLD).join(NEW));
console.log('✅ mint-v8 now records edition spk + templateHash in ledger');
