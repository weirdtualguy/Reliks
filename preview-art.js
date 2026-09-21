const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const file = process.argv[2] || 'data/chunks.json';
const CH = JSON.parse(fs.readFileSync(file, 'utf8'));
const chunks = CH.chunks || CH.parts || [];
if (!chunks.length) { console.error('no chunks in', file, '| keys:', Object.keys(CH)); process.exit(1); }
const isHex = s => typeof s === 'string' && s.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(s);
const bytes = isHex(chunks[0]) ? Buffer.concat(chunks.map(c => Buffer.from(c, 'hex'))) : Buffer.from(chunks.join(''), 'utf8');
const hash = Buffer.from(blake2b(bytes, { dkLen: 32 })).toString('hex');
const expect = CH.programHash || CH.program_hash;
console.log('program bytes:', bytes.length, '| blake2b:', hash);
console.log('chunks.json programHash:', expect);
console.log(hash === expect ? '✅ PREVIEW IS BYTE-IDENTICAL TO WHAT MAINNET WILL COMMIT' : '❌ hash mismatch — inspect chunk format before trusting this preview');
fs.writeFileSync('web/genesis-preview.html', bytes);
console.log('wrote web/genesis-preview.html');
