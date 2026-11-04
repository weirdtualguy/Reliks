// JS assembler (web/rvm-asm.js) must match the Python reference (rvm.py): identical bytes, and an error exactly where Python errors.
'use strict';
const fs = require('fs'), path = require('path');
const A = require('../web/rvm-asm.js');
const dir = path.join(__dirname, '..', 'v13', 'vm', 'asm-corpus');
const hx = u => Buffer.from(u).toString('hex');
let pass = 0, fail = 0;
const ok = (n, c, i) => { if (c) pass++; else { fail++; if (fail < 20) console.log('FAIL', n, i || ''); } };
const run = src => { try { return hx(A.assemble(src)); } catch (e) { return 'ERR ' + e.message; } };
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.txt'))) {
  const want = fs.readFileSync(path.join(dir, f.replace(/\.txt$/, '.hex')), 'utf8').trim();
  ok(f, run(fs.readFileSync(path.join(dir, f), 'utf8')) === want);
}
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
  const cases = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  cases.forEach((c, i) => { const got = run(c.src); ok(f + ' #' + i, c.err ? got.startsWith('ERR ') : got === c.hex, c.err ? 'python errored, js did not: ' + c.src.slice(0, 80) : got.slice(0, 80) + ' | ' + c.src.slice(0, 80)); });
  console.log(f + ': ' + cases.length + ' cases');
}
for (const bad of ['bogus', '.canvas 8 8 push', 'jmp nowhere', 'load 256', '.canvas 70000 1 halt', '.byte 300', 'push 08'])
  ok('rejects: ' + bad, run(bad).startsWith('ERR '));
console.log('asm-test:', pass, 'passed,', fail, 'failed');
process.exit(fail ? 1 : 0);
