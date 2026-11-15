// Cancel with the WRONG key must be rejected (two-party test, 2026-11-14).
// Testnet only. Env: PC_PRIV/PC_WALLET = a NON-offerer key (key1),
// RELIKS_ESCROW = an offer whose offerer is key2.
// The escrow's cancel entry checks checkSig(offererSig, pubkey(offerer)),
// so a signature from any other key must fail script verification.
// The offer must SURVIVE (the rejected tx consumes nothing).
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, pickUtxo, sighash, hex, pushMin } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Esc = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const ESC = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), 'utf8'));
if (ESC.consumed || ESC.status === 'cancelled' || ESC.status === 'expired') throw new Error('escrow already spent (' + (ESC.status || ESC.consumed) + ')');
const st = ESC.state;
if (st.offerer === V.USER) throw new Error('this test needs a NON-offerer key (offerer is ' + st.offerer.slice(0, 16) + ', this key is the same) — run under the other key');
const escRedeem = B.concat([Esc.prefix, V.encState(Esc, st), Esc.suffix]);
const escSpk = V.p2sh(escRedeem);
if (escSpk !== ESC.spk) throw new Error('escrow spk drift vs ledger');
const TAG = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
  const escIn = { txId: ESC.txId, index: ESC.index, sequence: 0, spk: escSpk, amount: BigInt(ESC.locked) };
  const wIn = await pickUtxo();
  const hsInputs = [escIn, { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
  const inputs = [
    { previousOutpoint: { transactionId: escIn.txId, index: escIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ];
  function build(fee) {
    const outputs = [
      { amount: BigInt(ESC.locked), scriptPublicKey: '20' + st.offerer + 'ac' },
      { amount: BigInt(wIn.amount) - fee, scriptPublicKey: wIn.spk }
    ];
    // Deliberately signed by the NON-offerer (this key) — must fail checkSig.
    const wrongSigRaw = secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV);
    inputs[0].signatureScript = hex(B.concat([pushMin(B.concat([wrongSigRaw, B.from([0x01])])), pushMin(TAG('cancel')), pushMin(escRedeem)]));
    inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  try {
    const { txId } = await feeLoop(build);
    console.log('!!! WRONG-KEY CANCEL SUCCEEDED (tx ' + txId + ') — ANYONE CAN CANCEL ANYONE\'S OFFER !!!');
    process.exit(1);
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/failed to verify the signature script/i.test(m)) console.log('WRONG-KEY CANCEL HOLDS: node rejected the non-offerer cancel (script verification failed). Offer survives.');
    else { console.log('WRONG-KEY CANCEL FAILED FOR ANOTHER REASON (test script bug?): ' + m.slice(0, 300)); process.exit(1); }
  }
})().catch(e => { console.error(e); process.exit(1); });
