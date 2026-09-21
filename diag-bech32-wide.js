const V = require('./v8-lib.js');
const CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const expandStd = (hrp) => { const o = []; for (const c of hrp) o.push(c.charCodeAt(0) >> 5); o.push(0); for (const c of hrp) o.push(c.charCodeAt(0) & 31); return o; };
const expandSep = (hrp) => expandStd(hrp + ':');
const expandNone = () => [];
const conv = (b) => { let acc = 0, bits = 0, out = []; for (const x of b) { acc = (acc << 8) | x; bits += 8; while (bits >= 5) { bits -= 5; out.push((acc >> bits) & 31); } } if (bits > 0) out.push((acc << (5 - bits)) & 31); return out; };
const GENS = {
  cash: [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n],
  cashrev: [0x1e4f43e470n, 0xae2eabe2a8n, 0xf33e5fb3c4n, 0x79b76d99e2n, 0x98f2bc8e61n]
};
function poly(gen, vals, init) { let c = BigInt(init); for (const v of vals) { const top = c >> 35n; c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(v); for (let j = 0; j < 5; j++) if ((top >> BigInt(j)) & 1n) c ^= gen[j]; } return c; }
function attempt(hrp, bytes, repr, expMode, init, xor, order, genName) {
  const d = repr === 'g5' ? conv(bytes) : Array.from(bytes);
  const exp = expMode === 'std' ? expandStd(hrp) : expMode === 'sep' ? expandSep(hrp) : expandNone();
  const m = poly(GENS[genName], exp.concat(d).concat(new Array(8).fill(0)), init) ^ BigInt(xor);
  let s = hrp + ':';
  for (let i = 0; i < 8; i++) { const sh = order === 'msb' ? 5 * (7 - i) : 5 * i; s += CH[Number((m >> BigInt(sh)) & 31n)]; }
  return s;
}
const hrp = V.hrp || require('./network.js').hrp;
const pk = Array.from(Buffer.from(V.USER, 'hex'));
const bytes = [0].concat(pk);
const hits = [];
for (const repr of ['g5', 'raw'])
  for (const expMode of ['std', 'sep', 'none'])
    for (const init of [0, 1])
      for (const xor of [0, 1])
        for (const order of ['msb', 'lsb'])
          for (const genName of Object.keys(GENS)) {
            if (attempt(hrp, bytes, repr, expMode, init, xor, order, genName) === V.WALLET)
              hits.push({ repr, expMode, init, xor, order, genName });
          }
if (hits.length) console.log('MATCH:', JSON.stringify(hits));
else console.log('no match across 144 construction variants — need rusty-kaspa source');
