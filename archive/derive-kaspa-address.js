const { blake2b } = require('@noble/hashes/blake2b');
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0; const out = []; const maxv = (1 << to) - 1;
  for (const v of data) { acc = ((acc << from) | v) >>> 0; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & maxv); } }
  if (pad && bits > 0) out.push((acc << (to - bits)) & maxv);
  return out;
}
const pub = Buffer.from(process.argv[2], 'hex');
const known = process.argv[3];
const prefix = 'kaspa';
const payload = Buffer.concat([Buffer.from([0x00]), pub]);
const pGroups = convertBits(payload, 8, 5, true);
const cat = (a, b) => Buffer.concat([a, b]);
const P = Buffer.from(prefix);
const h32 = Buffer.from(blake2b(cat(P, payload), { dkLen: 32 }));
const h8 = Buffer.from(blake2b(cat(P, payload), { dkLen: 8 }));
const h32p = Buffer.from(blake2b(cat(P, Buffer.from(pGroups)), { dkLen: 32 }));
const variants = {
  'first8(conv(h32,8,5,false))': convertBits(h32, 8, 5, false).slice(0, 8),
  'first8(conv(h32,8,5,true))': convertBits(h32, 8, 5, true).slice(0, 8),
  'first8(conv(h8,8,5,false))': convertBits(h8, 8, 5, false).slice(0, 8),
  'first8(conv(h32(payload5bit)))': convertBits(h32p, 8, 5, false).slice(0, 8),
  'h32[..8] & 31': Array.from(h32.slice(0, 8)).map(b => b & 31),
  'last8(conv(h32,8,5,false))': convertBits(h32, 8, 5, false).slice(-8)
};
let winner = null;
for (const [name, chk] of Object.entries(variants)) {
  const addr = prefix + ':' + pGroups.concat(chk).map(g => CHARSET[g]).join('');
  const hit = addr === known;
  if (hit) winner = name;
  console.log((hit ? '✅ MATCH  ' : '   no     ') + name + '  body=' + (pGroups.length + chk.length));
}
console.log(winner ? 'WINNER: ' + winner : 'no variant matched — paste this output');
