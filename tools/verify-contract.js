'use strict';
// Canonical contract gate. Recompiles the three canonical contracts in
// contracts/ AND the audit-test evidence copies, and compares every compiled
// template hash (and every source sha256) to the pinned values in the root
// TEMPLATE-HASHES.json. Hard-fails (exit 1) on ANY mismatch, missing file,
// missing silverc, or missing pin file. Deploy scripts must call this first.
// Any change to a contract file needs a fresh audit.
const cp = require('child_process'), crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');

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
if (require.main !== module) return; // library use: exports only; the recompile gate below runs as a CLI

// --- Canonical hash gate ---
const ROOT = path.join(__dirname, '..');
const PINS_PATH = path.join(ROOT, 'TEMPLATE-HASHES.json');
let bad = 0;
const fail = (msg) => { console.log('FAIL ' + msg); bad = 1; };
const pass = (msg) => { console.log('PASS ' + msg); };

let pins;
try { pins = JSON.parse(fs.readFileSync(PINS_PATH, 'utf8')); }
catch (e) { fail('cannot read ' + PINS_PATH + ': ' + e.message); console.log('CONTRACT RECOMPILE FAILED'); process.exit(1); }
if (!pins.contracts || !pins.contracts.factory || !pins.contracts.edition || !pins.contracts.escrow) {
  fail('TEMPLATE-HASHES.json is missing a contract entry'); console.log('CONTRACT RECOMPILE FAILED'); process.exit(1);
}

const probe = cp.spawnSync('silverc', ['--help'], { encoding: 'utf8' });
let silverc = 'silverc';
if (probe.error) {
  // Fall back to ~/bin/silverc (the Termux install location) before failing.
  const homeBin = path.join(os.homedir(), 'bin', 'silverc');
  if (fs.existsSync(homeBin)) silverc = homeBin;
  else { fail('silverc not available — cannot verify contract hashes, refusing to proceed'); console.log('CONTRACT RECOMPILE FAILED'); process.exit(1); }
}

const CONTRACTS = [
  { key: 'factory', name: 'SeriesFactory', src: 'contracts/SeriesFactory.sil', evidence: 'audit-test/v13-fixed/SeriesFactory-v13-fixed.sil', abi: 'audit-test/v13-fixed/out/factory.json', contractsAbi: 'contracts/factory.json', args: 'audit-test/v13-fixed/factory-args.json' },
  { key: 'edition', name: 'ReliksEdition', src: 'contracts/ReliksEdition.sil', evidence: 'audit-test/v13-fixed/ReliksEdition-v13-fixed.sil', abi: 'audit-test/v13-fixed/out/edition.json', contractsAbi: 'contracts/edition.json', args: 'contracts/edition-args.json' },
  { key: 'escrow', name: 'OfferEscrow', src: 'contracts/OfferEscrow.sil', evidence: 'audit-test/v13-fixed/OfferEscrow-v6-fixed.sil', abi: 'audit-test/v13-fixed/out/escrow.json', contractsAbi: 'contracts/escrow.json', args: 'audit-test/v13-fixed/escrow-args-v6-fixed.json' },
];
const sha256 = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const templateHash = (abiJson) => {
  const j = JSON.parse(fs.readFileSync(abiJson, 'utf8'));
  const c = j.contracts[Object.keys(j.contracts)[0]];
  return Buffer.from(c.compiled.template_hash).toString('hex');
};

CONTRACTS.forEach((c, i) => {
  const pin = pins.contracts[c.key];
  const want = pin.template_hash;
  const srcPath = path.join(ROOT, c.src);
  const evPath = path.join(ROOT, c.evidence);
  const abiPath = path.join(ROOT, c.abi);
  const argsPath = path.join(ROOT, c.args);
  // 1. Source sha256 must match the pinned value.
  if (!fs.existsSync(srcPath)) { fail(c.key + ': missing ' + c.src); return; }
  const gotSha = sha256(srcPath);
  if (gotSha !== pin.sha256) fail(c.key + ': sha256 mismatch for ' + c.src + ' (got ' + gotSha.slice(0, 16) + '…, want ' + pin.sha256.slice(0, 16) + '…)');
  else pass(c.key + ': sha256 ' + c.src + ' == pinned');
  // 2. Compile the canonical source; the hash must match the pin.
  if (!fs.existsSync(argsPath)) { fail(c.key + ': missing compile args ' + c.args); return; }
  const out = path.join(os.tmpdir(), 'reliks-recompile-' + process.pid + '-' + i + '.json');
  const r = cp.spawnSync(silverc, [c.src, '--ctor', c.args, '-o', out], { encoding: 'utf8', cwd: ROOT });
  if (r.status !== 0 || !fs.existsSync(out)) {
    fail(c.key + ': silverc failed on ' + c.src + ': ' + String(r.stderr || r.stdout).split('\n')[0]); return;
  }
  const fresh = templateHash(out);
  if (fresh !== want) fail(c.key + ': ' + c.src + ' compiles to ' + fresh.slice(0, 16) + '…, want ' + want.slice(0, 16) + '…');
  else pass(c.key + ': ' + c.src + ' compiles to ' + want.slice(0, 16) + '…');
  try { fs.unlinkSync(out); } catch (e) {}
  // 3. The audit-test evidence copy must still compile to the same hash.
  if (!fs.existsSync(evPath)) { fail(c.key + ': missing evidence copy ' + c.evidence); return; }
  const out2 = path.join(os.tmpdir(), 'reliks-recompile-ev-' + process.pid + '-' + i + '.json');
  const r2 = cp.spawnSync(silverc, [c.evidence, '--ctor', c.args, '-o', out2], { encoding: 'utf8', cwd: ROOT });
  if (r2.status !== 0 || !fs.existsSync(out2)) {
    fail(c.key + ': silverc failed on evidence copy ' + c.evidence + ': ' + String(r2.stderr || r2.stdout).split('\n')[0]); return;
  }
  const freshEv = templateHash(out2);
  if (freshEv !== want) fail(c.key + ': evidence copy ' + c.evidence + ' compiles to ' + freshEv.slice(0, 16) + '…, want ' + want.slice(0, 16) + '…');
  else pass(c.key + ': evidence copy ' + c.evidence + ' compiles to ' + want.slice(0, 16) + '…');
  try { fs.unlinkSync(out2); } catch (e) {}
  // 4. The stored ABIs (audit-test evidence copy AND the contracts/ copy the
  // builders load) must carry the pinned hash.
  if (!fs.existsSync(abiPath)) { fail(c.key + ': missing ABI ' + c.abi); return; }
  const abiHash = templateHash(abiPath);
  if (abiHash !== want) fail(c.key + ': ABI ' + c.abi + ' has ' + abiHash.slice(0, 16) + '…, want ' + want.slice(0, 16) + '…');
  else pass(c.key + ': ABI ' + c.abi + ' == ' + want.slice(0, 16) + '…');
  const cAbiPath = path.join(ROOT, c.contractsAbi);
  if (!fs.existsSync(cAbiPath)) { fail(c.key + ': missing contracts ABI ' + c.contractsAbi); return; }
  const cAbiHash = templateHash(cAbiPath);
  if (cAbiHash !== want) fail(c.key + ': contracts ABI ' + c.contractsAbi + ' has ' + cAbiHash.slice(0, 16) + '…, want ' + want.slice(0, 16) + '…');
  else pass(c.key + ': contracts ABI ' + c.contractsAbi + ' == ' + want.slice(0, 16) + '…');
});

console.log(bad ? 'CONTRACT RECOMPILE FAILED' : 'CONTRACT RECOMPILE OK');
process.exit(bad);
