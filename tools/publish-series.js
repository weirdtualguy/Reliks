#!/usr/bin/env node
// Dry-run packager for a Reliks-VM series (testnet). Never signs, never broadcasts, never reads keys.
// node tools/publish-series.js <program.hex|program.txt> <series.json> [outdir]
// series.json: { "artist": "<64-hex x-only pubkey>", "price": 100000000, "royalty_bips": 500, "mints_left": 8 }
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.join(__dirname, '..');
const die = m => { console.error('FATAL: ' + m); process.exit(1); };
const [,, progArg, cfgArg, outArg] = process.argv;
if (!progArg || !cfgArg) die('usage: node tools/publish-series.js <program.hex|program.txt> <series.json> [outdir]');
const progPath = path.resolve(progArg), cfgPath = path.resolve(cfgArg);
const A = require('../web/rvm-asm.js'), R = require('../v13/vm/rvm.js'), b2 = u => require('../web/blake2b.js').blake2b(u, 32);
const hx = u => Buffer.from(u).toString('hex');
const raw = fs.readFileSync(progPath, 'utf8');
let prog;
try { prog = (/^\s*[0-9a-fA-F]+\s*$/.test(raw) && raw.trim().length % 2 === 0) ? Uint8Array.from(Buffer.from(raw.trim(), 'hex')) : A.assemble(raw); }
catch (e) { die('assemble error: ' + e.message); }
const CAP = Number(process.env.RELIKS_ENGINE_CAP || 25641);
if (prog.length > CAP) die('program is ' + prog.length + ' B, over cap ' + CAP + ' B');
const progHash = hx(b2(prog));

// 1. render checks on the real interpreter
let n = 0, big = 0;
const lin = i => b2(Uint8Array.of(i));
for (let l = 0; l < 16; l++) for (const s of ['1', '2884738305227171331', '4294967296', '9223372036854775807']) for (const w of [0, 50, 255]) {
  const hi = R.hostInputs(b2, s, lin(l), w);
  let a;
  try { a = R.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear); } catch (e) { die('render fault ' + (e.code || e.message) + ' (lineage ' + l + ', serial ' + s + ', wear ' + w + ')'); }
  if (l < 2 && a !== R.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear)) die('non-deterministic render');
  if (a.indexOf('<svg') !== 0 || !/<\/svg>$/.test(a)) die('bad svg');
  big = Math.max(big, a.length); n++;
}

// 2. package, constructor args, compile
const base = path.basename(cfgPath).replace(/\.json$/, '');
const out = path.resolve(outArg || path.join(os.homedir(), 'reliks-series', base + '-' + progHash.slice(0, 8)));
fs.mkdirSync(out, { recursive: true });
const f = n_ => path.join(out, n_);
fs.writeFileSync(f('program.hex'), hx(prog) + '\n');
fs.copyFileSync(cfgPath, f('series.json'));
try {
  cp.execFileSync('node', ['v13/gen-vm-factory-args.js', f('series.json'), f('factory-args.json')], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, PROG_HEX_FILE: f('program.hex'), SHIM_OUT: f('engine-shim.js') } });
} catch (e) { die('gen-vm-factory-args failed: ' + String(e.stderr || e.message).trim()); }
const silverc = process.env.SILVERC || path.join(os.homedir(), 'bin', 'silverc');
const r = cp.spawnSync(silverc, ['v13/SeriesFactory-v13-draft.sil', '--ctor', f('factory-args.json'), '-o', f('factory.json')], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
if (r.status !== 0) die('silverc failed: ' + (r.stderr || r.stdout || '').trim());

// 3. assertions on the compiled factory
const abi = JSON.parse(fs.readFileSync(f('factory.json'), 'utf8'));
const bc = Buffer.from(abi.contracts[Object.keys(abi.contracts)[0]].compiled.bytecode);
const pb = Buffer.from(prog); let copies = 0, i = -1;
while ((i = bc.indexOf(pb, i + 1)) >= 0) copies++;
if (copies < 1) die('BAKE ASSERTION FAILED: compiled factory does not embed the program');
if (bc.length > 65535) die('factory bytecode ' + bc.length + ' B exceeds the 65,535 B push ceiling');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
fs.writeFileSync(f('package.json'), JSON.stringify({ program_bytes: prog.length, program_hash: progHash, renders_checked: n, max_svg_bytes: big, factory_bytes: bc.length, program_copies: copies, series: cfg, engine_lang: Number(process.env.ENGINE_LANG || 2), made: new Date().toISOString() }, null, 2) + '\n');

console.log('program    ' + prog.length + ' B | hash ' + progHash.slice(0, 16) + '...');
console.log('renders    ' + n + ' ok, deterministic | largest svg ' + big + ' B (limit 1048576)');
console.log('factory    ' + bc.length + ' B (limit 65535) | program copies baked: ' + copies);
console.log('package    ' + out);
console.log('\nNEXT (testnet only; not run by this tool). Deploy spends 1 KAS into the lane carrier plus the network fee from one wallet UTXO; change returns to the wallet:\n');
console.log('cd ' + ROOT);
console.log('read -rs -p "PC_PRIV: " PC_PRIV; export PC_PRIV; export PC_WALLET=<your testnet address>');
console.log('PC_NET=testnet RELIKS_ENGINE=' + f('engine-shim.js') + ' RELIKS_FACTORY_ABI=' + f('factory.json') + ' RELIKS_ARGS=' + f('factory-args.json') + ' RELIKS_LEDGER=' + f('ledger.json') + ' node v13/deploy-v13.js; unset PC_PRIV');
console.log('\nBack up first: nothing to back up for a new series. Afterwards, dry-run mint:\nPC_NET=testnet PC_WALLET=<your testnet address> node sdk/mint.js ' + f('ledger.json') + ' ' + f('factory.json'));
