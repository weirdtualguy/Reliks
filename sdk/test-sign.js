'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { schnorr } = require('@noble/curves/secp256k1');
const S = require('./sign.js');
const VF = path.join(__dirname, 'sighash-vectors.json');
if (!fs.existsSync(VF)) { console.log('SKIP no sighash vectors'); process.exit(0); }
let bad = 0;
const t = (n, ok, d) => { if (!ok) bad = 1; console.log((ok ? 'PASS ' : 'FAIL ') + n + (ok ? '' : ' | ' + d)); };
const thrown = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const hexOf = (u) => Buffer.from(u).toString('hex'), H = (c) => c.repeat(64);
const toDraft = (c) => ({ version: 1, lockTime: 0n, gas: 0n, payload: '', inputs: c.inputs.map((i) => ({ txId: i.txId, index: i.index, sequence: BigInt(i.sequence), sigScript: '', utxo: { amount: BigInt(i.amount), spk: i.spk, sign: false } })), outputs: c.outputs.map((o) => ({ value: BigInt(o.amount), spk: o.scriptPublicKey, covenant: o.covenant })) });
const VEC = JSON.parse(fs.readFileSync(VF, 'utf8'));
let eq = 0; VEC.cases.forEach((c) => { if (S.sigHash(toDraft(c), c.idx).toString('hex') === c.expected) eq++; });
t('sigHash equals reliks-lib sighash on ' + VEC.cases.length + ' recorded transactions', eq === VEC.cases.length, eq + ' of ' + VEC.cases.length);
const privA = crypto.randomBytes(32).toString('hex'), privB = crypto.randomBytes(32).toString('hex');
const pubOf = (p) => hexOf(schnorr.getPublicKey(Uint8Array.from(Buffer.from(p, 'hex'))));
const pubA = pubOf(privA);
const base = () => ({ version: 1, lockTime: 0n, gas: 0n, payload: '', inputs: [
  { txId: H('a'), index: 0, sequence: 0n, sigScript: 'aabb', utxo: { amount: 100000000n, spk: 'aa20' + H('1') + '87', sign: false } },
  { txId: H('b'), index: 1, sequence: 0n, sigScript: '', utxo: { amount: 5000000000n, spk: '20' + pubA + 'ac', sign: true } }],
  outputs: [{ value: 100000000n, spk: 'aa20' + H('3') + '87', covenant: { authorizingInput: 0, covenantId: H('4') } }, { value: 100000000n, spk: 'aa20' + H('5') + '87', covenant: { authorizingInput: 1, covenantId: H('6') } }, { value: 7n, spk: '20' + H('7') + 'ac' }] });
const h0 = S.sigHash(base(), 1).toString('hex');
const chg = (name, mut) => { const d = base(); mut(d); t('hash changes: ' + name, S.sigHash(d, 1).toString('hex') !== h0, 'unchanged'); };
chg('output value', (d) => { d.outputs[2].value = 8n; });
chg('output script', (d) => { d.outputs[2].spk = '20' + H('8') + 'ac'; });
chg('covenant id', (d) => { d.outputs[0].covenant.covenantId = H('9'); });
chg('covenant authorizing input', (d) => { d.outputs[1].covenant.authorizingInput = 0; });
chg('covenant removed', (d) => { delete d.outputs[1].covenant; });
chg('output dropped', (d) => { d.outputs.pop(); });
chg('other input outpoint', (d) => { d.inputs[0].txId = H('c'); });
chg('signed input amount', (d) => { d.inputs[1].utxo.amount += 1n; });
chg('signed input script', (d) => { d.inputs[1].utxo.spk = '20' + H('d') + 'ac'; });
chg('sequence', (d) => { d.inputs[1].sequence = 1n; });
{ const d = base(); d.inputs[0].sigScript = 'ccddee'; t('hash ignores signature scripts', S.sigHash(d, 1).toString('hex') === h0); }
t('different input, different hash', S.sigHash(base(), 0).toString('hex') !== h0);
t('index out of range throws', !!thrown(() => S.sigHash(base(), 2)) && !!thrown(() => S.sigHash(base(), -1)));
{ const d = base(); d.version = 2; t('version 2 throws', !!thrown(() => S.sigHash(d, 1))); }
{ const d = base(); d.lockTime = 5n; t('lockTime throws', !!thrown(() => S.sigHash(d, 1))); }
{ const d = base(); d.payload = 'ab'; t('payload throws', !!thrown(() => S.sigHash(d, 1))); }
const ss = S.signInput(base(), 1, privA);
t('signature script format 41 + 64 bytes + 01', /^41[0-9a-f]{128}01$/.test(ss), ss.length);
t('signature verifies over the sighash', schnorr.verify(Uint8Array.from(Buffer.from(ss.slice(2, 130), 'hex')), new Uint8Array(S.sigHash(base(), 1)), Uint8Array.from(Buffer.from(pubA, 'hex'))));
t('non-wallet input refused', !!thrown(() => S.signInput(base(), 0, privA)));
t('wrong key refused', !!thrown(() => S.signInput(base(), 1, privB)));
t('malformed key refused', !!thrown(() => S.signInput(base(), 1, 'zz')) && !!thrown(() => S.signInput(base(), 1, '11'.repeat(31))));
const CH = require('../web/reliks-chain.js'), plan = require('./plan.js');
let ok = true;
try { CH.init(require('../reliks-templates.js')({ editionAbi: 'edition-abi-v13.json' })); } catch (e) { ok = false; console.log('SKIP plan-based signing test: ' + e.message); }
if (ok) {
  const st = { program_hash: H('1'), artist: H('2'), price: 100000000n, royalty_bips: 500n, mints_left: 5n, engine_lang: 2n, render_hash: H('3') };
  const mkP = () => ({ hrp: 'kaspatest', lane: { state: st, spk: CH.p2shSpk(CH.factoryRedeem(st)), outpoint: { txId: H('c'), index: 0 }, value: 100000000n, covenantId: H('9'), daa: 5n }, funding: { txId: H('d'), index: 1, amount: 10000000000n, daa: 5 }, buyer: { pubkey: pubA, address: CH.p2pkAddress('kaspatest', pubA) } });
  const pl = plan.planMint(mkP());
  t('plan for the test key is ok', pl.ok, JSON.stringify(pl.checks.filter((c) => !c.ok)));
  const signed = S.signWallet(CH, pl.draft, privA), chk = plan.checkSigned(pl.draft, signed);
  t('signWallet output passes checkSigned', chk.ok, chk.error);
  const sg = signed.inputs[1].signatureScript;
  t('wallet input signed, lane input script untouched', /^41[0-9a-f]{128}01$/.test(sg) && signed.inputs[0].signatureScript === pl.draft.inputs[0].sigScript);
  t('signature verifies over the plan sighash', schnorr.verify(Uint8Array.from(Buffer.from(sg.slice(2, 130), 'hex')), new Uint8Array(S.sigHash(pl.draft, 1)), Uint8Array.from(Buffer.from(pubA, 'hex'))));
  t('signWallet with the wrong key throws', !!thrown(() => S.signWallet(CH, pl.draft, privB)));
  const tam = JSON.parse(JSON.stringify(signed)); tam.outputs[0].value = String(BigInt(tam.outputs[0].value) + 1n);
  t('tampered signed tx is rejected by checkSigned', !plan.checkSigned(pl.draft, tam).ok);
}
console.log(bad ? 'SIGN TESTS FAILED' : 'SIGN TESTS OK'); process.exit(bad);
