// Network-free self-test: `npm test`. No keys, no chain access.
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
const hex = (u) => Buffer.from(u).toString('hex');
const tryReq = (m) => { try { return require(m); } catch (e) { if (e.code === 'MODULE_NOT_FOUND') return null; throw e; } };

// --- Kaspa address codec ---
const B32 = require(path.join(root, 'lib', 'bech32-kaspa.js'));
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
const RB = require(path.join(root, 'web', 'blake2b.js'));
t('blake2b-256("") known vector', () => eq(hex(RB.blake2b(new Uint8Array(0), 32)), '0e5751c026e543b2e8ab2eb06099daa1d1e5df47778f7787faab45cdf12fe3a8'));
t('blake2b-256("abc") known vector', () => eq(hex(RB.blake2b(new TextEncoder().encode('abc'), 32)), 'bddd813c634239723171ef3fee98579b94964e3bb1cb3e427262c8c068d52319'));
t('blake2b: parity vs @noble/hashes (0..600 B)', () => {
  const n = tryReq('@noble/hashes/blake2b'); if (!n) return 'skip';
  for (let len = 0; len <= 600; len++) {
    const b = new Uint8Array(len); for (let i = 0; i < len; i++) b[i] = (i * 31 + len * 7) & 0xff;
    eq(hex(n.blake2b(b, { dkLen: 32 })), hex(RB.blake2b(b, 32)), 'len ' + len);
  }
});

// --- Reliks-VM determinism & anchors ---
const RVM = require(path.join(root, 'vm', 'rvm.js'));
const RvmAsm = require(path.join(root, 'web', 'rvm-asm.js'));
t('Reliks-VM: deterministic render across starter templates', () => {
  const src = fs.readFileSync(path.join(root, 'web', 'vm-templates', 'starter.txt'), 'utf8');
  const prog = RvmAsm.assemble(src);
  const hi1 = RVM.hostInputs(RB.blake2b, '1', new Uint8Array(32), 0);
  const hi2 = RVM.hostInputs(RB.blake2b, '2', new Uint8Array(32), 0);
  const s1a = RVM.render(prog, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
  const s1b = RVM.render(prog, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear);
  const s2 = RVM.render(prog, hi2.lanes, hi2.serial32, hi2.pat, hi2.wear);
  eq(s1a, s1b, 'render(1) not deterministic');
  if (s1a === s2) throw new Error('serials 1 and 2 rendered identically');
});

// --- Repo integrity ---
t('canonical contracts and args fixtures present in contracts/', () => {
  for (const f of ['SeriesFactory.sil', 'ReliksEdition.sil', 'OfferEscrow.sil', 'factory.json', 'edition.json', 'escrow.json', 'factory-args.json', 'edition-args.json', 'escrow-args.json']) {
    fs.accessSync(path.join(root, 'contracts', f));
  }
});
t('legacy v12, archive, and audit-test folders removed', () => {
  for (const d of ['archive', 'v13', 'audit-test', 'data/factory-abi-v12.json', 'data/edition-abi-v12.json']) {
    if (fs.existsSync(path.join(root, d))) throw new Error(d + ' still exists');
  }
});
t('canonical ABIs parse; state spans frozen (144/203/161)', () => {
  const span = (f) => { const a = JSON.parse(fs.readFileSync(path.join(root, 'contracts', f), 'utf8')); return a.contracts[Object.keys(a.contracts)[0]].compiled.state_span.len; };
  eq(span('factory.json'), 144); eq(span('edition.json'), 203); eq(span('escrow.json'), 161);
});

console.log('\n' + pass + ' passed, ' + fail + ' failed, ' + skip + ' skipped');
process.exit(fail ? 1 : 0);
