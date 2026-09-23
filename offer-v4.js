const fs = require('fs');
const OL = require('./offer-lib.js');
const V = require('./v8-lib.js');
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const secp = (() => { try { const s = require('@noble/secp256k1'); if (s.schnorr && s.schnorr.signSync) return s; } catch (e) {} const c = require('@noble/curves/secp256k1'); return { schnorr: { signSync: (m, p) => c.schnorr.sign(m, p) } }; })();
const B = Buffer;
const [,, edIdxArg, askArg, expireArg] = process.argv;
const Esc = V.parts(JSON.parse(fs.readFileSync('data/escrow-abi-v4.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), 'utf8'));
const ed = LD.editions[Number(edIdxArg)];
if (!ed) throw new Error('edition not in ledger');
const askPrice = BigInt(askArg);
  // ESC-INFO FIX (audit): ensure ledger agrees edition is listed at askPrice before locking funds
  if (BigInt(ed.price) !== askPrice) { console.error('ESC-INFO GUARD: edition not listed at askPrice (ledger price=' + ed.price + ', offer=' + askPrice + '). Refusing to lock funds in an un-accept-able escrow.'); process.exit(1); }
const mktFee = askPrice * 100n / 10000n;
const state = { ownerIdentifier: ed.owner, identifierType: 0, edition_covid: ed.cov, askPrice: Number(askPrice), expireAge: Number(expireArg || 100000), artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, offerer: V.USER, marketplace: LD.series.treasury };
const redeem = B.concat([Esc.prefix, V.encState(Esc, state), Esc.suffix]);
const spk = V.p2sh(redeem);
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {

  // ESC-INFO FIX (audit): wallet/priv preflight guard (same as deploy/mint)
  const RG = (() => { const fs2 = require('fs'); const src = fs2.readFileSync(__dirname + '/web/reliks-gallery-runtime.js', 'utf8'); return new Function('RB2B', 'REG', 'self', src + ';return self.ReliksGallery;')(require('@noble/hashes/blake2b').blake2b, { hrp: require('./network.js').hrp }, {}); })();
  if (V.WALLET !== RG.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }

  const wIn = await pickUtxo();
  const FEE_BUFFER = 5000000n; // audit4: 2-input accept pays miner fee from this buffer
const locked = askPrice + mktFee + FEE_BUFFER;
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
  fs.writeFileSync((process.env.RELIKS_ESCROW || 'data/escrow-ledger-v4.json'), JSON.stringify({ txId, index: 0, spk, locked: Number(locked), state }, null, 2));
  console.log('RELIKS V4 OFFER:', txId, '| locked', locked.toString(), '| ask', askPrice.toString(), '| mktFee', mktFee.toString(), '| escrow', spk.slice(0, 16) + '...');
})().catch(e => { console.error(e); process.exit(1); });
