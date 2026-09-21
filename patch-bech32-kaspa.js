const fs = require('fs');
const p = 'web/reliks-gallery-runtime.js';
let s = fs.readFileSync(p, 'utf8');

const startMarker = '/* ---- bech32 (Kaspa addresses) for UTXO-set anchoring ---- */';
const endMarker = 'function p2shAddress(spkHex)';

const startIdx = s.indexOf(startMarker);
const endIdx = s.indexOf(endMarker);

if (startIdx === -1 || endIdx === -1) {
  console.error('bech32 block not found');
  process.exit(1);
}

const newBech32 = `/* ---- bech32 (Kaspa addresses) for UTXO-set anchoring ---- */
  var B32C = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  function expandKaspaPrefix(hrp) {
    var out = [];
    for (var i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 0x1f);
    return out;
  }
  function conv8to5(b) {
    var out = [];
    var acc = 0, bits = 0;
    for (var i = 0; i < b.length; i++) {
      acc = (acc << 8) | b[i];
      bits += 8;
      while (bits >= 5) {
        bits -= 5;
        out.push((acc >> bits) & 31);
        acc &= (1 << bits) - 1;
      }
    }
    if (bits > 0) out.push((acc << (5 - bits)) & 31);
    return out;
  }
  function kaspaPolymod(values) {
    var GEN = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
    var c = 1n;
    for (var i = 0; i < values.length; i++) {
      var c0 = c >> 35n;
      c = ((c & 0x07ffffffffn) << 5n) ^ BigInt(values[i]);
      if (c0 & 0x01n) c ^= GEN[0];
      if (c0 & 0x02n) c ^= GEN[1];
      if (c0 & 0x04n) c ^= GEN[2];
      if (c0 & 0x08n) c ^= GEN[3];
      if (c0 & 0x10n) c ^= GEN[4];
    }
    return c ^ 1n;
  }
  function bech32Encode(hrp, rawBytes) {
    var fivebit_payload = conv8to5(rawBytes);
    var fivebit_prefix = expandKaspaPrefix(hrp);
    var mod_input = fivebit_prefix.concat([0]).concat(fivebit_payload).concat([0, 0, 0, 0, 0, 0, 0, 0]);
    var checksum = kaspaPolymod(mod_input);
    var checksum_bytes = [];
    for (var i = 0; i < 5; i++) checksum_bytes.push(Number((checksum >> BigInt((4 - i) * 8)) & 0xffn));
    var fivebit_checksum = conv8to5(checksum_bytes);
    var all = fivebit_payload.concat(fivebit_checksum);
    var s2 = '';
    for (var i = 0; i < all.length; i++) s2 += B32C[all[i]];
    return hrp + ':' + s2;
  }
  function p2pkAddress(spkHex) { var b = hexToBytes(spkHex); return bech32Encode(REG.hrp, [0].concat(Array.prototype.slice.call(b.subarray(1, 33)))); }
  `;

s = s.slice(0, startIdx) + newBech32 + s.slice(endIdx);
fs.writeFileSync(p, s);
console.log('patched runtime: exact Kaspa bech32 algorithm (prefix & 0x1f, 5-bit payload, 8-byte checksum)');
