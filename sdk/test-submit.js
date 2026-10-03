'use strict';
const plan = require('./plan.js'), { submitSafe } = require('./submit.js');
let bad = 0;
const t = (name, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' | ' + d)); };
const TX = { version: 1, inputs: [{ previousOutpoint: { transactionId: 'ab'.repeat(32), index: 1 }, signatureScript: '00' }], outputs: [{ value: 1 }] };
const before = JSON.stringify(TX), OK = { txId: 'ff'.repeat(32) }, E = (m) => new Error(m);
function mkNode(subs, looks) {
  const n = { calls: [], looks: 0 };
  n.submit = async (x) => { n.calls.push(JSON.stringify(x)); const s = subs[Math.min(n.calls.length - 1, subs.length - 1)]; if (s instanceof Error) throw s; return s; };
  n.lookup = async () => { const l = looks[Math.min(n.looks++, looks.length - 1)]; if (l instanceof Error) throw l; return l; };
  return n;
}
async function c(name, subs, looks, want, extra) {
  const n = mkNode(subs, looks);
  const r = await submitSafe(Object.assign({ node: n, rpcTx: TX, sleep: async () => {}, currentFee: 1000n }, extra || {}));
  const same = n.calls.every((x) => x === before);
  const ok = r.state === want.state && n.calls.length === want.calls && same && (want.mined === undefined || r.mined === want.mined) && (want.nextFee === undefined || r.nextFee === want.nextFee) && (want.looks === undefined || n.looks === want.looks);
  t(name + ' -> ' + r.state, ok, JSON.stringify({ state: r.state, calls: n.calls.length, same, mined: r.mined, nextFee: String(r.nextFee), looks: n.looks }));
}
(async () => {
  await c('success', [OK], [], { state: 'submitted', calls: 1, mined: false, looks: 0 });
  await c('fee rejection, rebuild not retry', [E('insufficient fee: under the required 7000')], [], { state: 'needs_rebuild', calls: 1, nextFee: 7701n, looks: 0 });
  await c('fee without number doubles current', [E('insufficient fee')], [], { state: 'needs_rebuild', calls: 1, nextFee: 2000n });
  await c('duplicate, in mempool', [E('transaction is already in the mempool')], ['mempool'], { state: 'already_known', calls: 1 });
  await c('duplicate, lookup unknown', [E('already in the mempool')], ['unknown'], { state: 'ambiguous', calls: 1 });
  await c('duplicate, lookup absent', [E('already in the mempool')], ['absent'], { state: 'ambiguous', calls: 1 });
  await c('timeout but tx mined (sales-3 case)', [E('WRPC TIMEOUT after 15s')], ['mined'], { state: 'landed', calls: 1, mined: true });
  await c('timeout, absent, retry identical bytes succeeds', [E('WRPC TIMEOUT'), OK], ['absent'], { state: 'submitted', calls: 2 });
  await c('timeout, lookup unknown stops', [E('kascov 502')], ['unknown'], { state: 'ambiguous', calls: 1 });
  await c('always transient + absent exhausts', [E('ECONNRESET')], ['absent'], { state: 'exhausted', calls: 3 });
  await c('stale, tx actually mined', [E('missing outpoint in utxo set')], ['mined'], { state: 'landed', calls: 1, mined: true });
  await c('stale, absent', [E('orphan transaction')], ['absent'], { state: 'stale', calls: 1 });
  await c('stale, unknown', [E('orphan transaction')], ['unknown'], { state: 'ambiguous', calls: 1 });
  await c('fatal, no lookup, no retry', [E('storage mass exceeds the limit')], [], { state: 'rejected', calls: 1, looks: 0 });
  await c('lookup throws -> unknown', [E('WRPC TIMEOUT')], [E('boom')], { state: 'ambiguous', calls: 1 });
  await c('submit returns no txId, tx mined', [{}], ['mined'], { state: 'landed', calls: 1, mined: true });
  await c('submit returns no txId, unknown', [{}], ['unknown'], { state: 'ambiguous', calls: 1 });
  await c('maxAttempts 1 respected', [E('ECONNRESET')], ['absent'], { state: 'exhausted', calls: 1 }, { maxAttempts: 1 });
  let threw = false; try { await submitSafe({ node: {}, rpcTx: TX }); } catch (e) { threw = true; }
  t('bad node throws', threw);
  t('rpcTx never mutated', JSON.stringify(TX) === before);
  console.log(bad ? 'SUBMIT TESTS FAILED' : 'SUBMIT TESTS OK'); process.exit(bad);
})();
