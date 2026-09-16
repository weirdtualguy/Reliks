const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const path = process.argv[2] || 'factory3.json';
const F = JSON.parse(fs.readFileSync(path, 'utf8'));
const out = process.argv[3] || path.replace('factory', 'editions');
const g = Buffer.from(F.genesis, 'hex'); const eds = [];
for (let i = 0; i < Math.max(8, F.counter); i++) eds.push({ i, seed: Buffer.from(blake2b(Buffer.concat([g, Buffer.from([i])]), { dkLen: 32 })).toString('hex') });
fs.writeFileSync(out, JSON.stringify({ series: F.covenantId, editions: eds }, null, 1));
console.log('✅', out, eds.length, 'seeds');
