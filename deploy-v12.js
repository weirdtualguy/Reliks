const fs = require('fs');
const OL = require('./reliks-lib.js');
const V = require('./reliks-lib.js');
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const need = ['feeLoop','waitForConfirmation','pickUtxo','sighash','hex','pushMin','pushMinInt'];
const missing = need.filter(k => typeof OL[k] !== 'function');
if (missing.length) { console.error('reliks-lib missing exports:', missing.join(', ')); process.exit(1); }
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex } = OL;
const covIdGenesis = require('./reliks-lib.js').covIdGenesis || V.covIdGenesis || OL.covIdGenesis;
if (typeof covIdGenesis !== 'function') { console.error('covIdGenesis unavailable in reliks-lib'); process.exit(1); }
const B = Buffer;
const F = V.parts(JSON.parse(fs.readFileSync((process.env.RELIKS_FACTORY_ABI || 'data/factory-abi-v12.json'), 'utf8')));
const ARGS_PATH = process.env.RELIKS_ARGS || 'data/factory-args-v12.json';
if (!fs.existsSync(ARGS_PATH)) { console.error('FATAL: ' + ARGS_PATH + ' not found. Generate it with: node gen-factory-args.js <series.json> (see docs/MAINNET-RUNBOOK.md)'); process.exit(1); }
const args = JSON.parse(fs.readFileSync(ARGS_PATH, 'utf8'));

  // H1-BAKE inline bake assertion
  const ENGINE=require(process.env.RELIKS_ENGINE||"./reliks-engine-mainnet.js");
  const engineBytes=B.from(ENGINE.ENGINE_SRC,"utf8");
  if(F.bc.indexOf(engineBytes)===-1){console.error("BAKE ASSERTION FAILED: compiled bytecode does not embed ENGINE_SRC");process.exit(1)}
const hxb = (i) => B.from(args[i].value).toString('hex');
const series = { program_hash: hxb(0), artist: hxb(1), price: args[2].value, royalty_bips: args[3].value, mints_left: args[4].value, engine_lang: args[6].value, render_hash: hxb(7) };
const redeem = B.concat([F.prefix, V.encState(F, series), F.suffix]);
const laneSpk = V.p2sh(redeem);
const covHex = (c) => typeof c === 'string' ? c : hex(c);
const prevOf = (inp) => ({ txId: inp.previous_outpoint_hash || inp.previousOutpoint.transactionId, index: inp.previous_outpoint_index !== undefined ? inp.previous_outpoint_index : inp.previousOutpoint.index });
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });
(async () => {
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
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v12.json'), JSON.stringify({ C, genesisTxId: txId, series, editions: [] }, null, 2));
  console.log('RELIKS V12 GENESIS:', txId, '| fee', fee.toString(), '| lane covenant C =', C);
})().catch(e => { console.error(e); process.exit(1); });
