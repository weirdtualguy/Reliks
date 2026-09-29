/* Reliks BLAKE2b: zero-dependency, unkeyed or keyed, digest 1..64 bytes.
   Shared by the site, the Studio, the gallery and the Node tooling.
   Validated against Python hashlib and @noble/hashes in `npm test`.
   API: blake2b(bytes, dkLen = 32, keyBytes?) -> Uint8Array */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReliksBlake2b = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var M64 = (1n << 64n) - 1n;
  var IV = [0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
            0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n];
  var SIGMA = [
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],
    [11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4], [7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8],
    [9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13], [2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9],
    [12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11], [13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10],
    [6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5], [10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0],
    [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], [14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3]];
  function rotr(x, n) { return ((x >> n) | (x << (64n - n))) & M64; }
  function G(v, a, b, c, d, x, y) {
    v[a] = (v[a] + v[b] + x) & M64; v[d] = rotr(v[d] ^ v[a], 32n);
    v[c] = (v[c] + v[d]) & M64;     v[b] = rotr(v[b] ^ v[c], 24n);
    v[a] = (v[a] + v[b] + y) & M64; v[d] = rotr(v[d] ^ v[a], 16n);
    v[c] = (v[c] + v[d]) & M64;     v[b] = rotr(v[b] ^ v[c], 63n);
  }
  function compress(h, blk, off, t, last) {
    var m = new Array(16), i, j;
    for (i = 0; i < 16; i++) {
      var w = 0n;
      for (j = 7; j >= 0; j--) w = (w << 8n) | BigInt(blk[off + i * 8 + j]);
      m[i] = w;
    }
    var v = h.slice(); for (i = 0; i < 8; i++) v.push(IV[i]);
    v[12] ^= t & M64; v[13] ^= (t >> 64n) & M64;
    if (last) v[14] ^= M64;
    for (i = 0; i < 12; i++) {
      var s = SIGMA[i];
      G(v, 0, 4, 8, 12, m[s[0]], m[s[1]]);  G(v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
      G(v, 2, 6, 10, 14, m[s[4]], m[s[5]]); G(v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
      G(v, 0, 5, 10, 15, m[s[8]], m[s[9]]); G(v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
      G(v, 2, 7, 8, 13, m[s[12]], m[s[13]]); G(v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for (i = 0; i < 8; i++) h[i] = h[i] ^ v[i] ^ v[i + 8];
  }
  function blake2b(input, dkLen, key) {
    dkLen = dkLen || 32;
    if (dkLen < 1 || dkLen > 64) throw new Error('blake2b: bad digest length');
    key = key || new Uint8Array(0);
    if (key.length > 64) throw new Error('blake2b: key too long');
    var data;
    if (key.length) {
      data = new Uint8Array(128 + input.length);
      data.set(key, 0); data.set(input, 128);
    } else data = input;
    var h = IV.slice();
    h[0] ^= 0x01010000n ^ (BigInt(key.length) << 8n) ^ BigInt(dkLen);
    var t = 0n, off = 0;
    while (data.length - off > 128) { t += 128n; compress(h, data, off, t, false); off += 128; }
    var lastBlk = new Uint8Array(128), rem = data.length - off;
    lastBlk.set(data.subarray(off, off + rem));
    t += BigInt(rem);
    compress(h, lastBlk, 0, t, true);
    var out = new Uint8Array(64);
    for (var i = 0; i < 8; i++) { var x = h[i]; for (var j = 0; j < 8; j++) { out[i * 8 + j] = Number(x & 0xffn); x >>= 8n; } }
    return out.slice(0, dkLen);
  }
  return { blake2b: blake2b };
});
