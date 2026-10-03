'use strict';
const fs = require('fs'), path = require('path');
const sdk = require('./read.js');
const ledgerPath = process.argv[2] || 'v13/ledger-vm-v13.json';
const LD = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
const S = LD.series, EDS = LD.editions;
if (!S || !Array.isArray(EDS)) { console.log('FAIL ledger shape; keys: ' + Object.keys(LD).join(',')); process.exit(2); }
let bad = 0;
const rep = (label, r) => { if (!r.ok) bad = 1; console.log((r.ok ? 'PASS ' : 'FAIL ') + label + ' [' + r.checks.map((c) => c.name + (c.ok ? ':ok' : ':' + c.detail)).join(' ') + ']'); };
const want = String(S.program_hash).toLowerCase();
function scanPushes(bc) {
  for (let i = 0; i < bc.length; i++) {
    const op = bc[i]; let n, s;
    if (op >= 1 && op <= 75) { n = op; s = i + 1; }
    else if (op === 0x4c && i + 1 < bc.length) { n = bc[i + 1]; s = i + 2; }
    else if (op === 0x4d && i + 2 < bc.length) { n = bc.readUInt16LE(i + 1); s = i + 3; }
    else continue;
    if (n > 100 && s + n <= bc.length) {
      const b = new Uint8Array(bc.subarray(s, s + n));
      if (sdk.programHash(b) === want) return b;
    }
  }
  return null;
}
function findProgram() {
  if (fs.existsSync('v13/out')) {
    for (const f of fs.readdirSync('v13/out').filter((n) => /^factory-.*\.json$/.test(n))) {
      try {
        const abi = JSON.parse(fs.readFileSync('v13/out/' + f, 'utf8'));
        const c = abi.contracts[Object.keys(abi.contracts)[0]];
        const b = scanPushes(Buffer.from(c.compiled.bytecode));
        if (b) return { f: 'v13/out/' + f + ' (template pushes)', b };
      } catch (e) { /* skip */ }
    }
  }
  for (const dir of ['v13', 'v13/archive']) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.hex'))) {
      try {
        const b = Uint8Array.from(Buffer.from(fs.readFileSync(path.join(dir, f), 'utf8').trim(), 'hex'));
        if (b.length && sdk.programHash(b) === want) return { f: dir + '/' + f, b };
      } catch (e) { /* skip */ }
    }
  }
  return null;
}
const P = findProgram();
if (!P) { console.log('FAIL no program source hashes to ' + want.slice(0, 16)); process.exit(2); }
console.log('program from ' + P.f + ' (' + P.b.length + ' B)');
if (S.render_hash) rep('anchor', sdk.verifyAnchor({ program: P.b, factory: S }));
else console.log('SKIP anchor: ledger series has no render_hash');
EDS.forEach((ed, i) => rep('edition ' + i, sdk.verifyEdition({ program: P.b, state: { program_hash: S.program_hash, serial: ed.serial, lineage: ed.lineage, sales: ed.sales } })));
console.log(bad ? 'SDK READ FAILED' : 'SDK READ OK');
process.exit(bad);
