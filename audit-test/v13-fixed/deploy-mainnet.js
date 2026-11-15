// MAINNET variant of the v13-fixed builder (2026-11-14). Canonical contracts
// in contracts/ (ABIs: contracts/*.json). Requires PC_NET=mainnet +
// PC_MAINNET_WRPC. Never run with a testnet key.
if ((process.env.PC_NET || "") !== "mainnet") { console.error("mainnet scripts are mainnet-only: export PC_NET=mainnet"); process.exit(1); }
// Hash gate first: recompile the canonical contracts and hard-fail if any
// compiled hash differs from TEMPLATE-HASHES.json. Never deploy unverified.
const { spawnSync } = require('child_process');
const gate = spawnSync('node', ['tools/verify-contract.js'], { encoding: 'utf8' });
process.stdout.write(gate.stdout || ''); process.stderr.write(gate.stderr || '');
if (gate.status !== 0) { console.error('FATAL: verify-contract.js failed — refusing to deploy.'); process.exit(1); }
const fs = require('fs');
const OL = require('../../lib/reliks-lib.js');
const V = require('../../lib/reliks-lib.js');
const { schnorr } = require('@noble/curves/secp256k1');
const secp = { schnorr: { signSync: (m, p) => schnorr.sign(m, p) } };
const need = ['feeLoop','waitForConfirmation','pickUtxo','sighash','hex','pushMin','pushMinInt'];
const missing = need.filter(k => typeof OL[k] !== 'function');
if (missing.length) { console.error('reliks-lib missing exports:', missing.join(', ')); process.exit(1); }
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex } = OL;
const covIdGenesis = require('../../lib/reliks-lib.js').covIdGenesis || V.covIdGenesis || OL.covIdGenesis;
if (typeof covIdGenesis !== 'function') { console.error('covIdGenesis unavailable in reliks-lib'); process.exit(1); }
const B = Buffer;
const F = V.parts(JSON.parse(fs.readFileSync((process.env.RELIKS_FACTORY_ABI || 'contracts/factory.json'), 'utf8')));
const ARGS_PATH = process.env.RELIKS_ARGS || 'audit-test/v13-fixed/factory-args.json';
if (!fs.existsSync(ARGS_PATH)) { console.error('FATAL: ' + ARGS_PATH + ' not found. Generate it with: node gen-factory-args.js <series.json> (see docs/MAINNET-RUNBOOK-v13-fixed.md)'); process.exit(1); }
const args = JSON.parse(fs.readFileSync(ARGS_PATH, 'utf8'));

  // H1-BAKE inline bake assertion
  const ENGINE=require(process.env.RELIKS_ENGINE?require("path").resolve(process.env.RELIKS_ENGINE):"../../lib/reliks-engine-mainnet.js");
  const engineBytes=ENGINE.ENGINE_BYTES?B.from(ENGINE.ENGINE_BYTES):B.from(ENGINE.ENGINE_SRC,"utf8");
  if(F.bc.indexOf(engineBytes)===-1){console.error("BAKE ASSERTION FAILED: compiled bytecode does not embed ENGINE_SRC");process.exit(1)}
const hxb = (i) => B.from(args[i].value).toString('hex');
const series = { program_hash: hxb(0), artist: hxb(1), price: args[2].value, royalty_bips: args[3].value, mints_left: args[4].value, engine_lang: args[6].value, render_hash: hxb(7), next_serial: args[11].value };
// Genesis validation (audit fix 2026-11-14): the factory script cannot check
// its own constructor, so the deploy tooling must — artist key, royalty
// 500..2000, mints_left > 0, program_hash == blake2b(engine_code).
const GV = require('../../tools/verify-contract.js');
const gvErrs = GV.validateFactoryArgs(args);
if (gvErrs.length) { console.error('GENESIS VALIDATION FAILED:'); gvErrs.forEach(e => console.error('  - ' + e)); process.exit(1); }
console.log('GENESIS VALIDATION OK (artist/royalty/mints/program_hash/next_serial)');
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
  await waitForConfirmation(txId, 600000);
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'audit-test/v13-fixed/ledger-mainnet.json'), JSON.stringify({ C, genesisTxId: txId, series, editions: [] }, null, 2));
  console.log('RELIKS V12 GENESIS:', txId, '| fee', fee.toString(), '| lane covenant C =', C);
})().catch(e => { console.error(e); process.exit(1); });
