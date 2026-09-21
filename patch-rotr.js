const fs = require('fs');
const p = 'web/gallery-blake2b.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('var bn = BigInt(n)')) { console.log('already patched'); process.exit(0); }
const old = 'function rotr(x, n) { return ((x >> n) | (x << (64n - n))) & M64; }';
if (!s.includes(old)) { console.error('anchor not found'); process.exit(1); }
s = s.split(old).join('function rotr(x, n) { var bn = BigInt(n); return ((x >> bn) | (x << (64n - bn))) & M64; }');
fs.writeFileSync(p, s);
console.log('patched web/gallery-blake2b.js: rotr converts shift count to BigInt');
