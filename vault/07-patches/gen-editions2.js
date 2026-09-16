const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const F = JSON.parse(fs.readFileSync('factory2.json', 'utf8'));
const g = Buffer.from(F.genesis, 'hex');
const eds = [];
for (let i = 0; i < 8; i++) eds.push({ i, seed: Buffer.from(blake2b(Buffer.concat([g, Buffer.from([i])]), { dkLen: 32 })).toString('hex') });
fs.writeFileSync('editions2.json', JSON.stringify({ series: F.covenantId, editions: eds }, null, 1));
console.log('✅ editions2.json: 8 chain-convention seeds (blake2b(genesis ‖ counter))');
