'use strict';
// Claim verification (PROTOCOL.md section 11). Read-only, no key. A client receives a claimed edition state from any source and checks it against an index of the chain.
const read = require('./read.js');
const HEX64 = /^[0-9a-f]{64}$/;
const INTS = ['price', 'royalty_bips', 'serial', 'sales'];
const HEXES = ['ownerIdentifier', 'artist', 'program_hash', 'factory_covid', 'lineage'];

function validateClaim(claim, network) {
  if (!claim || typeof claim !== 'object') return 'claim must be an object';
  if (claim.reliks_claim !== 1) return 'reliks_claim must be 1';
  if (typeof claim.network !== 'string' || !claim.network) return 'network missing';
  if (network !== undefined && claim.network !== network) return 'claim is for network ' + claim.network + ', expected ' + network;
  if (!HEX64.test(String(claim.covenantId))) return 'covenantId must be 64 lowercase hex';
  if (claim.outpoint !== undefined && !/^[0-9a-f]{64}:\d+$/.test(String(claim.outpoint))) return 'outpoint must be txid:index';
  const s = claim.state;
  if (!s || typeof s !== 'object') return 'state missing';
  for (const f of HEXES) if (!HEX64.test(String(s[f]))) return 'state.' + f + ' must be 64 lowercase hex';
  if (Number(s.identifierType) !== 0) return 'state.identifierType must be 0 (pubkey owners only)';
  for (const f of INTS) {
    const v = s[f];
    if (typeof v === 'number') { if (!Number.isSafeInteger(v) || v < 0) return 'state.' + f + ' must be a non-negative safe integer (use a decimal string for large values)'; }
    else if (typeof v !== 'string' || !/^\d+$/.test(v)) return 'state.' + f + ' must be a decimal string';
    if (BigInt(v) >= (1n << 63n)) return 'state.' + f + ' must be below 2^63';
  }
  return null;
}

function seriesMatches(st, series) {
  try { return String(series.program_hash).toLowerCase() === st.program_hash && String(series.artist).toLowerCase() === st.artist && BigInt(series.royalty_bips) === BigInt(st.royalty_bips); }
  catch (e) { return false; }
}

function checkHistory(chain, us, st, truncated) {
  const spent = us.filter((u) => u.live !== true && typeof u.revealed_hex === 'string' && u.revealed_hex);
  let n = 0;
  for (const u of spent) {
    let h;
    try { h = chain.decodeEditionState(u.revealed_hex); } catch (e) { return { ok: false, detail: 'cannot decode a spent output: ' + String(e && e.message || e).slice(0, 80) }; }
    n++;
    const same = String(h.serial) === st.serial && String(h.program_hash).toLowerCase() === st.program_hash && String(h.artist).toLowerCase() === st.artist && BigInt(h.royalty_bips) === BigInt(st.royalty_bips) && String(h.factory_covid).toLowerCase() === st.factory_covid;
    if (!same) return { ok: false, detail: 'a spent output has a different serial, program, artist, royalty or factory' };
    if (BigInt(h.sales) > BigInt(st.sales)) return { ok: false, detail: 'a spent output has sales above the claim' };
  }
  return { ok: true, detail: n + ' spent output(s) consistent' + (truncated ? ' (history truncated)' : '') };
}

// a: { chain, io, claim, program?, series?, network?, tipAgeSec, maxTipAgeSec? }. chain = web/reliks-chain.js initialized with the v13 edition template.
async function verifyClaim(a) {
  const { chain, io, claim, program, series } = a || {};
  if (!chain || typeof chain.editionRedeem !== 'function' || !io || typeof io.covenant !== 'function') throw new Error('chain and io required');
  if (!chain.editionHasLineage()) throw new Error('chain must be initialized with the v13 edition template');
  const checks = [], add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail: detail || '' });
  const out = (status, extra) => Object.assign({ ok: status === 'current', status, checks, provenance: 'unchecked' }, extra || {});
  const bad = validateClaim(claim, a.network);
  add('claim_format', !bad, bad || '');
  if (bad) return out('invalid_claim');
  const s = claim.state;
  const st = { ownerIdentifier: s.ownerIdentifier, identifierType: 0, price: String(BigInt(s.price)), artist: s.artist, royalty_bips: String(BigInt(s.royalty_bips)), program_hash: s.program_hash, factory_covid: s.factory_covid, serial: String(BigInt(s.serial)), lineage: s.lineage, sales: String(BigInt(s.sales)) };
  let exp;
  try { exp = chain.p2shSpk(chain.editionRedeem(st)).toLowerCase(); add('state_encodes', true); }
  catch (e) { add('state_encodes', false, String(e && e.message || e)); return out('invalid_claim'); }
  if (series) { const ok = seriesMatches(st, series); add('matches_series', ok, ok ? '' : 'program_hash, artist or royalty_bips differs'); if (!ok) return out('series_mismatch'); }
  if (program) {
    const r = read.verifyEdition({ program, state: st });
    r.checks.forEach((c) => add(c.name === 'program_hash' ? 'program_hash' : 'program_' + c.name, c.ok, c.detail));
    if (!r.ok) return out('program_mismatch');
  }
  let kj;
  try { kj = await io.covenant(claim.covenantId); }
  catch (e) { add('kascov', false, String(e && e.message || e)); return out('unreachable'); }
  const us = Array.isArray(kj && kj.utxos) ? kj.utxos : [];
  const spkOf = (u) => chain.stripVersion(String(u.script_hex || '')).toLowerCase();
  const matches = us.filter((u) => spkOf(u) === exp), live = matches.filter((u) => u.live === true);
  const age = a.tipAgeSec, max = a.maxTipAgeSec == null ? 600 : a.maxTipAgeSec;
  const fresh = typeof age === 'number' && isFinite(age) && age <= max;
  const stale = (observed, extra) => { add('freshness', false, typeof age === 'number' ? 'tip age ' + age + ' s > ' + max : 'tip age not supplied'); return out('index_stale', Object.assign({ observed }, extra || {})); };
  if (!live.length) {
    if (matches.length) { add('chain', false, 'the claimed state matches only spent output(s)'); return out('stale_state', { spentOutputs: matches.length }); }
    add('chain', false, 'no output of this covenant has the claimed state');
    return fresh ? out('absent') : stale('absent');
  }
  if (live.length > 1) { add('chain', false, live.length + ' live outputs have the claimed state'); return out('ambiguous'); }
  const lo = live[0].outpoint;
  if (claim.outpoint && claim.outpoint !== lo) { add('outpoint', false, 'claim says ' + claim.outpoint.slice(0, 14) + ', live output is ' + String(lo).slice(0, 14)); return out('outpoint_mismatch', { outpoint: lo }); }
  const h = checkHistory(chain, us, st, kj && kj.utxos_truncated === true);
  add('history', h.ok, h.detail);
  if (!h.ok) return out('history_conflict', { outpoint: lo });
  add('chain', true, 'live at ' + String(lo).slice(0, 14));
  let prov = { level: 'unchecked', detail: 'skipped' };
  if (a.provenance !== false) prov = await checkProvenance({ chain, io, covenantId: claim.covenantId, st, kj, fresh });
  add('provenance', ['listed_and_derived', 'listed', 'unchecked'].indexOf(prov.level) >= 0, prov.level + (prov.detail ? ': ' + prov.detail : ''));
  if (['unlisted', 'inconsistent', 'mismatch'].indexOf(prov.level) >= 0) return out('provenance_failed', { outpoint: lo, provenance: prov.level });
  return fresh ? out('current', { outpoint: lo, provenance: prov.level }) : stale('current', { outpoint: lo, provenance: prov.level });
}

