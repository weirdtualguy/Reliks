// IN-01 attack test (2026-11-15, phase 9): two identical escrows spent together
// in ONE expire tx, sharing a single refund output; the second coin's 2.1 KAS
// goes to the tx builder. Testnet only. With the fix this MUST be REJECTED
// (escrow E's refund must sit at output[1], its own input index, but output[1]
// is the change). Without the fix it MINES (the old expire pinned output[0]).
// Env: PC_NET=testnet, any key (expire is permissionless), RELIKS_ESCROW_D/E.
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, pickUtxo, sighash, hex, pushMin } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Esc = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const D = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW_D || 'audit-test/v13-fixed/escrow-in01-d.json'), 'utf8'));
const E = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW_E || 'audit-test/v13-fixed/escrow-in01-e.json'), 'utf8'));
if (D.spk !== E.spk) throw new Error('offers are not identical (different escrow spk)');
const st = D.state;
const escRedeem = B.concat([Esc.prefix, V.encState(Esc, st), Esc.suffix]);
const escSpk = V.p2sh(escRedeem);
if (escSpk !== D.spk) throw new Error('escrow spk drift vs ledger');
const TAG = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const SEQ = Number(st.expireAge);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
  const escD = { txId: D.txId, index: D.index, sequence: SEQ, spk: escSpk, amount: BigInt(D.locked) };
  const escE = { txId: E.txId, index: E.index, sequence: SEQ, spk: escSpk, amount: BigInt(E.locked) };
  const wIn = await pickUtxo();
  const hsInputs = [escD, escE, { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
  const inputs = [
    { previousOutpoint: { transactionId: escD.txId, index: escD.index }, signatureScript: '', sequence: SEQ, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: escE.txId, index: escE.index }, signatureScript: '', sequence: SEQ, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ];
  function build(fee) {
    const outputs = [
      { amount: BigInt(D.locked), scriptPublicKey: '20' + st.offerer + 'ac' },
      { amount: BigInt(wIn.amount) - fee, scriptPublicKey: wIn.spk },
      { amount: BigInt(E.locked), scriptPublicKey: wIn.spk } // second coin to the builder (the theft)
    ];
    inputs[0].signatureScript = hex(B.concat([pushMin(TAG('expire')), pushMin(escRedeem)]));
    inputs[1].signatureScript = hex(B.concat([pushMin(TAG('expire')), pushMin(escRedeem)]));
    inputs[2].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 2), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId } = await feeLoop(build);
  console.log('!!! DOUBLE-EXPIRE SUCCEEDED (tx ' + txId + ') — IN-01 NOT FIXED !!!');
  process.exit(1);
})().catch(e => {
  const m = String((e && e.message) || e);
  if (/failed to verify the signature script/i.test(m)) console.log('IN-01 HOLDS: double-expire rejected (script verification failed).');
  else { console.log('DOUBLE-EXPIRE FAILED FOR ANOTHER REASON (test script bug?): ' + m.slice(0, 400)); process.exit(1); }
});
