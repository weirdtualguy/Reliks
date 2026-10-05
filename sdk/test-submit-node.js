'use strict';
const { createNodeSubmit, prepare, DEFAULT_HEADERS } = require('./submit-node.js'), { submitSafe } = require('./submit.js'), plan = require('./plan.js');
let bad = 0;
const t = (name, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' | ' + d)); };
const SIG = '41' + 'cd'.repeat(64) + '01';
const mkTx = () => ({ version: 1, inputs: [{ previousOutpoint: { transactionId: 'ab'.repeat(32), index: 0 }, signatureScript: '0a0b', sequence: 0, sigOpCount: 0 }, { previousOutpoint: { transactionId: 'cd'.repeat(32), index: 1 }, signatureScript: SIG, sequence: 0, sigOpCount: 0 }],
  outputs: [{ value: 100000000, scriptPublicKey: '0000aa20' + 'ee'.repeat(32) + '87', covenant: { authorizingInput: 0, covenantId: '11'.repeat(32) } }, { value: 5000, scriptPublicKey: '000020' + '22'.repeat(32) + 'ac' }], lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '' });
const TX = mkTx(), before = JSON.stringify(TX), OKTX = 'ff'.repeat(32), U = ['wss://n1', 'wss://n2'];
const OKJ = JSON.stringify({ id: 1, method: 'submitTransaction', params: { transactionId: OKTX } });
function mk(replies, extra) { const calls = []; const call = async (u, m, p, h) => { calls.push({ u, m, p: JSON.stringify(p), h }); const r = replies[u]; if (r instanceof Error) throw r; return r; }; return { calls, ns: createNodeSubmit(Object.assign({ urls: U, send: true, call }, extra || {})) }; }
const thrown = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
(async () => {
  const p = prepare(TX);
  t('prepare ok on valid tx', p.ok && p.request.method === 'submitTransaction' && p.request.params.allowOrphan === false && p.bytes > 0, JSON.stringify(p.problems));
  t('allowOrphan option passes through', prepare(TX, { allowOrphan: true }).request.params.allowOrphan === true);
  t('request adds mass: 0 without changing the input tx', p.request.params.transaction.mass === 0 && TX.mass === undefined && JSON.stringify(Object.assign({}, p.request.params.transaction, { mass: undefined })) === JSON.stringify(Object.assign({}, TX, { mass: undefined })), JSON.stringify(Object.keys(p.request.params.transaction)));
  t('an explicit mass is kept', prepare(Object.assign({}, TX, { mass: 7 })).request.params.transaction.mass === 7);
  const V = (name, mut, frag) => { const x = mkTx(); mut(x); const r = prepare(x); t('prepare rejects: ' + name, !r.ok && r.problems.join(' ').indexOf(frag) >= 0, JSON.stringify(r.problems)); };
  V('value above 2^53', (x) => { x.outputs[0].value = 2 ** 53 + 2; }, 'output 0 value');
  V('zero value', (x) => { x.outputs[1].value = 0; }, 'output 1 value');
  V('fractional value', (x) => { x.outputs[1].value = 1.5; }, 'output 1 value');
  V('empty signature script', (x) => { x.inputs[0].signatureScript = ''; }, 'input 0 unsigned');
  V('no standard signature', (x) => { x.inputs[1].signatureScript = '00'; }, 'no standard signature');
  V('bad outpoint txid', (x) => { x.inputs[0].previousOutpoint.transactionId = 'zz'; }, 'input 0 outpoint');
  V('script without version prefix', (x) => { x.outputs[1].scriptPublicKey = '20' + '22'.repeat(32) + 'ac'; }, 'output 1 script');
  V('covenant authorizing input out of range', (x) => { x.outputs[0].covenant.authorizingInput = 5; }, 'output 0 covenant');
  V('no outputs', (x) => { x.outputs = []; }, 'no outputs');
  V('non-integer version', (x) => { x.version = '1'; }, 'version');
  t('prepare on null does not throw', prepare(null).ok === false);

  let m = mk({ 'wss://n1': OKJ }, { send: false });
  let e = await thrown(() => m.ns.submit(TX));
  t('dry run refuses and sends nothing', e && e.indexOf('dry run') === 0 && m.calls.length === 0, e + ' calls ' + m.calls.length);
  t('dry run classified fatal', plan.classifyRejection(e) === 'fatal', plan.classifyRejection(e));
  m = mk({ 'wss://n1': OKJ }); const bt = mkTx(); bt.outputs[0].value = -1;
  e = await thrown(() => m.ns.submit(bt));
  t('invalid tx never reaches the node', e && e.indexOf('refusing to submit') === 0 && m.calls.length === 0, e);
  t('refusal classified fatal', plan.classifyRejection(e) === 'fatal', plan.classifyRejection(e));

  m = mk({ 'wss://n1': OKJ });
  let r = await m.ns.submit(TX);
  t('first node accepts', r.txId === OKTX && r.url === 'wss://n1' && m.calls.length === 1, JSON.stringify(r));
  t('method and headers as in reliks-lib', m.calls[0].m === 'submitTransaction' && m.calls[0].h.Origin === DEFAULT_HEADERS.Origin, JSON.stringify(m.calls[0].h));

  m = mk({ 'wss://n1': 'TIMEOUT', 'wss://n2': OKJ });
  r = await m.ns.submit(TX);
  t('rotates after timeout, identical bytes', r.txId === OKTX && m.calls.length === 2 && m.calls[0].p === m.calls[1].p, m.calls.length);
  m = mk({ 'wss://n1': new Error('boom'), 'wss://n2': OKJ });
  r = await m.ns.submit(TX); t('rotates after a thrown error', r.txId === OKTX && m.calls.length === 2);
  m = mk({ 'wss://n1': JSON.stringify({ error: { message: 'insufficient fee: under the required 7000' } }), 'wss://n2': 'TIMEOUT' });
  e = await thrown(() => m.ns.submit(TX));
  t('all fail: messages joined, fee detected', e && e.indexOf('under the required 7000') >= 0 && plan.classifyRejection(e) === 'fee' && plan.parseRequiredFee(e) === 7000n, e);
  m = mk({ 'wss://n1': 'TIMEOUT', 'wss://n2': JSON.stringify({ error: { message: 'transaction is already in the mempool' } }) });
  e = await thrown(() => m.ns.submit(TX));
  t('timeout then duplicate -> duplicate', plan.classifyRejection(e) === 'duplicate', e);
  m = mk({ 'wss://n1': '{"id":1}', 'wss://n2': '<html>bad gateway</html>' });
  e = await thrown(() => m.ns.submit(TX));
  t('malformed replies throw, not txId', e && e.length > 0, e);
  m = mk({ 'wss://n1': JSON.stringify({ result: { transactionId: 'nothex' } }), 'wss://n2': OKJ });
  r = await m.ns.submit(TX); t('non-hex txId rejected, rotates', r.txId === OKTX && m.calls.length === 2);
  t('tx never mutated', JSON.stringify(TX) === before);
  t('empty urls throw', !!(await thrown(async () => createNodeSubmit({ urls: [] }))));

  const dry = createNodeSubmit({ urls: U, send: false, call: async () => { throw new Error('must not be called'); } });
  const sr = await submitSafe({ node: { submit: dry.submit, lookup: async () => 'unknown' }, rpcTx: TX, sleep: async () => {} });
  t('submitSafe + dry run -> rejected, one attempt', sr.state === 'rejected' && sr.attempts === 1, sr.state);
  m = mk({ 'wss://n1': 'TIMEOUT', 'wss://n2': 'TIMEOUT' });
  const sr2 = await submitSafe({ node: { submit: m.ns.submit, lookup: async () => 'absent' }, rpcTx: TX, maxAttempts: 2, sleep: async () => {} });
  t('submitSafe + all timeouts + absent -> exhausted, 4 identical sends', sr2.state === 'exhausted' && m.calls.length === 4 && m.calls.every((c) => c.p === m.calls[0].p), sr2.state + ' ' + m.calls.length);
  console.log(bad ? 'SUBMIT-NODE TESTS FAILED' : 'SUBMIT-NODE TESTS OK'); process.exit(bad);
})();