// Provenance (PROTOCOL.md section 11): was this covenant born in a mint of the claimed lane, and does its genesis state follow from that mint?
// Levels: listed_and_derived | listed | unchecked (no evidence either way) | unlisted | inconsistent | mismatch (evidence against).
async function checkProvenance({ chain, io, covenantId, st, kj, fresh }) {
  let lane;
  try { lane = await io.covenant(st.factory_covid); } catch (e) { return { level: 'unchecked', detail: 'lane record unavailable' }; }
  const evs = Array.isArray(lane && lane.events) ? lane.events : [];
  const complete = !!lane && lane.events_truncated !== true && Number(lane.event_count) === evs.length;
  const hit = evs.find((e) => e && e.kind === 'transition' && Array.isArray(e.with_covenants) && e.with_covenants.indexOf(covenantId) >= 0);
  if (!hit) return complete && fresh ? { level: 'unlisted', detail: 'no mint event of the claimed lane lists this covenant' } : { level: 'unchecked', detail: 'lane record incomplete or index not fresh' };
  if (!kj || kj.genesis_txid !== hit.txid) return { level: 'inconsistent', detail: 'the covenant genesis tx is not the lane event tx' };
  const prev = (Array.isArray(lane.utxos) ? lane.utxos : []).find((u) => u && u.spent_txid === hit.txid);
  if (!prev || !/^[0-9a-f]{64}:\d+$/.test(String(prev.outpoint))) return { level: 'listed', detail: 'the lane input outpoint of the mint is not available' };
  if (kj.utxos_truncated === true) return { level: 'listed', detail: 'edition output list truncated; genesis state not checked' };
  const spent = (Array.isArray(kj.utxos) ? kj.utxos : []).filter((u) => u && u.live !== true);
  let g;
  if (!spent.length) g = st;
  else {
    const first = spent.slice().sort((x, y) => Number(x.created_daa) - Number(y.created_daa))[0];
    if (!first || typeof first.revealed_hex !== 'string' || !first.revealed_hex) return { level: 'listed', detail: 'the earliest output has no revealed script' };
    try { g = chain.decodeEditionState(first.revealed_hex); } catch (e) { return { level: 'listed', detail: 'the earliest output cannot be decoded' }; }
  }
  const op = String(prev.outpoint).split(':'), ptx = op[0], pidx = Number(op[1]);
  const ok = String(g.serial) === chain.serialFromOutpoint(ptx, pidx) && String(g.lineage).toLowerCase() === chain.genesisLineage(ptx, pidx) && BigInt(g.sales) === 0n && BigInt(g.price) === 0n && String(g.factory_covid).toLowerCase() === st.factory_covid;
  return ok ? { level: 'listed_and_derived', detail: 'listed in a lane mint; genesis state follows from the lane input' } : { level: 'mismatch', detail: 'the genesis state does not follow from the lane input of the mint' };
}

function claimFromLedger(ledger, i, opts) {
  const e = ledger.editions && ledger.editions[i], s = ledger.series;
  if (!e) throw new Error('edition not in ledger');
  return { reliks_claim: 1, network: (opts && opts.network) || 'testnet-10', covenantId: e.cov, state: { ownerIdentifier: e.owner, identifierType: 0, price: String(e.price), artist: s.artist, royalty_bips: String(s.royalty_bips), program_hash: s.program_hash, factory_covid: ledger.C, serial: String(e.serial), lineage: e.lineage, sales: String(e.sales) }, outpoint: e.txId + ':' + e.index, source: 'ledger' };
}
module.exports = { validateClaim, verifyClaim, claimFromLedger };
