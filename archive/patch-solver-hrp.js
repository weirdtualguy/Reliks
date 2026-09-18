const fs = require('fs');
let s = fs.readFileSync('solve-bech32-v3.js', 'utf8');
const reps = [
  ['function feedFor(r,bytes){', 'function feedFor(r,hrp,bytes){'],
  ['hrpExp(r.mode,r.hrp)', 'hrpExp(r.mode,hrp)'],
  ['[...r.hrp].map(c=>c.charCodeAt(0))', '[...hrp].map(c=>c.charCodeAt(0))'],
  ['feedFor(r,[v.version,...v.payload])', 'feedFor(r,v.hrp,[v.version,...v.payload])'],
  ['feedFor(r,[vecs[0].version,...vecs[0].payload])', 'feedFor(r,vecs[0].hrp,[vecs[0].version,...vecs[0].payload])'],
];
for (const [a, b] of reps) { if (!s.includes(a)) { console.error('missing:', a); process.exit(1); } s = s.split(a).join(b); }
fs.writeFileSync('solve-bech32-v3.js', s);
console.log('✅ feedFor now takes the hrp from each vector');
