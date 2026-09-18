const fs = require('fs');
let s = fs.readFileSync('offer-lib.js', 'utf8');
const OLD = "const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';";
if (!s.includes(OLD)) { console.log('already patched or anchor missing'); process.exit(0); }
const NEU = "const USER = hex(B.from(secp.getPublicKey(B.from(PRIV, 'hex'), true)).subarray(1, 33)); // derived from PC_PRIV; no hardcoded identity";
s = s.split(OLD).join(NEU);
fs.writeFileSync('offer-lib.js', s);
console.log('patched offer-lib.js: USER derived from PC_PRIV');
