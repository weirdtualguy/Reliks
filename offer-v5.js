const fs = require('fs');
const OL = require('./reliks-lib.js');
const V = require('./reliks-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const B = Buffer;
const [,, edIdxArg, askArg, expireArg] = process.argv;
const Esc = V.parts(JSON.parse(fs.readFileSync('data/escrow-abi-v5.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v12.json'), 'utf8'));
const ed = LD.editions[Number(edIdxArg)];
if (!ed) throw new Error('edition not in ledger');
const askPrice = BigInt(askArg);
  // ESC-INFO FIX (audit): ensure ledger agrees edition is listed at askPrice before locking funds
  if (BigInt(ed.price) !== askPrice) { console.error('ESC-INFO GUARD: edition not listed at askPrice (ledger price=' + ed.price + ', offer=' + askPrice + '). Refusing to lock funds in an un-accept-able escrow.'); process.exit(1); }
const FEE_BUFFER = 10000000n; // 0.1 KAS miner fee slack
const state = { ownerIdentifier: ed.owner, identifierType: 0, edition_covid: ed.cov, askPrice: Number(askPrice), expireAge: Number(expireArg || 100000), artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, offerer: V.USER };
const redeem = B.concat([Esc.prefix, V.encState(Esc, state), Esc.suffix]);
const spk = V.p2sh(redeem);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {


  const wIn = await pickUtxo();
  const FEE_BUFFER = 10000000n; // audit: 10M for headroom on large engines // audit4: 2-input accept pays miner fee from this buffer
const locked = askPrice + FEE_BUFFER;
  const hsInputs = [{ txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
  const inputs = [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }];
  function build(fee) {
    const outputs = [
      { amount: locked, scriptPublicKey: spk },
      { amount: BigInt(wIn.amount) - locked - fee, scriptPublicKey: wIn.spk }
    ];
    inputs[0].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId, fee } = await feeLoop(build);
  await waitForConfirmation(txId);
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'data/escrow-ledger-v5.json'), JSON.stringify({ txId, index: 0, spk, locked: Number(locked), state }, null, 2));
  console.log('RELIKS V5 OFFER:', txId, '| locked', locked.toString(), '| ask', askPrice.toString(), '| escrow', spk.slice(0, 16) + '...');
})().catch(e => { console.error(e); process.exit(1); });
