'use strict';
// Recompiles contract sources (v12 and v13) and compares to the ABIs the tools use. Skips if silverc is missing.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');

// --- Genesis validation (audit fix, 2026-11-14) ---
// The factory script cannot validate its own constructor at genesis, so the
// deploy tooling must. Usage: node tools/verify-contract.js --validate <series.json|factory-args.json>
// series.json: { artist, price, royalty_bips, mints_left, next_serial? }
// factory-args.json: the 12-arg constructor array (arg 0 program_hash, 1 artist,
//   2 price, 3 royalty_bips, 4 mints_left, 5 engine_code, 11 next_serial).
const SECP_P = (1n << 256n) - (1n << 32n) - 977n;
function isValidXOnly(hex) {
  if (typeof hex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(hex)) return false;
  const x = BigInt('0x' + hex);
  if (x <= 0n || x >= SECP_P) return false;
  // y^2 = x^3 + 7 must have a solution: Legendre symbol (x^3+7|p) == 1
  const v = (x * x * x + 7n) % SECP_P;
  let r = 1n, b = v, e = (SECP_P - 1n) / 2n;
  while (e > 0n) { if (e & 1n) r = (r * b) % SECP_P; b = (b * b) % SECP_P; e >>= 1n; }
  return r === 1n;
}
function validateSeriesConfig(cfg) {
  const errs = [];
  if (!isValidXOnly(cfg.artist)) errs.push('artist is not a valid secp256k1 x-only pubkey (64 hex, must be a curve x-coordinate)');
  if (!Number.isSafeInteger(cfg.royalty_bips) || cfg.royalty_bips < 500 || cfg.royalty_bips > 2000) errs.push('royalty_bips must be an integer in [500, 2000] (got ' + cfg.royalty_bips + ')');
  if (!Number.isSafeInteger(cfg.mints_left) || cfg.mints_left <= 0) errs.push('mints_left must be an integer > 0 (got ' + cfg.mints_left + ')');
  if (cfg.next_serial !== undefined && (!Number.isSafeInteger(cfg.next_serial) || cfg.next_serial < 0 || cfg.next_serial >= 2 ** 40)) errs.push('next_serial must be an integer in [0, 2^40) (got ' + cfg.next_serial + ') — a value near 2^63 would overflow at next_serial + 1');
  return errs;
}
function validateFactoryArgs(args) {
  const errs = [];
  const hx = (a) => Buffer.from((a && a.value) || []).toString('hex');
  const iv = (a) => (a && a.value);
  if (!Array.isArray(args) || args.length < 12) errs.push('factory args must be the 12-arg constructor array (got ' + (Array.isArray(args) ? args.length : typeof args) + ' args)');
  else {
    if (!isValidXOnly(hx(args[1]))) errs.push('arg[1] artist is not a valid secp256k1 x-only pubkey');
    if (!Number.isSafeInteger(iv(args[3])) || iv(args[3]) < 500 || iv(args[3]) > 2000) errs.push('arg[3] royalty_bips must be in [500, 2000] (got ' + iv(args[3]) + ')');
    if (!Number.isSafeInteger(iv(args[4])) || iv(args[4]) <= 0) errs.push('arg[4] mints_left must be > 0 (got ' + iv(args[4]) + ')');
    if (!Number.isSafeInteger(iv(args[11])) || iv(args[11]) < 0 || iv(args[11]) >= 2 ** 40) errs.push('arg[11] next_serial must be in [0, 2^40) (got ' + iv(args[11]) + ') — a value near 2^63 would overflow at next_serial + 1');
    try {
      const { blake2b } = require('@noble/hashes/blake2b');
      const eng = Buffer.from((args[5] && args[5].value) || []);
      const want = Buffer.from(blake2b(eng, { dkLen: 32 })).toString('hex');
      if (hx(args[0]) !== want) errs.push('arg[0] program_hash != blake2b(arg[5] engine_code)');
    } catch (e) { errs.push('could not verify program_hash (blake2b unavailable): ' + e.message); }
  }
  return errs;
}
if (process.argv[2] === '--validate' && process.argv[3]) {
  const doc = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  const errs = Array.isArray(doc) ? validateFactoryArgs(doc) : validateSeriesConfig(doc);
  if (errs.length) { errs.forEach(e => console.log('FAIL genesis validation: ' + e)); process.exit(1); }
  console.log('GENESIS VALIDATION OK: ' + process.argv[3]);
  process.exit(0);
}
module.exports = { isValidXOnly, validateSeriesConfig, validateFactoryArgs };
if (require.main !== module) return; // library use: exports only; the recompile flow below runs as a CLI

const probe = cp.spawnSync('silverc', ['--help'], { encoding: 'utf8' });
if (probe.error) { console.log('SKIP silverc not available'); process.exit(0); }

const load = (f) => { const a = JSON.parse(fs.readFileSync(f, 'utf8')); return a.contracts ? a.contracts[Object.keys(a.contracts)[0]] : a; };
const key = (c) => JSON.stringify([c.compiled.bytecode, c.compiled.template_hash, c.compiled.state_span]);

