const fs = require('fs');
const OL = require('./offer-lib.js');
const V = require('./v8-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const secp = (() => { try { const s = require('@noble/secp256k1'); if (s.schnorr && s.schnorr.signSync) return s; } catch (e) {} const c = require('@noble/curves/secp256k1'); return { schnorr: { signSync: (m, p) => c.schnorr.sign(m, p) } }; })();
const B = Buffer;
const Esc = V.parts(JSON.parse(fs.readFileSync('data/escrow-abi-v4.json', 'utf8')));
const Ed = V.parts(JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), 'utf8'));
const ESC = JSON.parse(fs.readFileSync((process.env.RELIKS_ESCROW || 'data/escrow-ledger-v4.json'), 'utf8'));
const st = ESC.state;
const ed = LD.editions.find(e => e.cov === st.edition_covid);
if (!ed) throw new Error('edition not in ledger');
const askPrice = BigInt(st.askPrice);
const roy = askPrice * BigInt(st.royalty_bips) / 10000n;
const mktFee = askPrice * 100n / 10000n;
const ownerNet = askPrice - roy;
const escRedeem = B.concat([Esc.prefix, V.encState(Esc, st), Esc.suffix]);
const escSpk = V.p2sh(escRedeem);
if (escSpk !== ESC.spk) throw new Error('escrow spk drift vs ledger');
const curEdState = { ownerIdentifier: ed.owner, identifierType: 0, price: Number(askPrice), artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial };
const curEdRedeem = B.concat([Ed.prefix, V.encState(Ed, curEdState), Ed.suffix]);
const nextEdState = { ...curEdState, ownerIdentifier: st.offerer, price: 0 };
const nextEdRedeem = B.concat([Ed.prefix, V.encState(Ed, nextEdState), Ed.suffix]);
const TAG_ed = (n) => B.from(Ed.c.entries[n].dispatch_tag, 'hex');
const TAG_esc = (n) => B.from(Esc.c.entries[n].dispatch_tag, 'hex');
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {

  // ESC-INFO FIX (audit): wallet/priv preflight guard (same as deploy/mint)
  const RG = (() => { const fs2 = require('fs'); const src = fs2.readFileSync(__dirname + '/web/reliks-gallery-runtime.js', 'utf8'); return new Function('RB2B', 'REG', 'self', src + ';return self.ReliksGallery;')(require('@noble/hashes/blake2b').blake2b, { hrp: require('./network.js').hrp }, {}); })();
  if (V.WALLET !== RG.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }

  const edIn = { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curEdRedeem), amount: BigInt(ed.amount) };
  const escIn = { txId: ESC.txId, index: ESC.index, sequence: 0, spk: escSpk, amount: BigInt(ESC.locked) };
  const hsInputs = [edIn, escIn];
  const inputs = [
    { previousOutpoint: { transactionId: edIn.txId, index: edIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: escIn.txId, index: escIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 100 }
  ];
  function build(fee) {
    const outputs = [
      { amount: BigInt(ed.amount), scriptPublicKey: V.p2sh(nextEdRedeem), covenant: { authorizingInput: 0, covenantId: ed.cov } },
      { amount: ownerNet, scriptPublicKey: '20' + ed.owner + 'ac' },
      { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' },
      { amount: mktFee, scriptPublicKey: '20' + st.marketplace + 'ac' }
    ];
    const edSs = B.concat([pushMin(B.from(st.offerer, 'hex')), pushMinInt(1), pushMinInt(2), pushMin(TAG_ed('buy')), pushMin(curEdRedeem)]);
    const ownerSigRaw = secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV);
    const escSs = B.concat([pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMinInt(0), pushMinInt(1), pushMinInt(2), pushMinInt(3), pushMin(TAG_esc('accept')), pushMin(escRedeem)]);
    inputs[0].signatureScript = hex(edSs);
    inputs[1].signatureScript = hex(escSs);
    
    return rpc(inputs, outputs);
  }
  const { txId, fee } = await feeLoop(build);
  await waitForConfirmation(txId);
  ed.owner = st.offerer; ed.price = 0; ed.txId = txId; ed.index = 0; ed.spk = hex(V.p2sh(nextEdRedeem));
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), JSON.stringify(LD, null, 2));
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'data/escrow-ledger-v4.json'), JSON.stringify({ ...ESC, consumed: txId }, null, 2));
  console.log('RELIKS V4 ACCEPT:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString(), '| mktFee', mktFee.toString(), '| edition ->', st.offerer.slice(0, 16));
})().catch(e => { console.error(e); process.exit(1); });
