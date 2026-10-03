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

async function _onChainRaw({ chain, io, series, covId, edition }) {
  const off = verifyEditionScript({ chain, series, covId, edition });
  if (!off.ok) return { ok: false, status: 'ledger_mismatch', checks: off.checks };
  const exp = normSpk(edition.spk).spk;
  let kj;
  try { kj = await io.covenant(edition.cov); }
  catch (e) { return { ok: false, status: 'unreachable', checks: off.checks.concat([{ name: 'kascov', ok: false, detail: String(e && e.message || e) }]) }; }
  const us = (kj && kj.utxos) || [];
  const hit = us.filter((u) => chain.stripVersion(String(u.script_hex || '')).toLowerCase() === exp);
  const want = edition.txId + ':' + edition.index;
  let status;
  if (!hit.length) status = 'absent';
  else if (hit.some((u) => u.live === true && u.outpoint === want)) status = 'confirmed';
  else if (hit.some((u) => u.live === true)) status = 'live_other_outpoint';
  else status = 'spent';
  return { ok: status === 'confirmed', status, checks: off.checks.concat([{ name: 'chain', ok: status === 'confirmed', detail: status }]) };
}

// Freshness gate: an index older than maxTipAgeSec (default 600) cannot confirm or refute anything.
async function verifyEditionOnChain(args) {
  const r = await _onChainRaw(args);
  if (r.status === 'ledger_mismatch' || r.status === 'unreachable') return r;
  const max = args.maxTipAgeSec == null ? 600 : args.maxTipAgeSec, age = args.tipAgeSec;
  if (typeof age === 'number' && isFinite(age) && age <= max) return r;
  return { ok: false, status: 'index_stale', observed: r.status, checks: r.checks.concat([{ name: 'freshness', ok: false, detail: typeof age === 'number' ? 'tip age ' + age + ' s > ' + max : 'tip age not supplied' }]) };
}
module.exports.verifyEditionOnChain = verifyEditionOnChain;

// Seconds since kascov's last tip update; undefined if unreadable (the gate then treats the index as stale).
async function kascovTipAgeSec(kascovBase, fetchImpl) {
  try {
    const f = fetchImpl || fetch, r = await f(kascovBase + '-live.json');
    if (!r.ok) return undefined;
    const j = await r.json(), age = Math.round((Date.now() - Number(j.tip_at_ms)) / 1000);
    return isFinite(age) && age >= 0 ? age : undefined;
  } catch (e) { return undefined; }
}
module.exports.kascovTipAgeSec = kascovTipAgeSec;
