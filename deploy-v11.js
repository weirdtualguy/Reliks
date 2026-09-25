const fs = require('fs');
const OL = require('./reliks-lib.js');
const V = require('./reliks-lib.js');
const secp = (() => { try { const s = require('@noble/secp256k1'); if (s.schnorr && s.schnorr.signSync) return s; } catch (e) {} const c = require('@noble/curves/secp256k1'); return { schnorr: { signSync: (m, p) => c.schnorr.sign(m, p) } }; })();
const need = ['feeLoop','waitForConfirmation','pickUtxo','sighash','hex','pushMin','pushMinInt'];
const missing = need.filter(k => typeof OL[k] !== 'function');
if (missing.length) { console.error('offer-lib missing exports:', missing.join(', ')); process.exit(1); }
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex } = OL;
const covIdGenesis = require('./reliks-lib.js').covIdGenesis || V.covIdGenesis || OL.covIdGenesis;
if (typeof covIdGenesis !== 'function') { console.error('covIdGenesis unavailable in v7/v8/offer libs'); process.exit(1); }
const B = Buffer;
const F = V.parts(JSON.parse(fs.readFileSync((process.env.RELIKS_FACTORY_ABI || 'data/factory-abi-v11.json'), 'utf8')));
const args = JSON.parse(fs.readFileSync((process.env.RELIKS_ARGS || 'data/factory-args-v11.json'), 'utf8'));

  // H1-BAKE inline bake assertion
  const ENGINE=require(process.env.RELIKS_ENGINE||"./reliks-engine-v10.js");
  const engineBytes=B.from(ENGINE.ENGINE_SRC,"utf8");
  if(F.bc.indexOf(engineBytes)===-1){console.error("BAKE ASSERTION FAILED: compiled bytecode does not embed ENGINE_SRC");process.exit(1)}
const hxb = (i) => B.from(args[i].value).toString('hex');
const series = { program_hash: hxb(0), artist: hxb(1), price: args[2].value, royalty_bips: args[3].value, mints_left: args[4].value, engine_lang: args[6].value, render_hash: hxb(7), treasury: hxb(8) };
const redeem = B.concat([F.prefix, V.encState(F, series), F.suffix]);
const laneSpk = V.p2sh(redeem);
const covHex = (c) => typeof c === 'string' ? c : hex(c);
const prevOf = (inp) => ({ txId: inp.previous_outpoint_hash || inp.previousOutpoint.transactionId, index: inp.previous_outpoint_index !== undefined ? inp.previous_outpoint_index : inp.previousOutpoint.index });
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
const RG = (() => { const fs2 = require('fs'); const src = fs2.readFileSync(__dirname + '/web/reliks-gallery-runtime.js', 'utf8'); return new Function('RB2B', 'REG', 'self', src + ';return self.ReliksGallery;')(require('@noble/hashes/blake2b').blake2b, { hrp: require('./network.js').hrp }, {}); })();
if (V.WALLET !== RG.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }
(async () => {
  // Self-test: covIdGenesis(walletInput, [{idx}]) must reproduce series-2 edition #0 cov
  if (fs.existsSync('data/factory-ledger-v10.json')) {
  const LD2 = JSON.parse(fs.readFileSync('data/factory-ledger-v10.json', 'utf8'));
  const m0 = await (await fetch(V.rest + '/transactions/' + LD2.editions[0].txId)).json();
  const w0 = prevOf(m0.inputs[1]);
  const edOut0 = m0.outputs[1];
  const edScript0 = (() => { const x = edOut0.script_public_key || edOut0.scriptPublicKey; return typeof x === 'string' ? x : (x.scriptPublicKey || ''); })();
  const t = covHex(covIdGenesis(w0.txId, w0.index, [{ idx: 1, value: Number(edOut0.amount), script: edScript0 }]));
  if (t !== LD2.editions[0].cov) { console.error('covIdGenesis self-test FAILED:', t, '!=', LD2.editions[0].cov); process.exit(1); }
  console.log('covIdGenesis self-test OK vs series-2 edition #0');
  } else {
    console.log('covIdGenesis self-test skipped: anchor ledger data/factory-ledger-v10.json absent');
  }
  const wIn = await pickUtxo();
  console.log('funding deploy from', wIn.txId.slice(0, 10) + '...:' + wIn.index, '| amount', (Number(wIn.amount) / 1e8) + ' KAS');
  const C = covHex(covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: 100000000, script: laneSpk }]));
  const hsInputs = [{ txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }];
  const inputs = [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }];
  function build(fee) {
    const outputs = [
      { amount: 100000000n, scriptPublicKey: laneSpk, covenant: { authorizingInput: 0, covenantId: C } },
      { amount: BigInt(wIn.amount) - 100000000n - fee, scriptPublicKey: wIn.spk }
    ];
    inputs[0].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 0), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId, fee } = await feeLoop(build);
  await waitForConfirmation(txId);
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), JSON.stringify({ C, genesisTxId: txId, series, editions: [] }, null, 2));
  console.log('RELIKS V11 GENESIS:', txId, '| fee', fee.toString(), '| lane covenant C =', C);
})().catch(e => { console.error(e); process.exit(1); });
