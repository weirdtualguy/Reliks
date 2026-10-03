'use strict';
const fs = require('fs');
const CH = require('../web/reliks-chain.js'), plan = require('./plan.js');
CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' }));
const LP = 'v13/ledger-vm-v13.json';
if (!fs.existsSync(LP)) { console.log('SKIP no ledger'); process.exit(0); }
const LD = JSON.parse(fs.readFileSync(LP, 'utf8')), S = LD.series;
let bad = 0;
const t = (name, ok, detail) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' | ' + (detail || ''))); };
const state = { program_hash: S.program_hash, artist: S.artist, price: BigInt(S.price), royalty_bips: BigInt(S.royalty_bips), mints_left: BigInt(S.mints_left), engine_lang: BigInt(S.engine_lang), render_hash: S.render_hash };
const pubkey = '11'.repeat(32);
const mkP = (o) => Object.assign({
  hrp: 'kaspatest',
  lane: { state, spk: CH.p2shSpk(CH.factoryRedeem(state)), outpoint: { txId: 'cd'.repeat(32), index: 0 }, value: 100000000n, covenantId: LD.C, daa: 5n },
  funding: { txId: 'ab'.repeat(32), index: 1, amount: 10000000000n, daa: 5 },
  buyer: { pubkey, address: CH.p2pkAddress('kaspatest', pubkey) }
}, o || {});
const thrown = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };

let pl;
try { pl = plan.planMint(mkP()); } catch (e) { console.log('FAIL planMint threw: ' + e.message); process.exit(1); }
pl.checks.forEach((c) => t('plan ' + c.name, c.ok, c.detail));
t('plan reports size and fee', pl.size > 0 && pl.fee > 0n, pl.size + ' B fee ' + pl.fee);
t('explicit fee honored', plan.planMint(mkP({ fee: 5000000n })).fee >= 5000000n);

t('sold out throws', !!thrown(() => plan.planMint(mkP({ lane: Object.assign(mkP().lane, { state: Object.assign({}, state, { mints_left: 0n }) }) }))));
t('funding too small throws', !!thrown(() => plan.planMint(mkP({ funding: { txId: 'ab'.repeat(32), index: 1, amount: 100000000n, daa: 5 } }))));
t('address/key mismatch throws', !!thrown(() => plan.planMint(mkP({ buyer: { pubkey, address: CH.p2pkAddress('kaspatest', '22'.repeat(32)) } }))));
t('lane spk drift throws', !!thrown(() => plan.planMint(mkP({ lane: Object.assign(mkP().lane, { spk: 'aa20' + '00'.repeat(32) + '87' }) }))));

const good = JSON.parse(pl.safeJson);
good.inputs.forEach((i, k) => { if (pl.draft.inputs[k].utxo.sign) i.signatureScript = '41' + 'ab'.repeat(64) + '01'; });
const clone = () => JSON.parse(JSON.stringify(good));
t('untampered signed tx accepted', plan.checkSigned(pl.draft, clone()).ok, plan.checkSigned(pl.draft, clone()).error);
const flip = (s) => s.slice(0, 10) + (s[10] === '0' ? '1' : '0') + s.slice(11);
const T = [
  ['output value +1', (s) => { s.outputs[0].value = String(BigInt(s.outputs[0].value) + 1n); }],
  ['output script changed', (s) => { s.outputs[1].scriptPublicKey = flip(s.outputs[1].scriptPublicKey); }],
  ['output dropped', (s) => { s.outputs.pop(); }],
  ['covenant id changed', (s) => { s.outputs[0].covenant.covenantId = flip('00' + s.outputs[0].covenant.covenantId.slice(2)); }],
  ['covenant binding removed', (s) => { delete s.outputs[1].covenant; }],
  ['factory input script altered', (s) => { s.inputs[0].signatureScript = (s.inputs[0].signatureScript[0] === '0' ? '1' : '0') + s.inputs[0].signatureScript.slice(1); }],
  ['signature missing', (s) => { s.inputs[1].signatureScript = ''; }],
  ['extra input', (s) => { s.inputs.push(s.inputs[1]); }],
  ['wrong outpoint index', (s) => { s.inputs[1].previousOutpoint.index += 1; }],
  ['version changed', (s) => { s.version = 2; }],
];
T.forEach(([name, mut]) => { const s = clone(); mut(s); const r = plan.checkSigned(pl.draft, s); t('tamper rejected: ' + name, !r.ok, 'ACCEPTED'); });

const C = [['already in the mempool', 'duplicate'], ['WRPC TIMEOUT [x] after 15s', 'transient'], ['kascov 502 for covenant', 'transient'], ['read ECONNRESET', 'transient'], ['orphan transaction', 'stale'], ['missing outpoint in utxo set', 'stale'], ['transaction already spent', 'stale'], ['storage mass exceeds the limit', 'fatal'], ['something never seen', 'fatal'], ['', 'fatal'], ['under the required 777', 'fee'], ['insufficient fee', 'fee']];
C.forEach(([m, w]) => { const g = plan.classifyRejection(m); t('classify "' + m.slice(0, 30) + '" -> ' + w, g === w, g); });
console.log(bad ? 'PLAN TESTS FAILED' : 'PLAN TESTS OK');
process.exit(bad);
