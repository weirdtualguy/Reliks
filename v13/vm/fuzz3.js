'use strict';
// Compares JS, Python (precomputed in the json) and C results on fuzz programs. Usage: node v13/vm/fuzz3.js <fuzz.json> <rvm3 binary>
const fs = require('fs'), cp = require('child_process');
const { blake2b } = require('../../web/blake2b.js'), vm = require('./rvm.js');
const file = process.argv[2], bin = process.argv[3];
if (!file || !bin) { console.log('usage: node v13/vm/fuzz3.js <fuzz.json> <rvm3 binary>'); process.exit(2); }
const J = JSON.parse(fs.readFileSync(file, 'utf8'));
const h = (u) => Buffer.from(blake2b(new Uint8Array(u), 32)).toString('hex');
const fmt = (r) => r.fault ? r.fault : 'svg ' + r.svg_len + ' ' + r.svg_hash.slice(0, 8);
let agree = 0, dis = 0; const hist = {}, shown = [];
for (const c of J.cases) {
  let js;
  try { const svg = vm.render(Uint8Array.from(Buffer.from(c.hex, 'hex')), J.lanes, J.serial32, J.pat, J.wear); js = { svg_len: svg.length, svg_hash: h(Buffer.from(svg, 'latin1')) }; }
  catch (e) { js = { fault: e && e.code ? e.code : 'THROW ' + String(e && e.message).slice(0, 40) }; }
  const r = cp.spawnSync(bin, [J.lanes.join(','), String(J.serial32), String(J.pat), String(J.wear)], { input: c.hex, maxBuffer: 16 * 1024 * 1024 });
  const out = r.stdout || Buffer.alloc(0), nl = out.indexOf(10), head = nl < 0 ? '' : out.slice(0, nl).toString();
  let cc;
  if (head.indexOf('FAULT ') === 0) cc = { fault: head.slice(6) };
  else if (head.indexOf('OK ') === 0) { const svg = out.slice(nl + 1); cc = { svg_len: svg.length, svg_hash: h(svg) }; }
  else cc = { fault: 'NOOUT' };
  const a = fmt(js), b = fmt(c.py), d = fmt(cc), k = c.py.fault || 'svg';
  hist[k] = (hist[k] || 0) + 1;
  if (process.argv[5] === '-v') console.log(((c.src.split(' :: ')[0]) || '').slice(0, 44).padEnd(44) + ' js=' + fmt(js) + ' py=' + fmt(c.py) + ' c=' + fmt(cc));
  if (a === b && b === d) agree++; else { dis++; if (shown.length < 25) shown.push('DISAGREE js=' + a + ' py=' + b + ' c=' + d + '\n   ' + c.src.slice(0, 170)); }
}
shown.forEach((s) => console.log(s));
console.log('outcomes (python): ' + Object.entries(hist).sort((x, y) => y[1] - x[1]).map(([k, v]) => k + ' ' + v).join(', '));
console.log('fuzz: ' + J.cases.length + ' programs, agree ' + agree + ', disagree ' + dis);
process.exit(dis ? 1 : 0);
