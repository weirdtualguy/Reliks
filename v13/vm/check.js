/* Runs vectors.json through the JS interpreter. Exit code 1 on any mismatch. */
'use strict';
const fs = require('fs'), path = require('path');
const { blake2b } = require('../web/blake2b.js');
const vm = require('./rvm.js');
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));
const hex = (u) => Buffer.from(u).toString('hex');
let pass = 0, fail = 0;
function ok(name, cond, info) { if (cond) pass++; else { fail++; console.log('FAIL', name, info || ''); } }

for (const h of V.host) {
  const g = vm.hostInputs(blake2b, BigInt(h.serial), Buffer.from(h.lineage, 'hex'), h.sales);
  ok('host ' + h.serial, JSON.stringify(g.lanes) === JSON.stringify(h.lanes) && g.serial32 === h.serial32 && g.pat === h.pat && g.wear === h.wear, JSON.stringify(g));
}
for (const c of V.cases) {
  const prog = Buffer.from(c.program_hex, 'hex'), i = c.inputs;
  let got;
  try { got = { svg: vm.render(new Uint8Array(prog), i.lanes, i.serial32, i.pat, i.wear) }; }
  catch (e) { if (e instanceof vm.Fault) got = { fault: e.code }; else throw e; }
  if (c.expect.fault) ok(c.name, got.fault === c.expect.fault, JSON.stringify(got).slice(0, 80));
  else ok(c.name, got.svg !== undefined && hex(blake2b(Buffer.from(got.svg, 'ascii'), 32)) === c.expect.svg_hash && got.svg.length === c.expect.svg_len, got.fault || 'hash mismatch');
}
const demo = Buffer.from(V.cases.find((c) => c.name === 'demo_engine_s1_fresh').program_hex, 'hex');
ok('anchor program hash', hex(blake2b(demo, 32)) === V.anchors.demo_program_hash);
const zh = vm.hostInputs(blake2b, 1n, Buffer.alloc(32), 0);
ok('anchor render hash', hex(blake2b(Buffer.from(vm.render(new Uint8Array(demo), zh.lanes, zh.serial32, zh.pat, zh.wear), 'ascii'), 32)) === V.anchors.demo_render_hash);
console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
