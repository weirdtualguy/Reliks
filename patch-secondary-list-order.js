const fs = require('fs');
const p = 'secondary-v10.js';
let s = fs.readFileSync(p, 'utf8');
const old = "const ss = B.concat([pushMin(B.concat([rawSig, B.from([0x01])])), pushMinInt(newPrice), pushMin(TAG('list')), pushMin(curRedeem)]);";
const neu = "const ss = B.concat([pushMinInt(newPrice), pushMin(B.concat([rawSig, B.from([0x01])])), pushMin(TAG('list')), pushMin(curRedeem)]);";
if (!s.includes(old)) { console.error('list ss anchor not found'); process.exit(1); }
s = s.split(old).join(neu);
fs.writeFileSync(p, s);
console.log('patched secondary-v10.js list branch: v5 arg order [newPrice, ownerSig]');
