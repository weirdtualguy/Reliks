#!/usr/bin/env node
// reliks-lens.js - Reliks-VM engine authoring & pre-deploy gate harness.
// Assembles .rvm/.txt source (or loads .hex bytecode), sweeps serials x (pat, wear) corners,
// reports worst-case fuel / elements / SVG bytes / stack / call depth against machine limits,
// and enforces the 25,641-byte covenant PUSHDATA2 baking ceiling.
// Usage:
//   node cli/reliks-lens.js <program.rvm|.txt|.hex> [--serials N] [--json]
// Env: RELIKS_ENGINE_CAP (default 25641, the PUSHDATA2 ceiling)
'use strict';
const fs = require('fs');
const path = require('path');
const { blake2b } = require('../web/blake2b.js');
const RVM = require('../vm/rvm.js');
const RvmAsm = require('../web/rvm-asm.js');

if (process.env.PC_PRIV) {
  console.error('LENS SECURITY: PC_PRIV detected in env. Run lens from a clean shell without sourced secrets.');
  process.exit(1);
}

const CAP = Number(process.env.RELIKS_ENGINE_CAP || RVM.limits.BAKE_CAP || 25641);
const VM_CODE_CAP = 65535;
const NAMED_SERIALS = ['1', '42', '999', '8675309', '4294967295', '5056484704985813865', '9223372036854775807'];
const CORNERS = [
  { pat: 0, wear: 0, label: 'fresh (pat=0,wear=0)' },
  { pat: 0, wear: 255, label: 'max-wear (pat=0,wear=255)' },
  { pat: 21, wear: 64, label: 'mid-a (pat=21,wear=64)' },
  { pat: 42, wear: 128, label: 'mid-b (pat=42,wear=128)' },
  { pat: 63, wear: 0, label: 'max-pat (pat=63,wear=0)' },
  { pat: 63, wear: 255, label: 'max-both (pat=63,wear=255)' }
];

const hx = (u) => Buffer.from(u).toString('hex');
const enc = new TextEncoder();
const hashHex = (u) => hx(blake2b(u instanceof Uint8Array ? u : new Uint8Array(u), 32));

function loadProgram(filePath) {
  const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F\s]+$/.test(trimmed) && trimmed.replace(/\s+/g, '').length >= 18 && /^52564d01/i.test(trimmed.replace(/\s+/g, ''))) {
    const clean = trimmed.replace(/\s+/g, '');
    if (clean.length % 2 !== 0) throw new Error('hex file has odd length');
    return { prog: new Uint8Array(Buffer.from(clean, 'hex')), kind: 'hex' };
  }
  return { prog: RvmAsm.assemble(raw), kind: 'asm' };
}

function detSerial(idx) {
  // Deterministic 63-bit serial generator for sweep cases beyond NAMED_SERIALS
  const b = new Uint8Array(16);
  b.set(enc.encode('ReliksLensSweep1'), 0);
  const le = new Uint8Array(4);
  new DataView(le.buffer).setUint32(0, idx, true);
  const h = blake2b(new Uint8Array([...b, ...le]), 32);
  let s = 0n;
  for (let i = 0; i < 7; i++) s += BigInt(h[i]) * (256n ** BigInt(i));
  s += BigInt(h[7] % 128) * 72057594037927936n;
  return s.toString();
}

function massFee(nb) {
  const bc = 2 * nb + 7129, ss = bc + 46, tx = ss + 546, mass = 2 * tx;
  return { bc, ss, tx, mass, feeSompi: BigInt(mass) * 100n };
}

