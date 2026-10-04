'use strict';
// Resolves the live state of a single-lane series from a kascov lane record only (no REST, no key). Read-only.
// chain = web/reliks-chain.js initialized with the SERIES' OWN factory ABI (sdk/templates.js).
const OK_KINDS = ['genesis', 'transition'];
async function resolveLaneKascov(a) {
  const { chain, io, laneCovenantId, series } = a || {};
  if (!chain || !io || typeof io.covenant !== 'function') throw new Error('chain and io required');
  const checks = [], add = (n, ok, d) => checks.push({ name: n, ok: !!ok, detail: d || '' });
  const out = (status, extra) => Object.assign({ ok: status === 'resolved', status, checks }, extra || {});
  if (!/^[0-9a-f]{64}$/.test(String(laneCovenantId))) { add('lane_id', false, 'must be 64 lowercase hex'); return out('invalid_input'); }
  let rec;
  try { rec = await io.covenant(laneCovenantId); } catch (e) { add('kascov', false, String(e && e.message || e)); return out('unreachable'); }
  const us = Array.isArray(rec && rec.utxos) ? rec.utxos : [], evs = Array.isArray(rec && rec.events) ? rec.events : [];
  const odd = evs.filter((e) => !e || OK_KINDS.indexOf(e.kind) < 0);
  add('event_kinds', !odd.length, odd.length ? 'history contains "' + (odd[0] && odd[0].kind) + '" events' : '');
  if (odd.length) return out('complex_history');
  const live = us.filter((u) => u && u.live === true);
  add('single_live_output', live.length === 1, live.length + ' live outputs');
  if (live.length !== 1) return out(live.length === 0 ? 'no_live_output' : 'forked');
  const parts = String(live[0].outpoint).split(':'), liveTx = parts[0], liveIdx = Number(parts[1]);
  let state, source;
  if (liveTx === (rec && rec.genesis_txid)) {
    if (!series) { add('genesis_state', false, 'the lane is unspent since genesis; pass the series state'); return out('needs_genesis_state'); }
    try { state = { program_hash: String(series.program_hash).toLowerCase(), artist: String(series.artist).toLowerCase(), price: BigInt(series.price), royalty_bips: BigInt(series.royalty_bips), mints_left: BigInt(series.mints_left), engine_lang: BigInt(series.engine_lang), render_hash: String(series.render_hash).toLowerCase() }; }
    catch (e) { add('genesis_state', false, 'series state unusable'); return out('needs_genesis_state'); }
    source = 'series-genesis';
  } else {
    const prev = us.find((u) => u && u.spent_txid === liveTx && typeof u.revealed_hex === 'string' && u.revealed_hex);
    add('previous_state_available', !!prev, prev ? '' : 'no spent lane output with a revealed script was spent by the live output\'s transaction');
    if (!prev) return out('previous_state_unavailable');
    let st;
    try { st = chain.decodeFactoryState(prev.revealed_hex); } catch (e) { add('decode_previous', false, String(e && e.message || e).slice(0, 80)); return out('previous_state_unreadable'); }
    state = Object.assign({}, st, { mints_left: BigInt(st.mints_left) - 1n });
    if (state.mints_left < 0n) { add('mints_left', false, 'the previous state had no mints left'); return out('previous_state_unreadable'); }
    source = 'kascov-previous-output';
  }
  let exp;
  try { exp = chain.p2shSpk(chain.factoryRedeem(state)).toLowerCase(); } catch (e) { add('state_encodes', false, String(e && e.message || e).slice(0, 80)); return out('previous_state_unreadable'); }
  const liveSpk = chain.stripVersion(String(live[0].script_hex || '')).toLowerCase();
  add('script_matches_state', exp === liveSpk, exp === liveSpk ? '' : 'the script rebuilt from the derived state differs from the live output');
  if (exp !== liveSpk) return out('script_mismatch');
  const age = a.tipAgeSec, max = a.maxTipAgeSec == null ? 600 : a.maxTipAgeSec;
  if (!(typeof age === 'number' && isFinite(age) && age <= max)) { add('freshness', false, typeof age === 'number' ? 'tip age ' + age + ' s > ' + max : 'tip age not supplied'); return out('index_stale', { observed: 'resolved' }); }
  return out('resolved', { state, spk: exp, outpoint: { txId: liveTx, index: liveIdx }, value: BigInt(live[0].value), covenantId: laneCovenantId, source, soldOut: state.mints_left === 0n });
}
module.exports = { resolveLaneKascov };
