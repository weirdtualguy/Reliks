const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const b = fs.readFileSync('archive/genesis-art.html');
if (b.length > 16384) throw new Error('program exceeds 16KB cap: ' + b.length + ' bytes');
const programHash = Buffer.from(blake2b(b, { dkLen: 32 })).toString('hex');
const chunks = [];
for (let i = 0; i < b.length; i += 2048) chunks.push(b.slice(i, i + 2048).toString('hex'));
fs.writeFileSync('data/chunks.json', JSON.stringify({ programHash, chunks }, null, 1));
console.log('program bytes:', b.length, '| chunks:', chunks.length, '| programHash:', programHash);
