// Audit test H1 (FIXED v13): double-buy with one payment pair.
// With the H1 fix each edition's buy requires ownerOutIdx == base+1 and
// artistOutIdx == base+2, where base is that input's authorized output.
// Ed0 (base 0) needs payments at 1,2; ed1 (base 1) needs 2,3 — the shared
// pair (2,3) cannot satisfy both. Expect the node to REJECT this tx.
// Single submit via V.broadcastWithMsg, no retries. Key from env only.
const fs = require('fs');
const V = require('../../lib/reliks-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp } = V;
const LD = JSON.parse(fs.readFileSync('audit-test/v13-fixed/ledger.json', 'utf8'));
const Ed = parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/edition.json', 'utf8')));
const TAG = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const adv = (ed, buyer) => ({
  lineage: B.from(V.blake2b(B.concat([B.from('ReliksLineageV2', 'utf8'), H(ed.lineage), H(buyer)]), { dkLen: 32 })).toString('hex'),
  sales: ed.sales + 1
});
(async () => {
  const buyer = V.USER;
  const eds = LD.editions.slice(0, 2);
  const inputs = [];
  const outputs = [];
  const sigscripts = [];
  for (let i = 0; i < 2; i++) {
    const ed = eds[i];
    const st = { ownerIdentifier: ed.owner, identifierType: 0, price: Number(ed.price), artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: ed.lineage, sales: ed.sales };
    const curRedeem = B.concat([Ed.prefix, encState(Ed, st), Ed.suffix]);
    if (hex(V.p2sh(curRedeem)) !== ed.spk) throw new Error('edition ' + i + ' spk drift vs ledger');
    inputs.push({ txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curRedeem), amount: BigInt(ed.amount) });
    const nx = adv(ed, buyer);
    const nxState = { ...st, ownerIdentifier: buyer, price: 0, lineage: nx.lineage, sales: nx.sales };
    const nxRedeem = B.concat([Ed.prefix, encState(Ed, nxState), Ed.suffix]);
    outputs.push({ amount: BigInt(ed.amount), scriptPublicKey: V.p2sh(nxRedeem), covenant: { authorizingInput: i, covenantId: ed.cov } });
    sigscripts.push(B.concat([pushMin(H(buyer)), pushMinInt(2), pushMinInt(3), pushMin(TAG('buy')), pushMin(curRedeem)]));
  }
  const price = BigInt(eds[0].price);
  const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
  const ownerNet = price - roy;
  outputs.push({ amount: ownerNet, scriptPublicKey: '20' + eds[0].owner + 'ac' });
  outputs.push({ amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' });
  const wIn = await pickUtxo();
  const fee = 3000000n;
  // change = funding − the single payment pair − fee (the 2 KAS carriers
  // are recycled into the two new edition outputs)
  outputs.push({ amount: wIn.amount - price - fee, scriptPublicKey: wIn.spk });
  inputs.push(wIn);
  const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 2), V.PRIV)) + '01';
  const rpcTx = { version: 1, inputs: inputs.map((inp, i) => ({
    previousOutpoint: { transactionId: inp.txId, index: inp.index },
    signatureScript: i < 2 ? hex(sigscripts[i]) : sigW, sequence: 0, sigOpCount: 0, computeBudget: i < 2 ? 100 : 11
  })), outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  console.log('H1 (fixed v13): double-buy, one payment pair at out 2,3 for two editions');
  const r = await V.broadcastWithMsg(rpcTx);
  console.log('NODE VERDICT:', JSON.stringify(r));
  if (r.txId) console.log('H1 FIX FAILED: node accepted the shared-pair double-buy:', r.txId);
  else console.log('H1 FIX HOLDS: node rejected the double-buy.');
})().catch(e => { console.error(e); process.exit(1); });
