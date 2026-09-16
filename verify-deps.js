const results = [];
const ok = (name, pass, extra) => results.push((pass ? 'PASS' : 'FAIL') + '  ' + name + (extra ? '  —  ' + extra : ''));

try {
  const { blake2b } = require('@noble/hashes/blake2b');
  const h = Buffer.from(blake2b(Buffer.from('test'), { dkLen: 32 })).toString('hex');
  ok('@noble/hashes/blake2b', h.length === 64, h.slice(0, 16) + '...');
} catch (e) { ok('@noble/hashes/blake2b', false, e.message); }

try {
  const { blake3 } = require('@noble/hashes/blake3');
  const h = Buffer.from(blake3('test')).toString('hex');
  ok('@noble/hashes/blake3', h.length === 64, h.slice(0, 16) + '...');
} catch (e) { ok('@noble/hashes/blake3', false, e.message); }

try {
  const secp = require('@noble/secp256k1');
  const crypto = require('crypto');
  secp.utils.sha256Sync = (...m) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
  ok('secp.utils.sha256Sync assignable', typeof secp.utils.sha256Sync === 'function');
  const priv = 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
  const sig = secp.schnorr.signSync(Buffer.alloc(32, 7), priv);
  ok('secp.schnorr.signSync (v1 API, hex priv)', sig.length === 64, '64-byte sig');
} catch (e) { ok('@noble/secp256k1 schnorr', false, e.message); }

try { require('ws'); ok('ws', true); } catch (e) { ok('ws', false, e.message); }

console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(failed ? '\nWARNING: ' + failed + ' check(s) failed' : '\nALL DEPENDENCY CHECKS PASSED');
process.exit(failed ? 1 : 0);
