// Audit test C1 (FIXED v13, ISOLATED): decoy accept.
// Layout isolates the C1 binding: the edition's own buy is satisfied
// (payments at base+1/+2 = out 1,2), and the escrow's payments are ALSO
// satisfied (a second pair at out 4,5). The ONLY violation is the C1 rule:
// editionOutIdx (3, the unbound decoy) != OpAuthOutputIdx(edition, 0) (0).
// If the node rejects, the rejection is attributable to the C1 fix alone.
// Single submit via V.broadcastWithMsg, no retries. Key from env only.
const fs = require('fs');
const V = require('../../lib/reliks-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp } = V;
const LD = JSON.parse(fs.readFileSync('audit-test/v13-fixed/ledger.json', 'utf8'));
const ESC = JSON.parse(fs.readFileSync('audit-test/v13-fixed/escrow-ledger.json', 'utf8'));
const Ed = parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/edition.json', 'utf8')));
const Esc = parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const TAG_ed = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const TAG_esc = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const adv = (ed, buyer) => ({
  lineage: B.from(V.blake2b(B.concat([B.from('ReliksLineageV2', 'utf8'), H(ed.lineage), H(buyer)]), { dkLen: 32 })).toString('hex'),
  sales: ed.sales + 1
});
(async () => {
  const ed = LD.editions[0];
  const st = ESC.state;
  const askPrice = BigInt(st.askPrice);
  const roy = askPrice * BigInt(st.royalty_bips) / 10000n;
  const ownerNet = askPrice - roy;
  const curEdState = { ownerIdentifier: ed.owner, identifierType: 0, price: Number(askPrice), artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: ed.lineage, sales: ed.sales };
  const curEdRedeem = B.concat([Ed.prefix, encState(Ed, curEdState), Ed.suffix]);
  const nxReal = adv(ed, V.USER);
  const realEdState = { ...curEdState, ownerIdentifier: V.USER, price: 0, lineage: nxReal.lineage, sales: nxReal.sales };
  const realEdRedeem = B.concat([Ed.prefix, encState(Ed, realEdState), Ed.suffix]);
  const nxDecoy = adv(ed, st.offerer);
  const decoyEdState = { ...curEdState, ownerIdentifier: st.offerer, price: 0, lineage: nxDecoy.lineage, sales: nxDecoy.sales };
  const decoyEdRedeem = B.concat([Ed.prefix, encState(Ed, decoyEdState), Ed.suffix]);
  const escRedeem = B.concat([Esc.prefix, encState(Esc, st), Esc.suffix]);
  const escSpk = V.p2sh(escRedeem);
  if (escSpk !== ESC.spk) throw new Error('escrow spk drift vs ledger');
  if (hex(V.p2sh(curEdRedeem)) !== ed.spk) throw new Error('edition spk drift vs ledger');
  const edIn = { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curEdRedeem), amount: BigInt(ed.amount) };
  const escIn = { txId: ESC.txId, index: ESC.index, sequence: 0, spk: escSpk, amount: BigInt(ESC.locked) };
  const wIn = await pickUtxo();
  const fee = 3000000n;
  const inputs = [edIn, escIn, wIn];
  const outputs = [
    { amount: BigInt(ed.amount), scriptPublicKey: V.p2sh(realEdRedeem), covenant: { authorizingInput: 0, covenantId: ed.cov } },
    { amount: ownerNet, scriptPublicKey: '20' + ed.owner + 'ac' },
    { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
    { amount: BigInt(ed.amount), scriptPublicKey: V.p2sh(decoyEdRedeem) }, // DECOY at editionOutIdx=3, unbound
    { amount: ownerNet, scriptPublicKey: '20' + ed.owner + 'ac' },
    { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
    { amount: wIn.amount - BigInt(ed.amount) - ownerNet - roy - fee, scriptPublicKey: wIn.spk }
  ];
  const edSs = B.concat([pushMin(H(V.USER)), pushMinInt(1), pushMinInt(2), pushMin(TAG_ed('buy')), pushMin(curEdRedeem)]);
  const ownerSigRaw = secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV);
  const escSs = B.concat([pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMinInt(3), pushMinInt(4), pushMinInt(5), pushMin(TAG_esc('accept')), pushMin(escRedeem)]);
  const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 2), V.PRIV)) + '01';
  const rpcTx = { version: 1, inputs: [
    { previousOutpoint: { transactionId: ed.txId, index: ed.index }, signatureScript: hex(edSs), sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: ESC.txId, index: ESC.index }, signatureScript: hex(escSs), sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 11 }
  ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  console.log('C1 (fixed v13, isolated): real edition out=0, buy payments 1,2; decoy out=3, escrow payments 4,5');
  const r = await V.broadcastWithMsg(rpcTx);
  console.log('NODE VERDICT:', JSON.stringify(r));
  if (r.txId) console.log('C1 FIX FAILED: node accepted the decoy accept:', r.txId);
  else console.log('C1 FIX HOLDS: node rejected the decoy accept.');
})().catch(e => { console.error(e); process.exit(1); });
