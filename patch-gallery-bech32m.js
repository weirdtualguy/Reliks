const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('0x98f2bc8e61n')) { console.log('already patched'); process.exit(0); }

const oldPoly = "function b32polymod(values) { var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; var chk = 1; for (var i = 0; i < values.length; i++) { var top = chk >> 25; chk = ((chk & 0x1ffffff) << 5) ^ values[i]; for (var j = 0; j < 5; j++) { if ((top >> j) & 1) chk ^= GEN[j]; } } return chk; }";
const newPoly = "function b32polymod(values) { var GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n]; var chk = 0n; for (var i = 0; i < values.length; i++) { var top = chk >> 35n; chk = ((chk & 0x07ffffffffn) << 5n) ^ BigInt(values[i]); for (var j = 0; j < 5; j++) { if ((top >> BigInt(j)) & 1n) chk ^= GEN[j]; } } return chk; }";
if (!s.includes(oldPoly)) { console.error('polymod anchor not found'); process.exit(1); }
s = s.split(oldPoly).join(newPoly);

const oldEnc = "function bech32Encode(hrp, bytes) { var data = b32convert(bytes); var mod = b32polymod(b32expand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0])) ^ 1; var all = data.slice(); for (var i = 0; i < 6; i++) all.push((mod >> (5 * (5 - i))) & 31); var s2 = ''; for (i = 0; i < all.length; i++) s2 += B32C[all[i]]; return hrp + ':' + s2; }";
const newEnc = "function bech32Encode(hrp, bytes) { var data = b32convert(bytes); var mod = b32polymod(b32expand(hrp).concat(data).concat([0, 0, 0, 0, 0, 0, 0, 0])) ^ 1n; var all = data.slice(); for (var i = 0; i < 8; i++) all.push(Number((mod >> BigInt(5 * (7 - i))) & 31n)); var s2 = ''; for (i = 0; i < all.length; i++) s2 += B32C[all[i]]; return hrp + ':' + s2; }";
if (!s.includes(oldEnc)) { console.error('encode anchor not found'); process.exit(1); }
s = s.split(oldEnc).join(newEnc);
fs.writeFileSync(p, s);
console.log('patched runtime: CashAddr-style 40-bit (8-char) checksum for Kaspa addresses');
