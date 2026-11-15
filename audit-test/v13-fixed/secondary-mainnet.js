// MAINNET variant of the v13-fixed builder (2026-11-14). Canonical contracts
// in contracts/ (ABIs: contracts/*.json). Requires PC_NET=mainnet +
// PC_MAINNET_WRPC. Never run with a testnet key.
if ((process.env.PC_NET || "") !== "mainnet") { console.error("mainnet scripts are mainnet-only: export PC_NET=mainnet"); process.exit(1); }
// Hash gate first: recompile the canonical contracts and hard-fail if any
// compiled hash differs from TEMPLATE-HASHES.json. Never trade unverified.
const { spawnSync } = require('child_process');
const gate = spawnSync('node', ['tools/verify-contract.js'], { encoding: 'utf8' });
process.stdout.write(gate.stdout || ''); process.stderr.write(gate.stderr || '');
if (gate.status !== 0) { console.error('FATAL: verify-contract.js failed — refusing to run.'); process.exit(1); }
const V = require('../../lib/reliks-lib.js');
const { B, hex, H, pushMin, pushMinInt, sighash, parts, encState, pickUtxo, secp, fs, feeLoop, waitForConfirmation } = V;
const [,, cmd, kArg, priceArg] = process.argv;
const k = parseInt(kArg || '0', 10);
(async () => {


  const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), 'utf8'));
  const Ed = parts(JSON.parse(fs.readFileSync((process.env.RELIKS_EDITION_ABI || 'contracts/edition.json'), 'utf8')));
  const TAG = n => H(Ed.c.entries[n].dispatch_tag);
  const ed = LD.editions[k];
  if (!ed) throw new Error('edition ' + k + ' not in ledger');
  const DUST = BigInt(ed.amount);
  const stateOf = (owner, price, adv) => ({ ownerIdentifier: owner, identifierType: 0, price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial, lineage: adv ? adv.lineage : ed.lineage, sales: adv ? adv.sales : ed.sales });
  const advOf = nw => { const a = { lineage: B.from(V.blake2b(B.concat([B.from('ReliksLineageV2', 'utf8'), H(ed.lineage), H(nw)]), { dkLen: 32 })).toString('hex'), sales: ed.sales + 1 }; if (process.env.NEG === 'sales') a.sales = ed.sales; if (process.env.NEG === 'lineage') a.lineage = ed.lineage; return a; };
  const redeemOf = st => B.concat([Ed.prefix, encState(Ed, st), Ed.suffix]);
  const curRedeem = redeemOf(stateOf(ed.owner, ed.price));
  const edIn = { txId: ed.txId, index: ed.index, sequence: 0, spk: V.p2sh(curRedeem), amount: DUST };
  if (ed.spk && hex(edIn.spk) !== ed.spk) throw new Error('F-B17 template drift: ledger spk ' + ed.spk.slice(0, 18) + '... != recomputed ' + hex(edIn.spk).slice(0, 18) + '... — on-chain edition bound to a different template than the on-disk ABI');
  const rpc = (inputs, outputs, ssHex, sigW) => ({ version: 1, inputs: [
    { previousOutpoint: { transactionId: edIn.txId, index: edIn.index }, signatureScript: ssHex, sequence: 0, sigOpCount: 0, computeBudget: 100 },
    { previousOutpoint: { transactionId: inputs[1].txId, index: inputs[1].index }, signatureScript: sigW, sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ], outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
  if (cmd === 'list') {
    const newPrice = BigInt(priceArg);
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(fee) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(ed.owner, newPrice))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: wIn.amount - fee, scriptPublicKey: wIn.spk }
      ];
      const rawSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
      const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMinInt(newPrice), pushMin(B.concat([rawSig, B.from([0x01])])), pushMin(TAG('list')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId, 600000);
    ed.price = Number(newPrice); ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS V12 LIST:', txId, '| edition', ed.cov.slice(0, 16), '| newPrice', newPrice.toString());
  } else if (cmd === 'buy') {
    const price = BigInt(ed.price);
    if (price < 100000000n) throw new Error('not listed or below MIN_PRICE (1 KAS)');
    const roy = price * BigInt(LD.series.royalty_bips) / 10000n;
    const ownerNet = price - roy;
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    const ownerSpk = '20' + ed.owner + 'ac';
    const artistSpk = '20' + LD.series.artist + 'ac';
    function build(feeTx) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(V.USER, 0, advOf(V.USER)))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: ownerNet, scriptPublicKey: ownerSpk },
        { amount: roy, scriptPublicKey: artistSpk },
        { amount: wIn.amount - price - feeTx, scriptPublicKey: wIn.spk }
      ];
      const sigW = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(H(V.USER)), pushMinInt(1), pushMinInt(2), pushMin(TAG('buy')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId, 600000);
    const nx = advOf(V.USER); ed.lineage = nx.lineage; ed.sales = nx.sales; ed.owner = V.USER; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS V12 BUY:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString());
  } else if (cmd === 'unlist') {
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(fee) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(ed.owner, 0))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: wIn.amount - fee, scriptPublicKey: wIn.spk }
      ];
      const rawSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
      const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(B.concat([rawSig, B.from([0x01])])), pushMin(TAG('unlist')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS UNLIST:', txId);
  } else if (cmd === 'transfer') {
    const newOwner = String(priceArg || '');
    if (!/^[0-9a-f]{64}$/.test(newOwner)) throw new Error('transfer needs a 64-hex x-only pubkey as the 3rd argument');
    const nx = { ...advOf(newOwner), sales: ed.sales };
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(fee) {
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(newOwner, 0, nx))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        { amount: wIn.amount - fee, scriptPublicKey: wIn.spk }
      ];
      const rawSig = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
      const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(H(newOwner)), pushMin(B.concat([rawSig, B.from([0x01])])), pushMin(TAG('transfer')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId);
    ed.lineage = nx.lineage; ed.owner = newOwner; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS TRANSFER:', txId, '| newOwner', newOwner.slice(0, 16));
  } else if (cmd === 'sell') {
    const askPrice = BigInt(priceArg);
    if (askPrice < 100000000n) throw new Error('askPrice below MIN_PRICE (1 KAS)');
    const roy = askPrice * BigInt(LD.series.royalty_bips) / 10000n;
    const ownerNet = askPrice - roy;
    const buyer = V.USER;
    const wIn = await pickUtxo();
    const inputs = [edIn, wIn];
    function build(feeTx) {
      const payOuts = askPrice === 0n ? [] : [
        { amount: ownerNet, scriptPublicKey: '20' + ed.owner + 'ac' },
        { amount: roy, scriptPublicKey: '20' + LD.series.artist + 'ac' }
      ];
      const outputs = [
        { amount: DUST, scriptPublicKey: V.p2sh(redeemOf(stateOf(buyer, 0, advOf(buyer)))), covenant: { authorizingInput: 0, covenantId: ed.cov } },
        ...payOuts,
        { amount: wIn.amount - askPrice - feeTx, scriptPublicKey: wIn.spk }
      ];
      const ownerSigRaw = secp.schnorr.signSync(sighash(inputs, outputs, 0), V.PRIV);
      const sigW1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), V.PRIV)) + '01';
      const ss = B.concat([pushMin(H(buyer)), pushMinInt(askPrice), pushMinInt(1), pushMinInt(2), pushMin(B.concat([ownerSigRaw, B.from([0x01])])), pushMin(TAG('sell')), pushMin(curRedeem)]);
      return rpc(inputs, outputs, hex(ss), sigW1);
    }
    const { txId } = await feeLoop(build);
    await waitForConfirmation(txId, 600000);
    const nx = advOf(buyer); ed.lineage = nx.lineage; ed.sales = nx.sales; ed.owner = buyer; ed.price = 0; ed.txId = txId; ed.index = 0;
    ed.spk = hex(V.p2sh(redeemOf(stateOf(ed.owner, ed.price))));
    fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), JSON.stringify(LD, null, 2));
    console.log('RELIKS V12 SELL:', txId, '| ownerNet', ownerNet.toString(), '| royalty', roy.toString());
  } else { console.error('usage: node cli/secondary-v12.js <list|buy|sell> <edIdx> [priceSompi]'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