function runLensVm(filePath, opts) {
  opts = opts || {};
  const sweepCount = Number(opts.serials || 16);
  const R = [];
  const check = (name, pass, info) => { R.push({ name, pass: !!pass, info: info || '' }); return !!pass; };

  let loaded;
  try {
    loaded = loadProgram(filePath);
  } catch (e) {
    check('V0 assemble / decode program', false, e.message);
    return { ok: false, gates: R, error: e.message };
  }
  const prog = loaded.prog;
  const codeLen = prog.length - 8;

  let parsed = null;
  try {
    parsed = RVM.parse(prog);
    check('V0 valid RVM\\x01 header, decode & jump targets', true, 'canvas ' + parsed.W + 'x' + parsed.H + ' | ' + parsed.insns.size + ' insns | ' + prog.length + ' B');
  } catch (e) {
    check('V0 valid RVM\\x01 header, decode & jump targets', false, e.code || e.message);
    return { ok: false, gates: R, error: e.code || e.message };
  }

  const mf = massFee(prog.length);
  check(
    'V1 size <= PUSHDATA2 baking cap (' + CAP + ' B)',
    prog.length <= CAP && codeLen <= VM_CODE_CAP,
    prog.length + '/' + CAP + ' B (factory redeem ~' + mf.bc + '/65535 B | est mint fee ' + (Number(mf.feeSompi) / 1e8).toFixed(5) + ' KAS)'
  );

  const progHash = hashHex(prog);
  let anchorSvg = '', anchorHash = '';
  const anchorStats = {};
  try {
    const hi1 = RVM.hostInputs(blake2b, '1', new Uint8Array(32), 0);
    anchorSvg = RVM.render(prog, hi1.lanes, hi1.serial32, hi1.pat, hi1.wear, anchorStats);
    anchorHash = hashHex(enc.encode(anchorSvg));
    const wf = anchorSvg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && anchorSvg.endsWith('</svg>') && !/NaN|undefined|Infinity|null/.test(anchorSvg);
    check('V2 anchor render (serial=1, lineage=0, sales=0)', wf, 'svg ' + anchorSvg.length + ' B | fuel ' + anchorStats.fuel + ' | elems ' + anchorStats.elems);
  } catch (e) {
    check('V2 anchor render (serial=1, lineage=0, sales=0)', false, 'fault ' + (e.code || e.message));
  }

  // V3: Determinism x3
  let detOk = true, detErr = '';
  for (const s of NAMED_SERIALS.slice(0, 5)) {
    try {
      const hi = RVM.hostInputs(blake2b, s, new Uint8Array(32), 0);
      const a = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
      const b = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
      const c = RVM.render(prog, hi.lanes, hi.serial32, hi.pat, hi.wear);
      if (a !== b || b !== c) { detOk = false; detErr = 'mismatch at serial ' + s; break; }
    } catch (e) {
      detOk = false; detErr = (e.code || e.message) + ' at serial ' + s; break;
    }
  }
  check('V3 determinism: triple-render byte-identical x5', detOk, detErr);

  // V4 & V5: Sweep N serials x 6 (pat, wear) corners
  const serialList = NAMED_SERIALS.slice();
  while (serialList.length < sweepCount) serialList.push(detSerial(serialList.length));
  const worst = { fuel: 0, elems: 0, svg_len: 0, max_stack: 0, max_calls: 0, max_groups: 0, max_segs: 0, grads: 0 };
  let totalRuns = 0, faults = [];
  let patDiffs = 0, wearDiffs = 0, serialDiffs = new Set();

  for (const s of serialList) {
    const hiBase = RVM.hostInputs(blake2b, s, new Uint8Array(32), 0);
    let svg00 = null, svg0Max = null, svgMax0 = null;
    for (const c of CORNERS) {
      totalRuns++;
      const st = {};
      try {
        const svg = RVM.render(prog, hiBase.lanes, hiBase.serial32, c.pat, c.wear, st);
        if (c.pat === 0 && c.wear === 0) { svg00 = svg; serialDiffs.add(hashHex(enc.encode(svg))); }
        if (c.pat === 0 && c.wear === 255) svg0Max = svg;
        if (c.pat === 63 && c.wear === 0) svgMax0 = svg;
        for (const k of Object.keys(worst)) if (st[k] > worst[k]) worst[k] = st[k];
      } catch (e) {
        faults.push('serial ' + s + ' ' + c.label + ': ' + (e.code || e.message));
      }
    }
    if (svg00 !== null && svg0Max !== null && svg00 !== svg0Max) wearDiffs++;
    if (svg00 !== null && svgMax0 !== null && svg00 !== svgMax0) patDiffs++;
  }

  check(
    'V4 corner sweep (' + serialList.length + ' serials x ' + CORNERS.length + ' pat/wear corners = ' + totalRuns + ' renders)',
    faults.length === 0,
    faults.length ? faults.slice(0, 3).join('; ') : '0 faults, ' + serialDiffs.size + '/' + serialList.length + ' distinct serial renders'
  );

  const lim = RVM.limits;
  const pct = (v, m) => ((v * 100) / m).toFixed(1) + '%';
  const headroomOk = faults.length === 0 &&
    worst.fuel <= lim.FUEL_MAX &&
    worst.elems <= lim.MAX_ELEMS &&
    worst.svg_len <= lim.MAX_SVG &&
    worst.max_stack <= lim.STACK_MAX &&
    worst.max_calls <= lim.CALL_MAX;
  check(
    'V5 resource headroom across sweep',
    headroomOk,
    'fuel ' + worst.fuel + '/' + lim.FUEL_MAX + ' (' + pct(worst.fuel, lim.FUEL_MAX) + ') | ' +
    'elems ' + worst.elems + '/' + lim.MAX_ELEMS + ' (' + pct(worst.elems, lim.MAX_ELEMS) + ') | ' +
    'svg ' + worst.svg_len + '/' + lim.MAX_SVG + ' B (' + pct(worst.svg_len, lim.MAX_SVG) + ') | ' +
    'stack ' + worst.max_stack + '/' + lim.STACK_MAX + ' | calls ' + worst.max_calls + '/' + lim.CALL_MAX + ' | segs ' + worst.max_segs + '/' + lim.MAX_SEGS
  );

  check(
    'V6 history sensitivity (patina / wear)',
    true,
    'patina varies ' + patDiffs + '/' + serialList.length + ' serials | wear varies ' + wearDiffs + '/' + serialList.length + ' serials'
  );

  if (!opts.noWrite && anchorSvg) {
    fs.mkdirSync('lens-out', { recursive: true });
    fs.writeFileSync('lens-out/vm-lens-s1-fresh.svg', anchorSvg);
    try {
      const hiW = RVM.hostInputs(blake2b, '1', new Uint8Array(32).fill(0xff), 255);
      fs.writeFileSync('lens-out/vm-lens-s1-worn.svg', RVM.render(prog, hiW.lanes, hiW.serial32, hiW.pat, hiW.wear));
    } catch (e) {}
  }

  return {
    ok: R.every((g) => g.pass),
    file: filePath,
    kind: loaded.kind,
    bytes: prog.length,
    codeBytes: codeLen,
    bakeCap: CAP,
    vmCodeCap: VM_CODE_CAP,
    canvas: { width: parsed.W, height: parsed.H },
    programHash: progHash,
    renderHash: anchorHash,
    mass: mf.mass,
    feeSompi: mf.feeSompi.toString(),
    worstStats: worst,
    limits: lim,
    historyEffect: { patVaries: patDiffs > 0, wearVaries: wearDiffs > 0 },
    gates: R
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const serIdx = argv.indexOf('--serials');
  const serials = serIdx >= 0 ? Number(argv[serIdx + 1] || 16) : 16;
  const target = argv.find((a, i) => !a.startsWith('--') && (serIdx < 0 || i !== serIdx + 1));
  if (!target) {
    console.error('usage: node cli/reliks-lens.js <program.rvm|.txt|.hex> [--serials N] [--json]');
    process.exit(1);
  }
  const res = runLensVm(target, { serials });
  if (json) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log('RELIKS VM LENS - ' + target + ' (' + (res.kind || 'unknown') + ')');
    for (const r of res.gates) console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.info ? ' | ' + r.info : ''));
    if (res.programHash) {
      console.log('program_hash ' + res.programHash + '\nrender_hash  ' + res.renderHash + '\nprogram_bytes ' + res.bytes + ' / ' + res.bakeCap + ' B (PUSHDATA2 cap) | est mint fee ' + (Number(res.feeSompi) / 1e8).toFixed(5) + ' KAS | previews in lens-out/');
    }
    console.log(res.ok ? 'VM LENS: ALL GATES PASS - cleared for cli/gen-factory-args.js (engine_lang = 2).' : 'VM LENS: GATES FAILED - do not bake.');
  }
  process.exit(res.ok ? 0 : 1);
}

module.exports = { runLensVm, loadProgram };
