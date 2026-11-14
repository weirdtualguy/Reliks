'use strict';
// Recompiles contract sources (v12 and v13) and compares to the ABIs the tools use. Skips if silverc is missing.
const cp = require('child_process'), fs = require('fs'), os = require('os'), path = require('path');
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
