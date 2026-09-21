const V = require('./v7-lib.js');
const { B, H, le32, blake2b } = V;
// ReliksSerialV8 mirror of SeriesFactory-v8.serialFromOutpoint.
// LE63 polynomial: sum_{i=0..6} h[i]*256^i + (h[7] mod 128)*2^56.
// Coefficients are literals on purpose: they must match the covenant exactly.
const serialOf = (txId, idx) => {
  const h = blake2b(B.concat([B.from('ReliksSerialV8', 'utf8'), H(txId), le32(idx)]), { dkLen: 32 });
  let s = 0n;
  s += BigInt(h[0]);
  s += BigInt(h[1]) * 256n;
  s += BigInt(h[2]) * 65536n;
  s += BigInt(h[3]) * 16777216n;
  s += BigInt(h[4]) * 4294967296n;
  s += BigInt(h[5]) * 1099511627776n;
  s += BigInt(h[6]) * 281474976710656n;
  s += BigInt(h[7] % 128) * 72057594037927936n;
  if (s >= 9223372036854775807n) throw new Error('serial out of int64 range: mirror/covenant drift');
  return s.toString();
};
module.exports = { ...V, serialOf };
