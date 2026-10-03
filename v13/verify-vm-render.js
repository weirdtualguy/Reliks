// Verifies a Reliks-VM edition against the chain by COMMITMENT, then renders it with both interpreters.
//  1. lane script: rebuilt from the factory template + baked program + expected state; must equal the lane UTXO script on kascov
//  2. edition script: rebuilt from the edition template + ledger state (lineage, sales); must equal the edition UTXO script on kascov
//  3. the program is taken from the committed factory template (hash must equal on-chain program_hash), never from a side file
//  4. render with rvm.js and (if python3 exists) rvm.py and compare
// Note: public indexers do not expose input sigscripts of covenant transactions, so the bytes are proven by hash commitment,
// not fetched back. Usage (repo root): RELIKS_LEDGER=v13/ledger-vm-v13.json node v13/verify-vm-render.js [editionIndex]
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const V = require(path.resolve('reliks-lib.js'));
const R = require(path.resolve('v13/vm/rvm.js'));
const b2 = u => require(path.resolve('web/blake2b.js')).blake2b(u, 32);
const hx = u => Buffer.from(u).toString('hex'), B = Buffer;
const die = m => { console.error('FAIL: ' + m); process.exit(1); };
const LD = JSON.parse(fs.readFileSync(process.env.RELIKS_LEDGER || 'v13/ledger-vm-v13.json', 'utf8'));
const ed = LD.editions[Number(process.argv[2] || 0)];
if (!ed) die('edition not in ledger');
if (![1, 2].includes(Number(LD.series.engine_lang))) die('series engine_lang is ' + LD.series.engine_lang + ', not 1 or 2 (Reliks-VM)');
const F = V.parts(JSON.parse(fs.readFileSync(process.env.RELIKS_FACTORY_ABI || 'v13/out/factory-vm-v13.json', 'utf8')));
const Ed = V.parts(JSON.parse(fs.readFileSync('v13/out/v13.json', 'utf8')));

function findProgram(bytecode, wantHash) {     // scan the compiled template's pushes for the one that hashes to program_hash
  for (let i = 0; i < bytecode.length; i++) {
    const op = bytecode[i]; let n, s;
    if (op >= 1 && op <= 75) { n = op; s = i + 1; }
    else if (op === 0x4c && i + 1 < bytecode.length) { n = bytecode[i + 1]; s = i + 2; }
    else if (op === 0x4d && i + 2 < bytecode.length) { n = bytecode.readUInt16LE(i + 1); s = i + 3; }
    else continue;
    if (n > 100 && s + n <= bytecode.length && hx(b2(new Uint8Array(bytecode.subarray(s, s + n)))) === wantHash) return bytecode.subarray(s, s + n);
  }
  return null;
}
async function covUtxos(cov) { const r = await fetch(V.kascov + '/c/' + cov + '.json'); if (!r.ok) throw new Error('kascov ' + r.status + ' for covenant ' + cov.slice(0, 12)); return (await r.json()).utxos || []; }
const spkOf = (P, st) => V.p2sh(B.concat([P.prefix, V.encState(P, st), P.suffix]));

(async () => {
  const prog = findProgram(F.bc, LD.series.program_hash);
  if (!prog) die('no push in the factory template hashes to program_hash ' + LD.series.program_hash.slice(0, 16) + '...');
  console.log('program: ' + prog.length + ' B in the factory template, blake2b == program_hash ' + LD.series.program_hash.slice(0, 16) + '...');

  const laneSpk = spkOf(F, { ...LD.series, mints_left: LD.series.mints_left - LD.editions.length });
  const lane = (await covUtxos(LD.C)).find(u => u.script_hex === laneSpk);
  console.log(lane ? 'lane   : ON CHAIN ' + lane.outpoint.slice(0, 14) + ' (script commits to this exact program)' : 'lane   : NOT FOUND on kascov (lag, or template/state mismatch)');
  const edSt = { ownerIdentifier: ed.owner, identifierType: 0, price: Number(ed.price), artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: ed.lineage, sales: ed.sales };
  const edSpk = spkOf(Ed, edSt);
  const eu = (await covUtxos(ed.cov)).find(u => u.script_hex === edSpk);
  console.log(eu ? 'edition: ON CHAIN ' + eu.outpoint.slice(0, 14) + ' | sales ' + ed.sales + ' lineage ' + ed.lineage.slice(0, 16) : 'edition: NOT FOUND on kascov (lag, or ledger lineage/sales differ from chain)');
  if (!lane || !eu) die('chain commitment not confirmed; not rendering');

  const hi = R.hostInputs(b2, ed.serial, new Uint8Array(B.from(ed.lineage, 'hex')), ed.sales);
  const svg = R.render(new Uint8Array(prog), hi.lanes, hi.serial32, hi.pat, hi.wear);
  const jsHash = hx(b2(new Uint8Array(B.from(svg, 'ascii'))));
  console.log('JS  render: pat ' + hi.pat + ' wear ' + hi.wear + ' | svg ' + svg.length + ' B | hash ' + jsHash);
  fs.writeFileSync('v13/vm-render-' + ed.serial + '-s' + ed.sales + '.svg', svg);
  const py = "import sys;sys.path.insert(0,'v13/vm');import rvm;" +
    "prog=bytes.fromhex(sys.argv[1]);print(rvm.b2(rvm.render_edition(prog,int(sys.argv[2]),bytes.fromhex(sys.argv[3]),int(sys.argv[4])).encode('ascii')).hex())";
  const r = cp.spawnSync('python3', ['-c', py, hx(prog), String(ed.serial), ed.lineage, String(ed.sales)], { encoding: 'utf8' });
  if (r.error || r.status !== 0) console.log('PY  render: skipped (' + ((r.error && r.error.message) || (r.stderr || '').trim().split('\n').pop()) + ')');
  else { const ph = r.stdout.trim(); console.log('PY  render: hash ' + ph); console.log(ph === jsHash ? 'MATCH: JS and Python render the committed on-chain program identically' : 'MISMATCH between interpreters'); if (ph !== jsHash) process.exit(2); }
})().catch(e => die(e.message));
