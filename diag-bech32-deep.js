const V = require('./v8-lib.js');
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const expand = (hrp) => { const o = []; for (const c of hrp) o.push(c.charCodeAt(0) >> 5); o.push(0); for (const c of hrp) o.push(c.charCodeAt(0) & 31); return o; };
const conv = (b) => { let acc = 0, bits = 0, out = []; for (const x of b) { acc = (acc << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); } } if (bits > 0) out.push((acc << (5 - bits)) & 31); return out; };
const poly64 = (v, init) => { const G = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n]; let c = BigInt(init); for (const x of v) { const top = c >> 35n; c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(x); for (let j = 0; j < 5; j++) { if ((top >> BigInt(j)) & 1n) c ^= G[j]; } } return c; };
function enc(hrp, data, init, xor, len) {
  const d = conv(data);
  const m = poly64(expand(hrp).concat(d).concat(new Array(len).fill(0)), init) ^ xor;
  const all = d.slice();
  for (let i = 0; i < len; i++) all.push(Number((m >> BigInt(5 * (len - 1 - i))) & 31n));
  return hrp + ':' + all.map(x => CH[x]).join('');
}
const hrp = V.hrp || require('./network.js').hrp;
const pk = Array.from(Buffer.from(V.USER, 'hex'));
let found = false;
for (let ver = 0; ver < 256; ver++) {
  for (const init of [0, 1]) {
    for (const xor of [0n, 1n]) {
      const res = enc(hrp, [ver].concat(pk), init, xor, 8);
      if (res === V.WALLET) {
        console.log('MATCH! version=' + ver + ' init=' + init + ' xor=' + xor + ' len=8');
        found = true;
      }
    }
  }
}
if (!found) console.log('No match found with standard CashAddr 40-bit polymod.');
