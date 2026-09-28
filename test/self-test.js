// Network-free self-test: `npm test`. No keys, no chain access.
// Core checks need zero packages; parity checks run when deps are installed.
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
let pass = 0, fail = 0, skip = 0;
const t = (name, fn) => {
  try { const r = fn(); if (r === 'skip') { skip++; console.log('SKIP ' + name); } else { pass++; console.log('PASS ' + name); } }
  catch (e) { fail++; console.log('FAIL ' + name + ' — ' + e.message); }
};
const eq = (a, b, m) => { if (a !== b) throw new Error((m || 'mismatch') + ': ' + a + ' != ' + b); };
const hex = u => Buffer.from(u).toString('hex');
const tryReq = p => { try { return require(p); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') return null; throw e; } };

// --- Kaspa address codec ---
const B32 = require(path.join(root, 'bech32-kaspa.js'));
t('bech32: known P2PK vector', () => B32.selfTest());
t('bech32: roundtrip P2SH (version 8)', () => {
  const h = '11'.repeat(32), a = B32.encodeP2SH('kaspa', h), d = B32.decode(a);
  eq(d.version, 8); eq(d.payload.toString('hex'), h); eq(d.prefix, 'kaspa');
});
t('bech32: checksum corruption rejected', () => {
  const a = B32.encodeP2PK('kaspa', '22'.repeat(32));
  const bad = a.slice(0, -1) + (a.slice(-1) === 'q' ? 'p' : 'q');
  let threw = false; try { B32.decode(bad); } catch (e) { threw = true; }
  if (!threw) throw new Error('corrupted address accepted');
});

// --- Browser BLAKE2b (zero-dep, shipped in the gallery) ---
const RB = require(path.join(root, 'web', 'gallery-blake2b.js'));
t('blake2b-256("") known vector', () => eq(hex(RB.blake2b(new Uint8Array(0), 32)), '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8'));
t('blake2b-256("abc") known vector', () => eq(hex(RB.blake2b(new TextEncoder().encode('abc'), 32)), 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319'));
t('blake2b: parity vs @noble/hashes (0..600 B)', () => {
  const n = tryReq('@noble/hashes/blake2b'); if (!n) return 'skip';
  for (let len = 0; len <= 600; len++) {
    const b = new Uint8Array(len); for (let i = 0; i < len; i++) b[i] = (i * 31 + len * 7) & 0xff;
    eq(hex(n.blake2b(b, { dkLen: 32 })), hex(RB.blake2b(b, 32)), 'len ' + len);
  }
});

// --- Engines: determinism + anchors ---
for (const f of ['reliks-engine-mainnet.js', 'reliks-engine-v10.js']) {
  t('engine ' + f + ': deterministic + hashes self-consistent', () => {
    let E; try { E = require(path.join(root, f)); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') return 'skip'; throw e; }
    eq(E.render(42), E.render(42), 'render(42) not deterministic');
    if (E.render(1) === E.render(2)) throw new Error('serials 1 and 2 render identically');
    eq(E.render(2 ** 32 + 5), E.render(5), 'seed must be serial mod 2^32');
    if (/Math\.random|Date|fetch|eval/.test(E.ENGINE_SRC)) throw new Error('banned construct in engine');
  });
}

// --- Repo integrity ---
t('canonical contracts present', () => { for (const f of ['SeriesFactory-v12.sil', 'ReliksEdition-v12.sil', 'OfferEscrow-v5.sil']) fs.accessSync(path.join(root, 'sil', f)); });
t('canonical ABIs parse; state spans frozen (135/161/161)', () => {
  const span = f => { const a = JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8')); return a.contracts[Object.keys(a.contracts)[0]].compiled.state_span.len; };
  eq(span('factory-abi-v12.json'), 135); eq(span('edition-abi-v12.json'), 161); eq(span('escrow-abi-v5.json'), 161);
});
t('no default path points at superseded versions', () => {
  const bad = /factory-(ledger|args|abi)-v1[01]\.json|edition-abi-v6\.json|escrow-abi-v4|reliks-engine-v10\.js['"]\s*\)/;
  for (const f of ['deploy-v12.js', 'mint-v12.js', 'secondary-v12.js', 'offer-v5.js', 'accept-v5.js', 'verify-render.js', 'gen-gallery.js', 'gen-site.js']) {
    const m = fs.readFileSync(path.join(root, f), 'utf8').match(bad);
    if (m) throw new Error(f + ' references ' + m[0]);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + skip + ' skipped');
process.exit(fail ? 1 : 0);
