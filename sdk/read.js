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

const SPK_RE = /^aa20[0-9a-f]{64}87$/;
function normSpk(s) {
  s = String(s).toLowerCase();
  if (SPK_RE.test(s)) return { spk: s, enc: 'plain' };
  if (/^[0-9a-f]+$/.test(s) && s.length % 2 === 0) {
    const d = Buffer.from(s, 'hex').toString('latin1');
    if (SPK_RE.test(d)) return { spk: d, enc: 'hex-of-ascii' };
  }
  return { spk: s, enc: 'unknown' };
}
// chain must be an initialized web/reliks-chain.js with the v13 edition template.
function verifyEditionScript({ chain, series, covId, edition }) {
  const checks = [];
  const n = normSpk(edition.spk);
  run(checks, 'spk_encoding', () => ({ ok: n.enc !== 'unknown', detail: n.enc }));
  run(checks, 'script_commitment', () => {
    const st = { ownerIdentifier: edition.owner, identifierType: 0, price: Number(edition.price), artist: series.artist, royalty_bips: series.royalty_bips, program_hash: series.program_hash, factory_covid: covId, serial: edition.serial, lineage: edition.lineage, sales: edition.sales };
    const exp = chain.p2shSpk(chain.editionRedeem(st)).toLowerCase();
    return { ok: exp === n.spk, detail: exp.slice(0, 8) + '/' + exp.length + ' vs ' + n.spk.slice(0, 8) + '/' + n.spk.length };
  });
  return { ok: checks.every((c) => c.ok), checks };
}
module.exports.verifyEditionScript = verifyEditionScript;
module.exports.normSpk = normSpk;
