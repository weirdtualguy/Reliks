const fs = require('fs');
const p = 'gen-gallery-v10.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes("assert(RG.p2pkAddress('20' + V.USER + 'ac') === V.WALLET")) { console.log('already assert'); process.exit(0); }
const warn = s.split('\n').find(l => l.includes('WARNING: bech32 P2PK vector mismatch'));
if (!warn) { console.error('warning line not found'); process.exit(1); }
s = s.split(warn).join("assert(RG.p2pkAddress('20' + V.USER + 'ac') === V.WALLET, 'bech32 P2PK vector == configured wallet address');");
fs.writeFileSync(p, s);
console.log('restored hard assert for bech32 wallet vector');
