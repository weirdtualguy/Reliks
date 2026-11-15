// GENERATED pattern: escrow expire (permissionless refund after the age lock).
// Testnet only. Usage: node audit-test/v13-fixed/expire-fixed.js
// Env: PC_NET=testnet, any key (no signature needed), RELIKS_LEDGER, RELIKS_ESCROW.
// The offer must have aged past expireAge; the full locked amount is refunded
// to the offerer at output 0.
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Esc = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const ESC = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), 'utf8'));
if (ESC.consumed || ESC.status === 'cancelled' || ESC.status === 'expired') throw new Error('escrow already spent (' + (ESC.status || ESC.consumed) + ')');
const st = ESC.state;
const escRedeem = B.concat([Esc.prefix, V.encState(Esc, st), Esc.suffix]);
const escSpk = V.p2sh(escRedeem);
if (escSpk !== ESC.spk) throw new Error('escrow spk drift vs ledger');
const TAG = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
// ageDaa lock (2026-11-14, PROVEN on testnet): silverc lowers
// `this.ageDaa >= expireAge` to a relative-locktime (sequence) check — the
// SPENDING input's sequence must be >= expireAge. Setting tx lockTime does
// NOT satisfy it (the VM always sees tx lockTime 0); the sequence does.
// The sighash commits to the sequence, so it must be set in hsInputs too.
const SEQ = Number(st.expireAge);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
  const escIn = { txId: ESC.txId, index: ESC.index, sequence: SEQ, spk: escSpk, amount: BigInt(ESC.locked) };
  const wIn = await pickUtxo();
  const hsInputs = [escIn, { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
  const inputs = [
    { previousOutpoint: { transactionId: escIn.txId, index: escIn.index }, signatureScript: '', sequence: SEQ, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ];
  function build(fee) {
    const outputs = [
      { amount: BigInt(ESC.locked), scriptPublicKey: '20' + st.offerer + 'ac' },
      { amount: BigInt(wIn.amount) - fee, scriptPublicKey: wIn.spk }
    ];
    inputs[0].signatureScript = hex(B.concat([pushMin(TAG('expire')), pushMin(escRedeem)]));
    inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId } = await feeLoop(build);
  await waitForConfirmation(txId);
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), JSON.stringify({ ...ESC, status: 'expired', consumed: txId }, null, 2));
  console.log('RELIKS V6 EXPIRE:', txId, '| refunded', ESC.locked, 'to offerer', st.offerer.slice(0, 16));
})().catch(e => { console.error(e); process.exit(1); });
