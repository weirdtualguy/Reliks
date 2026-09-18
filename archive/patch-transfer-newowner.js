const fs = require('fs');
const p = 'transfer-token.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('pushMin(H(pub)),')) { console.log('already patched'); process.exit(0); }
const old = "  const ssA = B.concat([\n    pushMin(H(USER)),\n    pushMin(B.from([0])),\n    pushMin(sm8(AMT)),\n    pushMin(B.from([0])),";
if (!s.includes(old)) { console.error('anchor not found'); process.exit(1); }
s = s.split(old).join("  const ssA = B.concat([\n    pushMin(H(pub)),\n    pushMin(B.from([0])),\n    pushMin(sm8(AMT)),\n    pushMin(B.from([0])),");
fs.writeFileSync(p, s);
console.log('patched transfer-token.js: newStates[0].owner = fresh recipient pubkey');
