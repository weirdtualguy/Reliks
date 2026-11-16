// GENERATED pattern: escrow cancel (M3 replacement, 2026-11-14). Testnet only.
// Usage: node cli/cancel.js
// Env: PC_NET=testnet, PC_PRIV/PC_WALLET = the OFFERER's key, RELIKS_LEDGER, RELIKS_ESCROW.
// The offerer withdraws their own stale offer at any time; the escrow UTXO is
// consumed and the full locked amount is refunded to the offerer.
const fs = require('fs');
const OL = require('../lib/reliks-lib.js');
const V = require('../lib/reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Esc = V.parts(JSON.parse(fs.readFileSync('contracts/escrow.json', 'utf8')));
const ESC = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW || 'data/escrow-ledger.json'), 'utf8'));
if (ESC.consumed || ESC.status === 'cancelled' || ESC.status === 'expired') throw new Error('escrow already spent (' + (ESC.status || ESC.consumed) + ')');
const st = ESC.state;
if (st.offerer !== V.USER) { console.error('cancel must run as the OFFERER (escrow offerer ' + st.offerer.slice(0, 16) + ', this key ' + V.USER.slice(0, 16) + ')'); process.exit(1); }
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
    // Builder-side assert (Claude low, 2026-11-14): `cancel` pins no output
    // in-script, so the builder must guarantee the refund goes to the
    // offerer — a bug here would burn the whole locked amount.
    if (outputs[0].scriptPublicKey !== '20' + st.offerer + 'ac' || outputs[0].amount !== BigInt(ESC.locked)) throw new Error('cancel output 0 must be the full refund to the offerer');
    const offererSigRaw = secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV);
    inputs[0].signatureScript = hex(B.concat([pushMin(B.concat([offererSigRaw, B.from([0x01])])), pushMin(TAG('cancel')), pushMin(escRedeem)]));
    inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId } = await feeLoop(build);
  await waitForConfirmation(txId);
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'data/escrow-ledger.json'), JSON.stringify({ ...ESC, status: 'cancelled', consumed: txId }, null, 2));
  console.log('RELIKS V6 CANCEL:', txId, '| refunded', ESC.locked, 'to offerer', st.offerer.slice(0, 16));
})().catch(e => { console.error(e); process.exit(1); });
