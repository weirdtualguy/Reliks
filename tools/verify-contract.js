'use strict';
// Recompiles contract sources and compares to the ABIs the tools use. The edition pair gates; factory pairs are informational. Skips if silverc is missing.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
const PAIRS = [
  { name: 'edition', src: 'v13/ReliksEdition-v13-draft.sil', args: 'v13/edition-args-v13.json', abis: ['data/edition-abi-v13.json', 'v13/out/v13.json'], gate: true },
  { name: 'factory vm', src: 'v13/SeriesFactory-v13-draft.sil', args: 'v13/factory-args-vm-v13.json', abis: ['v13/out/factory-vm-v13.json'], gate: true },
  { name: 'factory marks3', src: 'v13/SeriesFactory-v13-draft.sil', args: 'v13/factory-args-marks3-v13.json', abis: ['v13/out/factory-marks3-v13.json'], gate: true },
  { name: 'escrow', src: 'v13/OfferEscrow-v6-draft.sil', args: 'v13/escrow-args-v6.json', abis: ['v13/out/escrow-v6.json'], gate: false },
];
const probe = cp.spawnSync('silverc', ['--help'], { encoding: 'utf8' });
if (probe.error) { console.log('SKIP silverc not available'); process.exit(0); }
const load = (f) => { const a = JSON.parse(fs.readFileSync(f, 'utf8')); return a.contracts ? a.contracts[Object.keys(a.contracts)[0]] : a; };
const key = (c) => JSON.stringify([c.compiled.bytecode, c.compiled.template_hash, c.compiled.state_span]);
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
console.log(bad ? 'CONTRACT RECOMPILE FAILED' : 'CONTRACT RECOMPILE OK'); process.exit(bad);
