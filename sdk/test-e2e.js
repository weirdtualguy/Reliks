'use strict';
const fs = require('fs');
const CH = require('../web/reliks-chain.js'), plan = require('./plan.js');
const { submitSafe } = require('./submit.js'), { createNodeSubmit, prepare } = require('./submit-node.js');
const { createNodeLookup } = require('./node-lookup.js'), { confirmMined } = require('./flow.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
const LP = 'v13/ledger-vm-v13.json';
if (!fs.existsSync(LP)) { console.log('SKIP no ledger'); process.exit(0); }
const LD = JSON.parse(fs.readFileSync(LP, 'utf8')), S = LD.series;
let bad = 0;
const t = (name, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' | ' + d)); };
const thrown = async (fn) => { try { await fn(); return null; } catch (e) { return e.message; } };
const state = { program_hash: S.program_hash, artist: S.artist, price: BigInt(S.price), royalty_bips: BigInt(S.royalty_bips), mints_left: BigInt(S.mints_left), engine_lang: BigInt(S.engine_lang), render_hash: S.render_hash };
const pubkey = '11'.repeat(32), FUND_TX = 'ab'.repeat(32);
const mkP = (o) => Object.assign({
  hrp: 'kaspatest',
  lane: { state, spk: CH.p2shSpk(CH.factoryRedeem(state)), outpoint: { txId: 'cd'.repeat(32), index: 0 }, value: 100000000n, covenantId: LD.C, daa: 5n },
  funding: { txId: FUND_TX, index: 1, amount: 10000000000n, daa: 5 },
  buyer: { pubkey, address: CH.p2pkAddress('kaspatest', pubkey) }
}, o || {});
const fakeSign = (pl) => { const s = JSON.parse(pl.safeJson); s.inputs.forEach((i, k) => { if (pl.draft.inputs[k].utxo.sign) i.signatureScript = '41' + 'ab'.repeat(64) + '01'; }); return s; };

const A = 'kaspatest:qqtest', U = ['wss://n1', 'wss://n2'], TXID = 'ff'.repeat(32);
const OKJ = JSON.stringify({ id: 1, method: 'submitTransaction', params: { transactionId: TXID } });
const ERRJ = (m) => JSON.stringify({ error: { message: m } });
const utxoJson = (list) => JSON.stringify({ id: 1, method: 'getUtxosByAddresses', params: { entries: list.map(([tx, i]) => ({ address: A, outpoint: { transactionId: tx, index: i }, utxoEntry: { amount: '1' } })) } });
const memJson = () => JSON.stringify({ id: 1, method: 'getMempoolEntriesByAddresses', params: { entries: [{ address: A, receiving: [], sending: [] }] } });
const lookupFor = (list) => createNodeLookup({ urls: U, address: A, call: async (u, m) => (m === 'getUtxosByAddresses' ? utxoJson(list) : memJson()) });
const submitFor = (seq, opts) => {
  const calls = [];
  const call = async (u, m, p) => { calls.push(JSON.stringify(p)); const r = seq[Math.min(calls.length - 1, seq.length - 1)]; if (r instanceof Error) throw r; return r; };
  return { calls, submit: createNodeSubmit(Object.assign({ urls: U, send: true, call }, opts || {})).submit };
};
const noSleep = async () => {};

