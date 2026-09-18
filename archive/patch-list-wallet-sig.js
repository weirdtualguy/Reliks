const fs = require('fs');
let s = fs.readFileSync('secondary-v4.js', 'utf8');
const A = "const rawSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);";
const B = "return rpc(inputs, outputs, hex(ss), '41' + hex(rawSig) + '01');";
if (!s.includes(A) || !s.includes(B)) { console.log('❌ anchors missing'); process.exit(1); }
s = s.split(A).join(A + "\n    const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';");
s = s.split(B).join("return rpc(inputs, outputs, hex(ss), sigW1);");
fs.writeFileSync('secondary-v4.js', s);
console.log('✅ wallet input now signs sighash index 1; edition arg keeps index 0');
