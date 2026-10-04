'use strict';
// Runs every program case of vectors.json through the C implementation. Usage: node v13/vm/check3.js <rvm3 binary>
const fs = require('fs'), cp = require('child_process'), path = require('path');
const { blake2b } = require('../../web/blake2b.js');
const bin = process.argv[2] || process.env.RVM3_BIN;
if (!bin || !fs.existsSync(bin)) { console.log('usage: node v13/vm/check3.js <rvm3 binary>'); process.exit(2); }
const V = JSON.parse(fs.readFileSync(path.join(__dirname, 'vectors.json'), 'utf8'));
const cases = [];
(function walk(o) { if (o && typeof o === 'object') { if (typeof o.program_hex === 'string' && o.expect && typeof o.expect === 'object') { cases.push(o); return; } for (const k of Object.keys(o)) walk(o[k]); } })(V);
let pass = 0, fail = 0;
for (const c of cases) {
  const inp = c.inputs || {}, lanes = (inp.lanes || [0, 0, 0, 0, 0, 0, 0, 0]).map(Number).join(',');
  const r = cp.spawnSync(bin, [lanes, String(inp.serial32 || 0), String(inp.pat || 0), String(inp.wear || 0)], { input: c.program_hex, maxBuffer: 16 * 1024 * 1024 });
  const out = r.stdout || Buffer.alloc(0), nl = out.indexOf(10), head = nl < 0 ? '' : out.slice(0, nl).toString();
  let got, ok = false;
  if (head.indexOf('FAULT ') === 0) { got = head.slice(6); ok = c.expect.fault === got; }
  else if (head.indexOf('OK ') === 0) {
    const svg = out.slice(nl + 1), len = Number(head.slice(3));
    got = 'svg ' + len;
    if (!c.expect.fault && svg.length === len && len === c.expect.svg_len && Buffer.from(blake2b(new Uint8Array(svg), 32)).toString('hex') === c.expect.svg_hash && (c.expect.svg === undefined || svg.toString('latin1') === c.expect.svg)) ok = true;
  } else got = 'no output (' + String((r.stderr || '').toString()).slice(0, 80) + ')';
  if (ok) pass++; else { fail++; if (fail <= 40) console.log('FAIL ' + c.name + ' | got ' + got + ' | expected ' + (c.expect.fault ? c.expect.fault : 'svg ' + c.expect.svg_len)); }
}
console.log('rvm3 (C): ' + pass + ' passed, ' + fail + ' failed (of ' + cases.length + ' program cases)');
process.exit(fail ? 1 : 0);
