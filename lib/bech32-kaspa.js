// Kaspa bech32 address codec — Node/CLI counterpart to the browser
// implementation in web/reliks-gallery-runtime.js (kept byte-for-byte
// identical on purpose; see the self-test below).
//
// This replaces an earlier version of this file that "discovered" the
// correct encoding by brute-forcing ~150k parameter combinations against a
// single known address. That approach worked but nobody could say *why* it
// worked, which is a bad property for anything that derives where money
// goes. The scheme below is the actual algorithm (CashAddr-style 40-bit
// BCH checksum over the Bech32 charset — see rusty-kaspa's
// crypto/addresses/src/bech32.rs), implemented directly and verified
// against the same known-good vector.
'use strict';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const GENERATOR = [0x98f2bc8e61n, 0x79b76d99e2n, 0xf33e5fb3c4n, 0xae2eabe2a8n, 0x1e4f43e470n];
const MASK40 = 0x07ffffffffn;

function polymod(values) {
  let c = 1n;
  for (const v of values) {
    const top = c >> 35n;
    c = ((c & MASK40) << 5n) ^ BigInt(v);
    for (let i = 0; i < 5; i++) if ((top >> BigInt(i)) & 1n) c ^= GENERATOR[i];
  }
  return c;
}

function convertBits(data, fromBits, toBits, pad) {
  let acc = 0, bits = 0;
  const maxv = (1 << toBits) - 1;
  const out = [];
  for (const value of data) {
    if (value < 0 || value >> fromBits !== 0) throw new Error('invalid data for convertBits');
    acc = (acc << fromBits) | value;
    bits += fromBits;
    while (bits >= toBits) { bits -= toBits; out.push((acc >> bits) & maxv); }
  }
  if (pad) { if (bits > 0) out.push((acc << (toBits - bits)) & maxv); }
  else if (bits >= fromBits || ((acc << (toBits - bits)) & maxv)) throw new Error('invalid padding in convertBits');
  return out;
}

function prefixValues(prefix) {
  return [...prefix].map(c => c.charCodeAt(0) & 0x1f);
}

// 8 checksum symbols = 40 bits, computed the same way Bech32's 6-symbol/
// 30-bit checksum is, just with a wider generator polynomial (this is
// exactly CashAddr's scheme, reused by Kaspa with the Bech32 charset).
function checksum(prefix, payload5) {
  const values = [...prefixValues(prefix), 0, ...payload5, 0, 0, 0, 0, 0, 0, 0, 0];
  const mod = polymod(values) ^ 1n;
  const out = [];
  for (let i = 7; i >= 0; i--) out.push(Number((mod >> BigInt(5 * i)) & 0x1fn));
  return out;
}

/**
 * Encode a Kaspa address.
 * @param {string} prefix   'kaspa' or 'kaspatest'
 * @param {number} version  0 = P2PK (32-byte x-only schnorr pubkey), 8 = P2SH (32-byte script hash)
 * @param {Buffer|Uint8Array} payload  version-specific payload bytes
 */
function encode(prefix, version, payload) {
  const data8 = [version, ...payload];
  const data5 = convertBits(data8, 8, 5, true);
  const cksum = checksum(prefix, data5);
  return prefix + ':' + [...data5, ...cksum].map(d => CHARSET[d]).join('');
}

function encodeP2PK(prefix, pubkeyHex) {
  return encode(prefix, 0, Buffer.from(pubkeyHex, 'hex'));
}

function encodeP2SH(prefix, scriptHashHex) {
  return encode(prefix, 8, Buffer.from(scriptHashHex, 'hex'));
}

/** Decode + verify a Kaspa address. Throws on bad checksum/charset. */
function decode(address) {
  const sep = address.lastIndexOf(':');
  if (sep < 1) throw new Error('missing hrp separator');
  const prefix = address.slice(0, sep);
  const chars = address.slice(sep + 1);
  const values = [...chars].map(c => {
    const idx = CHARSET.indexOf(c);
    if (idx < 0) throw new Error('invalid character: ' + c);
    return idx;
  });
  if (values.length < 8) throw new Error('address too short');
  if (polymod([...prefixValues(prefix), 0, ...values]) !== 1n) throw new Error('invalid checksum');
  const data8 = convertBits(values.slice(0, -8), 5, 8, false);
  return { prefix, version: data8[0], payload: Buffer.from(data8.slice(1)) };
}

// Known-good vector (from the original hand-derived calibration; kept as a
// regression check rather than as the source of truth).
const SELF_TEST_PUBKEY = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const SELF_TEST_ADDR = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';

function selfTest() {
  const enc = encodeP2PK('kaspatest', SELF_TEST_PUBKEY);
  if (enc !== SELF_TEST_ADDR) throw new Error('self-test FAILED: ' + enc + ' != ' + SELF_TEST_ADDR);
  const dec = decode(SELF_TEST_ADDR);
  if (dec.prefix !== 'kaspatest' || dec.version !== 0 || dec.payload.toString('hex') !== SELF_TEST_PUBKEY) {
    throw new Error('self-test FAILED on decode');
  }
  return true;
}

module.exports = { encode, encodeP2PK, encodeP2SH, decode, selfTest };

if (require.main === module) {
  selfTest();
  console.log('self-test: OK (' + SELF_TEST_ADDR + ')');
}