// Reconstruct exact constructor args for data/factory-abi-v12.json from its embedded initial state + mainnet engine + v12 edition ABI.
const v12FactoryArgsPath = path.join(os.tmpdir(), 'reliks-v12-factory-args-' + process.pid + '.json');
try {
  const fc = load('data/factory-abi-v12.json').compiled;
  const CH = require('../web/reliks-chain.js');
  CH.init(require('../lib/reliks-templates.js')());
  const st = CH.decodeFactoryState(Buffer.from(fc.bytecode).toString('hex'));
  const E = require('../lib/reliks-engine-mainnet.js');
  const ec = load('data/edition-abi-v12.json').compiled;
  const ebc = Buffer.from(ec.bytecode);
  const prefix = ebc.subarray(0, ec.state_span.offset), suffix = ebc.subarray(ec.state_span.offset + ec.state_span.len);
  const bytes = b => ({ kind: 'bytes', value: Array.from(b) }), int = n => ({ kind: 'int', value: Number(n) });
  fs.writeFileSync(v12FactoryArgsPath, JSON.stringify([
    bytes(Buffer.from(st.program_hash, 'hex')), bytes(Buffer.from(st.artist, 'hex')), int(st.price), int(st.royalty_bips), int(st.mints_left),
    bytes(Buffer.from(E.ENGINE_SRC, 'utf8')), int(st.engine_lang), bytes(Buffer.from(st.render_hash, 'hex')), bytes(prefix), bytes(suffix), bytes(Buffer.from(ec.template_hash))
  ]));
} catch (e) {}

const PAIRS = [
  { name: 'v12 edition', src: 'sil/ReliksEdition-v12.sil', args: 'data/edition-args.json', abis: ['data/edition-abi-v12.json'], gate: true },
  { name: 'v12 escrow', src: 'sil/OfferEscrow-v5.sil', args: 'data/escrow-args.json', abis: ['data/escrow-abi-v5.json'], gate: true },
  { name: 'v12 factory', src: 'sil/SeriesFactory-v12.sil', args: v12FactoryArgsPath, abis: ['data/factory-abi-v12.json'], gate: true },
  { name: 'edition', src: 'v13/ReliksEdition-v13.sil', args: 'v13/edition-args-v13.json', abis: ['data/edition-abi-v13.json', 'v13/out/v13.json'], gate: true },
  { name: 'factory vm', src: 'v13/SeriesFactory-v13.sil', args: 'v13/factory-args-vm-v13.json', abis: ['v13/out/factory-vm-v13.json'], gate: true },
  { name: 'factory marks3', src: 'v13/SeriesFactory-v13.sil', args: 'v13/factory-args-marks3-v13.json', abis: ['v13/out/factory-marks3-v13.json'], gate: true },
  { name: 'escrow', src: 'v13/OfferEscrow-v6.sil', args: 'v13/escrow-args-v6.json', abis: ['v13/out/escrow-v6.json'], gate: true },
  { name: 'edition fixed', src: 'audit-test/v13-fixed/ReliksEdition-v13-fixed.sil', args: 'v13/edition-args-v13.json', abis: ['audit-test/v13-fixed/out/edition.json'], gate: true },
  { name: 'escrow fixed', src: 'audit-test/v13-fixed/OfferEscrow-v6-fixed.sil', args: 'audit-test/v13-fixed/escrow-args-v6-fixed.json', abis: ['audit-test/v13-fixed/out/escrow.json'], gate: true },
  { name: 'factory fixed', src: 'audit-test/v13-fixed/SeriesFactory-v13-fixed.sil', args: 'audit-test/v13-fixed/factory-args.json', abis: ['audit-test/v13-fixed/out/factory.json'], gate: true },
];

let bad = 0;
PAIRS.forEach((p, i) => {
  if (![p.src, p.args].concat(p.abis).every((f) => fs.existsSync(f))) { console.log('INFO ' + p.name + ': input files missing, skipped'); return; }
  const out = path.join(os.tmpdir(), 'reliks-recompile-' + process.pid + '-' + i + '.json');
  const r = cp.spawnSync('silverc', [p.src, '--ctor', p.args, '-o', out], { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(out)) { const m = String(r.stderr || r.stdout).split('\n')[0]; console.log((p.gate ? 'FAIL ' : 'INFO ') + p.name + ': silverc failed: ' + m); if (p.gate) bad = 1; return; }
  const fresh = key(load(out));
  p.abis.forEach((f) => { const ok = key(load(f)) === fresh; if (!ok && p.gate) bad = 1; console.log((ok ? 'PASS ' : p.gate ? 'FAIL ' : 'INFO ') + p.name + ': ' + f + (ok ? ' == recompiled ' : ' differs from recompiled ') + p.src); });
  try { fs.unlinkSync(out); } catch (e) {}
});
try { fs.unlinkSync(v12FactoryArgsPath); } catch (e) {}
console.log(bad ? 'CONTRACT RECOMPILE FAILED' : 'CONTRACT RECOMPILE OK'); process.exit(bad);
