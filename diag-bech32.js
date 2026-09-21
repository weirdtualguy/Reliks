const V = require('./v8-lib.js');
const fs = require('fs');
const src = fs.readFileSync('web/reliks-gallery-runtime.js', 'utf8');
console.log('runtime contains CashAddr GEN constants:', src.includes('0x98f2bc8e61n'));
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const expand = (hrp) => { const o = []; for (const c of hrp) o.push(c.charCodeAt(0) >> 5); o.push(0); for (const c of hrp) o.push(c.charCodeAt(0) & 31); return o; };
const conv = (b) => { let acc = 0, bits = 0, out = []; for (const x of b) { acc = (acc << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); } } if (bits > 0) out.push((acc << (5 - bits)) & 31); return out; };
const poly32 = (v) => { const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]; let c = 1; for (const x of v) { const t = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let j = 0; j < 5; j++) if ((t >> j) & 1) c ^= G[j]; } return BigInt(c); };
const poly64 = (v) => { const G = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n]; let c = 0n; for (const x of v) { const t = c >> 35n; c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(x); for (let j = 0; j < 5; j++) if ((t >> BigInt(j)) & 1n) c ^= G[j]; } return c; };
function enc(hrp, data, poly, len, xor) {
  const d = conv(data);
  const m = poly(expand(hrp).concat(d).concat(new Array(len).fill(0))) ^ xor;
  const all = d.slice();
  for (let i = 0; i < len; i++) all.push(Number((m >> BigInt(5 * (len - 1 - i))) & 31n));
  return hrp + ':' + all.map(x => CH[x]).join('');
}
const pk = Array.from(Buffer.from(V.USER, 'hex'));
const cands = {
  'BIP173 poly32, 6 chars, ^1': enc(V.hrp || 'kaspatest', [0].concat(pk), poly32, 6, 1n),
  'CashAddr poly64, 8 chars, ^1': enc(V.hrp || 'kaspatest', [0].concat(pk), poly64, 8, 1n),
  'CashAddr poly64, 8 chars, ^0': enc(V.hrp || 'kaspatest', [0].concat(pk), poly64, 8, 0n),
  'poly32, 8 chars, ^1': enc(V.hrp || 'kaspatest', [0].concat(pk), poly32, 8, 1n)
};
console.log('expected:', V.WALLET);
for (const [k, v] of Object.entries(cands)) console.log((v === V.WALLET ? 'MATCH  ' : 'no     ') + k + ' -> ' + v);