(async () => {
  const pl = plan.planMint(mkP());
  t('plan ok', pl.ok, JSON.stringify(pl.checks.filter((c) => !c.ok)));
  const signed = fakeSign(pl), chk = plan.checkSigned(pl.draft, signed);
  t('signed tx verified against the plan', chk.ok, chk.error);
  if (!chk.ok) { console.log('E2E ABORTED'); process.exit(1); }
  const rpcTx = chk.rpcTx;

  const pp = prepare(rpcTx);
  t('verified rpcTx passes prepare()', pp.ok, JSON.stringify(pp.problems));
  t('rpcTx outputs match the plan (count, values)', rpcTx.outputs.length === pl.draft.outputs.length && rpcTx.outputs.every((o, k) => o.value === Number(pl.draft.outputs[k].value)));
  t('covenant bindings carried through', rpcTx.outputs[0].covenant.covenantId === LD.C && rpcTx.outputs[1].covenant.covenantId === pl.summary.editionCovenantId && rpcTx.outputs[1].covenant.authorizingInput === 1);

  const tampered = fakeSign(pl); tampered.outputs[0].value = String(BigInt(tampered.outputs[0].value) + 1n);
  const ct = plan.checkSigned(pl.draft, tampered);
  t('tampered wallet tx rejected', !ct.ok, 'accepted');
  t('no rpcTx is produced for a rejected tx', ct.rpcTx === undefined);

  let s = submitFor([OKJ]);
  let r = await submitSafe({ node: { submit: s.submit, lookup: lookupFor([[TXID, 0], [TXID, 1]]) }, rpcTx, sleep: noSleep });
  t('happy path submits once', r.state === 'submitted' && r.txId === TXID && s.calls.length === 1, r.state + ' calls ' + s.calls.length);
  t('node received the verified tx plus mass 0 (allowOrphan false)', s.calls[0] === JSON.stringify({ transaction: Object.assign({}, rpcTx, { mass: 0 }), allowOrphan: false }));
  const cm = await confirmMined({ lookup: lookupFor([[TXID, 0], [TXID, 1]]), rpcTx, txId: r.txId, tries: 3, sleep: noSleep });
  t('confirmMined sees the tx outputs -> mined', cm.mined === true && cm.polls === 1, JSON.stringify(cm));

  s = submitFor(['TIMEOUT']);
  r = await submitSafe({ node: { submit: s.submit, lookup: lookupFor([]) }, rpcTx, sleep: noSleep });
  t('timeout with wallet input gone -> ambiguous, one round only', r.state === 'ambiguous' && s.calls.length === 2, r.state + ' calls ' + s.calls.length);

  s = submitFor(['TIMEOUT', 'TIMEOUT', OKJ]);
  r = await submitSafe({ node: { submit: s.submit, lookup: lookupFor([[FUND_TX, 1]]) }, rpcTx, sleep: noSleep });
  t('timeout, input unspent -> identical retry lands', r.state === 'submitted' && s.calls.length === 3 && s.calls.every((c) => c === s.calls[0]), r.state + ' calls ' + s.calls.length);

  s = submitFor([ERRJ('insufficient fee: under the required 9000000')]);
  r = await submitSafe({ node: { submit: s.submit, lookup: lookupFor([[FUND_TX, 1]]) }, rpcTx, currentFee: pl.fee, sleep: noSleep });
  t('fee rejection -> needs_rebuild with nextFee', r.state === 'needs_rebuild' && r.nextFee === 9900001n && s.calls.length === 2, r.state + ' ' + r.nextFee);
  const pl2 = plan.planMint(mkP({ fee: r.nextFee }));
  t('replan with nextFee passes all invariants', pl2.ok && pl2.fee === 9900001n, JSON.stringify(pl2.checks.filter((c) => !c.ok)));
  t('replanned tx differs from the first', pl2.safeJson !== pl.safeJson);

  s = submitFor([OKJ], { send: false });
  r = await submitSafe({ node: { submit: s.submit, lookup: lookupFor([[FUND_TX, 1]]) }, rpcTx, sleep: noSleep });
  t('default adapter is a dry run: nothing sent', r.state === 'rejected' && s.calls.length === 0, r.state + ' calls ' + s.calls.length);

  let sleeps = 0;
  const never = await confirmMined({ lookup: async () => 'absent', rpcTx, txId: TXID, tries: 4, sleep: async () => { sleeps++; } });
  t('confirmMined never mined -> mined false, polls bounded', never.mined === false && never.polls === 4 && sleeps === 3, JSON.stringify(never) + ' sleeps ' + sleeps);
  let n = 0;
  const late = await confirmMined({ lookup: async () => (++n < 3 ? 'mempool' : 'mined'), rpcTx, txId: TXID, tries: 5, sleep: noSleep });
  t('confirmMined mempool then mined', late.mined === true && late.polls === 3, JSON.stringify(late));
  const lt = await confirmMined({ lookup: async () => { throw new Error('boom'); }, rpcTx, txId: TXID, tries: 2, sleep: noSleep });
  t('confirmMined lookup throws -> not mined', lt.mined === false && lt.last === 'unknown', JSON.stringify(lt));
  t('confirmMined bad txId throws', !!(await thrown(() => confirmMined({ lookup: async () => 'mined', rpcTx, txId: 'nothex' }))));
  console.log(bad ? 'E2E FAILED' : 'E2E OK'); process.exit(bad);
})();
