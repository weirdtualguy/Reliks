#!/usr/bin/env node
// reliks-lens.js - Reliks engine authoring harness (fx(lens) equivalent).
// Pre-deploy gate suite for generative engines. Templates/codec untouched.
// Usage:
//   node reliks-lens.js <engine.js>          run all gates, human report
//   node reliks-lens.js <engine.js> --json   machine-readable report (CI gate)
//   node reliks-lens.js html <engine.js>     write interactive reliks-lens.html
// Env: RELIKS_ENGINE_CAP (default 32768)
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
const CAP = Number(process.env.RELIKS_ENGINE_CAP || 32768);
const hex = (b) => B.from(b).toString('hex');
const TESTS = [1, 42, 999, 8675309, 4294967295, 5056484704985813865];
function seedLanes(serial) {
  const le = B.alloc(8); le.writeBigUInt64LE(BigInt(serial));
  const h = blake2b(B.concat([B.from('ReliksSeedV10', 'utf8'), le]), { dkLen: 32 });
  const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
  const out = []; for (let i = 0; i < 8; i++) out.push(dv.getInt32(i * 4, true));
  return out;
}
const seed32 = (s) => Number(BigInt(s) & 0xFFFFFFFFn);
const BANNED = [
  [/\bMath\s*\.\s*(random|sin|cos|tan|asin|acos|atan2?|pow|sqrt|hypot|exp|log2?|log10)\b/, 'float transcendental / Math.random (ulps differ across JS engines)'],
  [/\bDate\b/, 'wall-clock time'], [/\bperformance\b/, 'high-res timer'],
  [/\bfetch\s*\(/, 'network'], [/\bXMLHttpRequest\b/, 'network'], [/\bWebSocket\b/, 'network'],
  [/\brequire\s*\(/, 'module system (engine must be self-contained)'], [/\bimport\s*[\(\{]/, 'module system'],
  [/\beval\s*\(/, 'eval'], [/new\s+Function/, 'eval'],
  [/\bwindow\b/, 'environment'], [/\bdocument\b/, 'environment'], [/\blocalStorage\b/, 'environment'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'async scheduling'], [/\bprocess\b/, 'Node environment'], [/\bglobalThis\b/, 'environment']
];
const NOTED = [[/\bMath\s*\.\s*(floor|ceil|round|abs|min|max|imul|clz32|trunc)\b/, 'exact-integer Math op (allowed, IEEE-deterministic)']];
function scan(SRC) {
  const bad = [], notes = [];
  for (const [re, why] of BANNED) { const m = SRC.match(re); if (m) bad.push(m[0] + ' - ' + why); }
  for (const [re, why] of NOTED) { const m = SRC.match(re); if (m) notes.push(m[0] + ' - ' + why); }
  return { bad, notes };
}
function massFee(nb) {
  const bc = nb + 7109, ss = bc + 46, tx = ss + 546, mass = 2 * tx;
  return { bc, ss, tx, mass, feeSompi: BigInt(mass) * 100n };
}
function gates(enginePath) {
  const R = [];
  const check = (name, pass, info) => { R.push({ name, pass: !!pass, info: info || '' }); return !!pass; };
  const M = require(path.resolve(enginePath));
  const SRC = M.ENGINE_SRC;
  check('L0 module shape (ENGINE_SRC string + render fn)', typeof SRC === 'string' && SRC.length > 0 && typeof M.render === 'function');
  const nb = B.byteLength(SRC, 'utf8');
  check('L1 engine size <= cap', nb <= CAP, nb + '/' + CAP + ' B');
  const sc = scan(SRC);
  check('L2 no banned constructs (rand/time/net/eval/env)', sc.bad.length === 0, sc.bad.join('; '));
  const outs = {}; let det = true;
  for (const s of TESTS) { const a = M.render(s); const b = M.render(s); if (a !== b) det = false; outs[s] = a; }
  check('L3 determinism: double-render byte-identical x' + TESTS.length, det);
  let vmOk = true, vmErr = '', vmReliks = null;
  try { vmReliks = vm.runInContext('(function(L,serial){' + SRC + '\nreturn reliks(L,serial);})', vm.createContext({}), { timeout: 10000 }); }
  catch (e) { vmOk = false; vmErr = e.message; }
  if (vmOk) for (const s of TESTS) { const s32 = seed32(s); if (vmReliks(seedLanes(s32), s32 | 0) !== outs[s]) { vmOk = false; vmErr = 'mismatch at serial ' + s; break; } }
  check('L4 bare-realm parity (no host globals) + canonical seed pipeline', vmOk, vmErr);
  check('L5 seed convention: render(x)==render(x+2^32), render(1)!=render(2)', M.render(7) === M.render(7 + 4294967296) && M.render(1) !== M.render(2));
  const eh = hex(blake2b(B.from(SRC, 'utf8'), { dkLen: 32 }));
  const ts = M.TEST_SERIAL || 1;
  const rh = hex(blake2b(B.from(M.render(ts), 'utf8'), { dkLen: 32 }));
  check('L6 hashes: module exports match recomputed', (M.engineHashHex === undefined || M.engineHashHex === eh) && (M.renderHashHex === undefined || M.renderHashHex === rh), 'engine ' + eh.slice(0, 16) + '... render ' + rh.slice(0, 16) + '...');
  if (typeof M.seedLanes === 'function') {
    let ok = true; for (const s of TESTS) if (JSON.stringify(M.seedLanes(seed32(s))) !== JSON.stringify(seedLanes(seed32(s)))) ok = false;
    check('L7 seedLanes == ReliksSeedV10 canonical', ok);
  } else R.push({ name: 'L7 seedLanes parity (optional, not exported)', pass: true, info: 'skipped' });
  let svgOk = true, svgErr = '';
  for (const s of TESTS) { const o = outs[s];
    if (!(o.startsWith('<svg') && o.includes('xmlns=') && o.endsWith('</svg>'))) { svgOk = false; svgErr = 'malformed svg @' + s; break; }
    const m2 = o.match(/NaN|undefined|Infinity|null/); if (m2) { svgOk = false; svgErr = m2[0] + ' @' + s; break; } }
  check('L8 svg well-formed, no NaN/undefined/Infinity/null', svgOk, svgErr);
  const mf = massFee(nb);
  check('L9 mint fee-mass within policy 100000', mf.mass <= 100000, 'mass ' + mf.mass + ' | est fee ' + (Number(mf.feeSompi) / 1e8).toFixed(5) + ' KAS');
  if (typeof M.features === 'function') {
    let fok = true; const dist = {};
    for (const s of TESTS.concat([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])) {
      const f = M.features(s);
      for (const k of Object.keys(f)) { const v = f[k];
        if (v === null || (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean')) fok = false;
        (dist[k] = dist[k] || new Set()).add(v); } }
    const warn = Object.keys(dist).filter((k) => dist[k].size >= TESTS.length + 18);
    check('L10 features: primitive values, rarity-meaningful buckets', fok && warn.length === 0, warn.length ? 'continuous values: ' + warn.join(',') : Object.keys(dist).map((k) => k + ':' + dist[k].size).join(' '));
  } else R.push({ name: 'L10 features (optional, not exported)', pass: true, info: 'skipped' });
  fs.mkdirSync('lens-out', { recursive: true });
  for (const s of [1, 42, 999, 8675309]) fs.writeFileSync('lens-out/lens-' + s + '.svg', outs[s]);
  return { R, sc, eh, rh, nb, mf, ts };
}
function report(g, enginePath, json) {
  const ok = g.R.every((r) => r.pass);
  if (json) console.log(JSON.stringify({ engine: enginePath, bytes: g.nb, cap: CAP, engineHash: g.eh, renderHash: g.rh, mass: g.mf.mass, feeSompi: g.mf.feeSompi.toString(), banned: g.sc.bad, notes: g.sc.notes, gates: g.R }, null, 2));
  else {
    console.log('RELIKS LENS - ' + enginePath);
    for (const r of g.R) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.info ? ' | ' + r.info : ''));
    for (const n of g.sc.notes) console.log('NOTE ' + n);
    console.log('engine_hash ' + g.eh + '\nrender_hash ' + g.rh + '\nengine_bytes ' + g.nb + ' | est mint fee ' + (Number(g.mf.feeSompi) / 1e8).toFixed(5) + ' KAS | previews in lens-out/');
    console.log(ok ? 'LENS: ALL GATES PASS - cleared for gen-factory-args bake.' : 'LENS: GATES FAILED - do not bake.');
  }
  process.exitCode = ok ? 0 : 1;
}
function htmlMode(enginePath) {
  const M = require(path.resolve(enginePath));
  const SRC = M.ENGINE_SRC;
  const nb = B.byteLength(SRC, 'utf8');
  const sc = scan(SRC);
  const eh = hex(blake2b(B.from(SRC, 'utf8'), { dkLen: 32 }));
  const rh = hex(blake2b(B.from(M.render(M.TEST_SERIAL || 1), 'utf8'), { dkLen: 32 }));
  const blakeSrc = fs.readFileSync(path.join(__dirname, 'web', 'gallery-blake2b.js'), 'utf8');
  const STATIC = JSON.stringify({ bytes: nb, cap: CAP, bad: sc.bad, notes: sc.notes, engineHash: eh, renderHash: rh }).replace(/</g, '\\u003c');
  const srcJson = JSON.stringify(SRC).replace(/</g, '\\u003c');
  const page = ['<!doctype html>', '<html lang="en"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Reliks Lens</title>',
    '<style>body{background:#0b0d10;color:#e8e6e3;font-family:ui-monospace,Menlo,Consolas,monospace;margin:0;padding:20px}h1{font-size:18px;letter-spacing:2px}h1 span{color:#7fd1ae}.row{margin:8px 0;font-size:12px;line-height:1.6}.pass{color:#7fd1ae;font-weight:700}.fail{color:#ff6b6b;font-weight:700}input,button{background:#101418;color:#e8e6e3;border:1px solid #23282e;border-radius:6px;padding:8px;font-family:inherit;font-size:12px;margin-right:6px}iframe{width:100%;max-width:520px;aspect-ratio:1/1;border:1px solid #23282e;border-radius:8px;background:#000;display:block;margin-top:12px}</style></head><body>',
    '<h1>RELIKS <span>// lens</span></h1>',
    '<div class="row">serial <input id="ser" value="1" size="22"><button id="go">render</button><button id="rnd">random</button><button id="det">determinism x3</button></div>',
    '<div class="row" id="static"></div>',
    '<div class="row" id="live"></div>',
    '<iframe id="art" sandbox=""></iframe>',
    '<script>' + blakeSrc + '</' + 'script>',
    '<script>',
    'var STATIC=' + STATIC + ';',
    'var ENGINE_SRC=' + srcJson + ';',
    'var compiled=new Function("L","serial",ENGINE_SRC+"\\nreturn reliks(L,serial);");',
    'function hx(b){var s="";for(var i=0;i<b.length;i++)s+=("0"+b[i].toString(16)).slice(-2);return s;}',
    'function le64(v){var b=new Uint8Array(8);new DataView(b.buffer).setBigUint64(0,BigInt(v),true);return b;}',
    'function utf8(s){return new TextEncoder().encode(s);}',
    'function cat(a){var n=0,i;for(i=0;i<a.length;i++)n+=a[i].length;var o=new Uint8Array(n),p=0;for(i=0;i<a.length;i++){o.set(a[i],p);p+=a[i].length;}return o;}',
    'function seedLanes(s){var h=ReliksBlake2b.blake2b(cat([utf8("ReliksSeedV10"),le64(s)]),32);var dv=new DataView(h.buffer,h.byteOffset,h.byteLength);var o=[];for(var i=0;i<8;i++)o.push(dv.getInt32(i*4,true));return o;}',
    'function render(serial){var s=Number(BigInt(serial)&0xFFFFFFFFn);return compiled(seedLanes(s),s|0);}',
    'var h="";',
    'h+="<div>bytes "+STATIC.bytes+" / cap "+STATIC.cap+" - "+(STATIC.bytes<=STATIC.cap?"<span class=\\"pass\\">OK</span>":"<span class=\\"fail\\">OVER CAP</span>")+"</div>";',
    'h+="<div>banned constructs: "+(STATIC.bad.length===0?"<span class=\\"pass\\">none</span>":"<span class=\\"fail\\">"+STATIC.bad.join("; ")+"</span>")+"</div>";',
    'for(var i=0;i<STATIC.notes.length;i++)h+="<div>note: "+STATIC.notes[i]+"</div>";',
    'h+="<div>node-side engine_hash "+STATIC.engineHash+"</div>";',
    'h+="<div>in-page recompute engine_hash "+hx(ReliksBlake2b.blake2b(utf8(ENGINE_SRC),32))+" | render_hash(1) "+hx(ReliksBlake2b.blake2b(utf8(render(1)),32))+"</div>";',
    'document.getElementById("static").innerHTML=h;',
    'function show(){var s=document.getElementById("ser").value.trim();var svg=render(s);document.getElementById("art").srcdoc="<!doctype html><html><head><meta charset=utf-8><style>html,body{margin:0;height:100%;background:#000}svg{display:block;width:100vw;height:100vh}</style></head><body>"+svg+"</body></html>";document.getElementById("live").innerHTML="serial "+s+" | svg bytes "+svg.length+" | render_hash "+hx(ReliksBlake2b.blake2b(utf8(svg),32));}',
    'document.getElementById("go").onclick=show;',
    'document.getElementById("rnd").onclick=function(){document.getElementById("ser").value=String(Math.floor(Math.random()*4294967296));show();};',
    'document.getElementById("det").onclick=function(){var s=document.getElementById("ser").value.trim();var a=render(s);var b=render(s);var c2=new Function("L","serial",ENGINE_SRC+"\\nreturn reliks(L,serial);");var s32=Number(BigInt(s)&0xFFFFFFFFn);var c=c2(seedLanes(s32),s32|0);var ok=(a===b&&b===c);document.getElementById("live").innerHTML=(ok?"<span class=\\"pass\\">DETERMINISTIC</span>":"<span class=\\"fail\\">NON-DETERMINISTIC</span>")+" - 3 independent compiles @ serial "+s;};',
    'show();',
    '</' + 'script>', '</body></html>'].join('\n');
  fs.writeFileSync('reliks-lens.html', page);
}
const argv = process.argv.slice(2);
if (argv[0] === 'html') {
  if (!argv[1]) { console.error('usage: node reliks-lens.js html <engine.js>'); process.exit(1); }
  htmlMode(argv[1]); console.log('reliks-lens.html written | open with: termux-open reliks-lens.html');
} else {
  const json = argv.includes('--json');
  const eng = argv.find((a) => !a.startsWith('--'));
  if (!eng) { console.error('usage: node reliks-lens.js <engine.js> [--json] | html <engine.js>'); process.exit(1); }
  report(gates(eng), eng, json);
}
