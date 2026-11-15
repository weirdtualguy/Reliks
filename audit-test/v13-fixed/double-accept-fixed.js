// Two escrow accepts sharing ONE royalty output (H1 in the escrow, 2026-11-14).
// Testnet only. Env: PC_PRIV/PC_WALLET = owner (key1, signs both escrows),
// PC_PRIV2/PC_WALLET2 = offerer (key2, funded both offers).
// Usage: node audit-test/v13-fixed/double-accept-fixed.js <edIdxA> <edIdxB>
//   --escrow-a <file> --escrow-b <file>
// Setup (standard builders): both editions listed at 2 KAS, one offer from
// key2 on each (separate escrow ledgers).
//   ATTACK: one tx accepts both offers with a single shared royalty output
//   at index 2. Must be REJECTED. Attribution is dual by construction: the
//   second escrow's H1 rule requires royaltyOutIdx == editionOutIdx + 2 = 5
//   (got 2), and the second edition's buy requires artistOutIdx == 5 too —
//   the shared royalty cannot satisfy both, which is the point.
//   No positive variant here: the honest accepts were already proven
//   individually (accept-fixed.js) and jointly with a buy (combined test).
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, sighash, hex, pushMin, pushMinInt } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Ed = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/edition.json', 'utf8')));
const Esc = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger.json'), 'utf8'));
const ai = process.argv.indexOf('--escrow-a'), bi = process.argv.indexOf('--escrow-b');
if (ai < 0 || bi < 0) throw new Error('usage: double-accept-fixed.js <edA> <edB> --escrow-a <file> --escrow-b <file>');
const ESCA = JSON.parse(fs.readFileSync(process.argv[ai + 1], 'utf8'));
const ESCB = JSON.parse(fs.readFileSync(process.argv[bi + 1], 'utf8'));
const edA = LD.editions[Number(process.argv[2])];
const edB = LD.editions[Number(process.argv[3])];
if (!edA || !edB) throw new Error('edition index not in ledger');
if (ESCA.state.edition_covid !== edA.cov || ESCB.state.edition_covid !== edB.cov) throw new Error('escrow/edition mismatch');
const price = BigInt(LD.series.price);
const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
const ownerNet = price - roy;
const TAG_E = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const TAG_S = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const H = (x) => B.from(x, 'hex');
const stateOf = (ed, owner, pr) => ({ ownerIdentifier: owner, identifierType: 0, price: pr, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: ed.lineage, sales: ed.sales });
const redeemOf = (s) => B.concat([Ed.prefix, V.encState(Ed, s), Ed.suffix]);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
  const escRedeemA = B.concat([Esc.prefix, V.encState(Esc, ESCA.state), Esc.suffix]);
  const escRedeemB = B.concat([Esc.prefix, V.encState(Esc, ESCB.state), Esc.suffix]);
  if (V.p2sh(escRedeemA) !== ESCA.spk || V.p2sh(escRedeemB) !== ESCB.spk) throw new Error('escrow spk drift vs ledger');
  const hsInputs = [
    { txId: edA.txId, index: edA.index, sequence: 0, spk: V.p2sh(redeemOf(stateOf(edA, edA.owner, Number(price)))), amount: BigInt(edA.amount) },
    { txId: ESCA.txId, index: ESCA.index, sequence: 0, spk: V.p2sh(escRedeemA), amount: BigInt(ESCA.locked) },
    { txId: edB.txId, index: edB.index, sequence: 0, spk: V.p2sh(redeemOf(stateOf(edB, edB.owner, Number(price)))), amount: BigInt(edB.amount) },
    { txId: ESCB.txId, index: ESCB.index, sequence: 0, spk: V.p2sh(escRedeemB), amount: BigInt(ESCB.locked) }
  ];
  const inputs = hsInputs.map((h) => ({ previousOutpoint: { transactionId: h.txId, index: h.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 }));
  function build(fee) {
    // Shared royalty at output 2 serves BOTH accepts; the second accept's
    // edition sits at output 3, so its H1 rule wants royalty at 5.
    // (The fee is covered by the two escrows' 10M buffers: 2x 10M = 20M.)
    const outputs = [
      { amount: BigInt(edA.amount), scriptPublicKey: V.p2sh(redeemOf({ ...stateOf(edA, edA.owner, Number(price)), ownerIdentifier: ESCA.state.offerer, price: 0 })), covenant: { authorizingInput: 0, covenantId: edA.cov } },
      { amount: ownerNet, scriptPublicKey: '20' + edA.owner + 'ac' },
      { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
      { amount: BigInt(edB.amount), scriptPublicKey: V.p2sh(redeemOf({ ...stateOf(edB, edB.owner, Number(price)), ownerIdentifier: ESCB.state.offerer, price: 0 })), covenant: { authorizingInput: 2, covenantId: edB.cov } },
      { amount: ownerNet, scriptPublicKey: '20' + edB.owner + 'ac' }
    ];
    inputs[0].signatureScript = hex(B.concat([pushMin(H(ESCA.state.offerer)), pushMinInt(1), pushMinInt(2), pushMin(TAG_E('buy')), pushMin(redeemOf(stateOf(edA, edA.owner, Number(price))))]));
    inputs[1].signatureScript = hex(B.concat([pushMin(B.concat([secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV), B.from([0x01])])), pushMinInt(0), pushMinInt(1), pushMinInt(2), pushMin(TAG_S('accept')), pushMin(escRedeemA)]));
    inputs[2].signatureScript = hex(B.concat([pushMin(H(ESCB.state.offerer)), pushMinInt(4), pushMinInt(2), pushMin(TAG_E('buy')), pushMin(redeemOf(stateOf(edB, edB.owner, Number(price))))]));
    inputs[3].signatureScript = hex(B.concat([pushMin(B.concat([secp.schnorr.signSync(sighash(hsInputs, outputs, 3), V.PRIV), B.from([0x01])])), pushMinInt(3), pushMinInt(4), pushMinInt(2), pushMin(TAG_S('accept')), pushMin(escRedeemB)]));
    return rpc(inputs, outputs);
  }
  try {
    const { txId } = await feeLoop(build, 3000000n);
    console.log('!!! SHARED-ROYALTY DOUBLE-ACCEPT SUCCEEDED (tx ' + txId + ') — THE ESCROW H1 FIX DOES NOT HOLD !!!');
    process.exit(1);
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/failed to verify the signature script/i.test(m)) console.log('ESCROW H1 HOLDS: two accepts sharing one royalty output rejected (script verification failed).');
    else { console.log('DOUBLE-ACCEPT FAILED FOR ANOTHER REASON (test script bug?): ' + m.slice(0, 300)); process.exit(1); }
  }
})().catch(e => { console.error(e); process.exit(1); });
