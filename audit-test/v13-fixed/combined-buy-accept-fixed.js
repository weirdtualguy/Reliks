// Combined buy + accept in one tx (edition output ordering, 2026-11-14).
// Testnet only. Runs with TWO keys: PC_PRIV/PC_WALLET = owner (key1, signs
// the escrow), PC_PRIV2/PC_WALLET2 = buyer/offerer (key2, funds the buy).
// Usage: node audit-test/v13-fixed/combined-buy-accept-fixed.js <buyIdx> <acceptIdx>
// Setup (standard builders, before running this): both editions listed at
// 2 KAS; an offer from key2 exists on the accept edition (RELIKS_ESCROW).
//   NEGATIVE first: payment blocks swapped — the buy's payments sit after
//   the accept's edition instead of after its own. Must be REJECTED (the
//   buy's H1 rule: payments must be base+1, base+2).
//   POSITIVE: grouped layout [buyEd, buyOwner, buyRoy, accEd, accOwner,
//   accRoy, change]. Must SUCCEED — two covenant inputs, each with its own
//   contiguous payment block, in one tx.
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, waitForConfirmation, sighash, hex, pushMin, pushMinInt } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Ed = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/edition.json', 'utf8')));
const Esc = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger.json'), 'utf8'));
const ESC = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), 'utf8'));
const [,, buyIdxArg, accIdxArg] = process.argv;
const buyEd = LD.editions[Number(buyIdxArg)];
const accEd = LD.editions[Number(accIdxArg)];
if (!buyEd || !accEd) throw new Error('edition index not in ledger');
const st = ESC.state;
if (st.edition_covid !== accEd.cov) throw new Error('escrow is not for the accept edition');
const PRIV2 = process.env.PC_PRIV2, WALLET2 = process.env.PC_WALLET2;
if (!PRIV2 || !WALLET2) throw new Error('combined test needs PC_PRIV2 + PC_WALLET2 (buyer/offerer key)');
const USER2 = Buffer.from(schnorr.getPublicKey(PRIV2)).toString('hex');
if (USER2 !== st.offerer) throw new Error('PC_PRIV2 does not match the escrow offerer');
const price = BigInt(LD.series.price);
const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
const ownerNet = price - roy;
const TAG_E = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const TAG_S = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const H = (x) => B.from(x, 'hex');
const nextLin = (ed, nw) => B.from(V.blake2b(B.concat([B.from('ReliksLineageV2', 'utf8'), H(ed.lineage), H(nw)]), { dkLen: 32 })).toString('hex');
const stateOf = (ed, owner, pr, adv) => ({ ownerIdentifier: owner, identifierType: 0, price: pr, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: adv ? adv.lineage : ed.lineage, sales: adv ? adv.sales : ed.sales });
const redeemOf = (s) => B.concat([Ed.prefix, V.encState(Ed, s), Ed.suffix]);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
async function pickUtxo2() {
  const w = await (await fetch(V.rest + '/addresses/' + WALLET2 + '/utxos')).json();
  const conf = w.filter(x => x.utxoEntry.blockDaaScore);
  conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  if (!conf[0]) throw new Error('no confirmed UTXOs for buyer ' + WALLET2);
  return { txId: conf[0].outpoint.transactionId, index: conf[0].outpoint.index, sequence: 0, spk: '20' + USER2 + 'ac', amount: BigInt(conf[0].utxoEntry.amount) };
}
(async () => {
  const buyCur = stateOf(buyEd, buyEd.owner, Number(price));
  const accCur = stateOf(accEd, accEd.owner, Number(price));
  const buyNext = stateOf(buyEd, USER2, 0, { lineage: nextLin(buyEd, USER2), sales: buyEd.sales + 1 });
  const accNext = stateOf(accEd, st.offerer, 0, { lineage: nextLin(accEd, st.offerer), sales: accEd.sales + 1 });
  const buyRedeem = redeemOf(buyCur), accRedeem = redeemOf(accCur);
  const escRedeem = B.concat([Esc.prefix, V.encState(Esc, st), Esc.suffix]);
  const escSpk = V.p2sh(escRedeem);
  if (escSpk !== ESC.spk) throw new Error('escrow spk drift vs ledger');
  const buyFund = await pickUtxo2();
  if (buyFund.amount < price + 3000000n) throw new Error('buyer largest UTXO ' + buyFund.amount + ' cannot cover price + fee');
  const hsInputs = [
    { txId: buyEd.txId, index: buyEd.index, sequence: 0, spk: V.p2sh(buyRedeem), amount: BigInt(buyEd.amount) },
    { txId: buyFund.txId, index: buyFund.index, sequence: 0, spk: buyFund.spk, amount: buyFund.amount },
    { txId: accEd.txId, index: accEd.index, sequence: 0, spk: V.p2sh(accRedeem), amount: BigInt(accEd.amount) },
    { txId: ESC.txId, index: ESC.index, sequence: 0, spk: escSpk, amount: BigInt(ESC.locked) }
  ];
  const inputs = hsInputs.map((h, i) => ({ previousOutpoint: { transactionId: h.txId, index: h.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: i === 1 ? 10 : 100 }));
  const buildTx = (layout) => (fee) => {
    let outputs;
    if (layout === 'grouped') {
      outputs = [
        { amount: BigInt(buyEd.amount), scriptPublicKey: V.p2sh(redeemOf(buyNext)), covenant: { authorizingInput: 0, covenantId: buyEd.cov } },
        { amount: ownerNet, scriptPublicKey: '20' + buyEd.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: BigInt(accEd.amount), scriptPublicKey: V.p2sh(redeemOf(accNext)), covenant: { authorizingInput: 2, covenantId: accEd.cov } },
        { amount: ownerNet, scriptPublicKey: '20' + accEd.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: buyFund.amount - price - fee, scriptPublicKey: buyFund.spk }
      ];
      inputs[0].signatureScript = hex(B.concat([pushMin(H(USER2)), pushMinInt(1), pushMinInt(2), pushMin(TAG_E('buy')), pushMin(buyRedeem)]));
      inputs[2].signatureScript = hex(B.concat([pushMin(H(st.offerer)), pushMinInt(4), pushMinInt(5), pushMin(TAG_E('buy')), pushMin(accRedeem)]));
      inputs[3].signatureScript = hex(B.concat([pushMin(B.concat([secp.schnorr.signSync(sighash(hsInputs, outputs, 3), V.PRIV), B.from([0x01])])), pushMinInt(3), pushMinInt(4), pushMinInt(5), pushMin(TAG_S('accept')), pushMin(escRedeem)]));
    } else { // swapped: buy's payments after the accept's edition
      outputs = [
        { amount: BigInt(buyEd.amount), scriptPublicKey: V.p2sh(redeemOf(buyNext)), covenant: { authorizingInput: 0, covenantId: buyEd.cov } },
        { amount: BigInt(accEd.amount), scriptPublicKey: V.p2sh(redeemOf(accNext)), covenant: { authorizingInput: 2, covenantId: accEd.cov } },
        { amount: ownerNet, scriptPublicKey: '20' + accEd.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: ownerNet, scriptPublicKey: '20' + buyEd.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
        { amount: buyFund.amount - price - fee, scriptPublicKey: buyFund.spk }
      ];
      inputs[0].signatureScript = hex(B.concat([pushMin(H(USER2)), pushMinInt(4), pushMinInt(5), pushMin(TAG_E('buy')), pushMin(buyRedeem)]));
      inputs[2].signatureScript = hex(B.concat([pushMin(H(st.offerer)), pushMinInt(2), pushMinInt(3), pushMin(TAG_E('buy')), pushMin(accRedeem)]));
      inputs[3].signatureScript = hex(B.concat([pushMin(B.concat([secp.schnorr.signSync(sighash(hsInputs, outputs, 3), V.PRIV), B.from([0x01])])), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG_S('accept')), pushMin(escRedeem)]));
    }
    inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), B.from(PRIV2, 'hex'))) + '01';
    return rpc(inputs, outputs);
  };
  // ---- NEGATIVE: swapped payment blocks ----
  try {
    const { txId } = await feeLoop(buildTx('swapped'), 3000000n);
    console.log('!!! SWAPPED LAYOUT SUCCEEDED (tx ' + txId + ') — ORDERING NOT ENFORCED !!!');
    process.exit(1);
  } catch (e) {
    const m = String((e && e.message) || e);
    if (/failed to verify the signature script/i.test(m)) console.log('ORDERING HOLDS: swapped payment blocks rejected (script verification failed).');
    else { console.log('SWAPPED LAYOUT FAILED FOR ANOTHER REASON (test script bug?): ' + m.slice(0, 300)); process.exit(1); }
  }
  // ---- POSITIVE: grouped layout ----
  const { txId } = await feeLoop(buildTx('grouped'), 3000000n);
  await waitForConfirmation(txId);
  const nb = { lineage: nextLin(buyEd, USER2), sales: buyEd.sales + 1 };
  const na = { lineage: nextLin(accEd, st.offerer), sales: accEd.sales + 1 };
  buyEd.lineage = nb.lineage; buyEd.sales = nb.sales; buyEd.owner = USER2; buyEd.price = 0; buyEd.txId = txId; buyEd.index = 0; buyEd.spk = hex(V.p2sh(redeemOf(buyNext)));
  accEd.lineage = na.lineage; accEd.sales = na.sales; accEd.owner = st.offerer; accEd.price = 0; accEd.txId = txId; accEd.index = 3; accEd.spk = hex(V.p2sh(redeemOf(accNext)));
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger.json'), JSON.stringify(LD, null, 2));
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), JSON.stringify({ ...ESC, consumed: txId }, null, 2));
  console.log('COMBINED BUY+ACCEPT OK:', txId, '| buy ->', USER2.slice(0, 12), '| accept ->', st.offerer.slice(0, 12));
})().catch(e => { console.error(e); process.exit(1); });
