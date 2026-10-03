'use strict';
const B2 = require('../web/blake2b.js');
const chain = require('../web/reliks-chain.js');
const vm = require('../v13/vm/rvm.js');

const enc = new TextEncoder();
const h32 = (u8) => B2.blake2b(u8, 32);
const hex = (u) => Array.from(u, (x) => (x < 16 ? '0' : '') + x.toString(16)).join('');
function unhex(s) {
  if (typeof s !== 'string' || s.length % 2 || /[^0-9a-f]/i.test(s)) throw new Error('bad hex');
  return Uint8Array.from(s.match(/../g) || [], (b) => parseInt(b, 16));
}

function programHash(program) { return hex(h32(program)); }

function renderEdition(program, serial, lineageHex, sales) {
  const lin = unhex(lineageHex);
  if (lin.length !== 32) throw new Error('lineage must be 32 bytes');
  const hi = vm.hostInputs((m) => h32(m), serial, lin, sales);
  const svg = vm.render(program, hi.lanes, hi.serial32, hi.pat, hi.wear);
  return { svg, renderHash: hex(h32(enc.encode(svg))) };
}

function run(checks, name, fn) {
  try { const r = fn(); checks.push({ name, ok: r.ok, detail: r.detail }); return r.out; }
  catch (e) { checks.push({ name, ok: false, detail: e && e.code ? e.code : String(e && e.message || e) }); return null; }
}

// state: { program_hash, serial, lineage, sales }
function verifyEdition({ program, state }) {
  const checks = [];
  run(checks, 'program_hash', () => { const g = programHash(program); return { ok: g === String(state.program_hash).toLowerCase(), detail: g.slice(0, 16) }; });
  const out = run(checks, 'render', () => { const o = renderEdition(program, state.serial, state.lineage, state.sales); return { ok: true, detail: o.renderHash.slice(0, 16), out: o }; });
  return { ok: checks.every((c) => c.ok), checks, svg: out && out.svg, renderHash: out && out.renderHash };
}

// factory: { program_hash, render_hash }. Anchor rule: serial 1, lineage zero, sales 0.
function verifyAnchor({ program, factory }) {
  const checks = [];
  run(checks, 'program_hash', () => { const g = programHash(program); return { ok: g === String(factory.program_hash).toLowerCase(), detail: g.slice(0, 16) }; });
  run(checks, 'anchor_render', () => { const o = renderEdition(program, '1', '00'.repeat(32), 0); return { ok: o.renderHash === String(factory.render_hash).toLowerCase(), detail: o.renderHash.slice(0, 16) }; });
  return { ok: checks.every((c) => c.ok), checks };
}

module.exports = { programHash, renderEdition, verifyEdition, verifyAnchor, chain, unhex, hex };
