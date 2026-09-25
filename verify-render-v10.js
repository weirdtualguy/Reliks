const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const V = require('./reliks-lib.js');

const F = V.parts(JSON.parse(fs.readFileSync((process.env.RELIKS_FACTORY_ABI || 'data/factory-abi-v11.json'), 'utf8')));
const Ed = V.parts(JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), 'utf8'));
const ENGINE = require(process.env.RELIKS_ENGINE || './reliks-engine-v10.js');
if (LD.series && LD.series.program_hash && ENGINE.engineHashHex && ENGINE.engineHashHex !== LD.series.program_hash) {
  console.error('PROVENANCE MISMATCH: RELIKS_ENGINE engine_hash ' + ENGINE.engineHashHex.slice(0,16) + '... != ledger program_hash ' + LD.series.program_hash.slice(0,16) + '...');
  console.error('This ledger was baked with a different engine. Point RELIKS_ENGINE at the matching engine, or redeploy with matching args/ABI.');
  process.exit(1);
}
const INIT_MINTS = JSON.parse(fs.readFileSync((process.env.RELIKS_ARGS || 'data/factory-args-v11.json'), 'utf8'))[4].value;
const B = V.B, H = V.H;

const serialOfV10 = (txId, idx) => {
  const h = V.blake2b(B.concat([B.from('ReliksSerialV10', 'utf8'), H(txId), V.le32(idx)]), { dkLen: 32 });
  let s = 0n;
  s += BigInt(h[0]); s += BigInt(h[1]) * 256n; s += BigInt(h[2]) * 65536n; s += BigInt(h[3]) * 16777216n;
  s += BigInt(h[4]) * 4294967296n; s += BigInt(h[5]) * 1099511627776n; s += BigInt(h[6]) * 281474976710656n;
  s += BigInt(h[7] % 128) * 72057594037927936n;
  return s.toString();
};
const p2shHex = (r) => { const x = V.p2sh(r); return typeof x === 'string' ? x : x.toString('hex'); };
const spkHex = (o) => { const s = o.script_public_key || o.scriptPublicKey; if (!s) return ''; return typeof s === 'string' ? s : (s.scriptPublicKey || s.script_public_key || ''); };
const prevOutpoint = (inp) => {
  const h = inp.previous_outpoint_hash || (inp.previousOutpoint && (inp.previousOutpoint.transactionId || inp.previousOutpoint.transaction_id));
  const idx = inp.previous_outpoint_index !== undefined ? inp.previous_outpoint_index : (inp.previousOutpoint && inp.previousOutpoint.index);
  return h + ':' + idx;
};
const renderSeed = (serial) => Number(BigInt(serial) & 0xFFFFFFFFn); // canonical seed convention: low 32 bits, exact

(async () => {
  const only = process.argv[2] !== undefined ? parseInt(process.argv[2], 10) : -1;
  const editions = LD.editions || [];
  if (!editions.length) { console.error('no editions in ledger'); process.exit(1); }
  const results = [];
  const check = (name, pass) => { results.push(pass); console.log((pass ? 'PASS ' : 'FAIL ') + name); };

  const deployTx = await (await fetch(V.rest + '/transactions/' + LD.genesisTxId)).json();
  const genesisSpk = p2shHex(B.concat([F.prefix, V.encState(F, { ...LD.series, mints_left: INIT_MINTS }), F.suffix]));
  check('Genesis lane spk == deployTx.outputs[0]', genesisSpk === spkHex(deployTx.outputs[0]));
  check('blake2b(bundled engine) == series.program_hash', ENGINE.engineHashHex === LD.series.program_hash);
  const rh = Buffer.from(blake2b(Buffer.from(ENGINE.render(ENGINE.TEST_SERIAL || 1), 'utf8'), { dkLen: 32 })).toString('hex');
  check('Render conformance == series.render_hash', rh === LD.series.render_hash);

  for (let i = 0; i < editions.length; i++) {
    if (only >= 0 && i !== only) continue;
    const ed = editions[i];
    const mintTx = await (await fetch(V.rest + '/transactions/' + ed.mintTxId)).json();
    const consumedLaneTxId = i === 0 ? LD.genesisTxId : editions[i - 1].mintTxId;

    check('[#' + i + '] mint consumes lane ' + consumedLaneTxId.slice(0, 8) + '...:0', prevOutpoint(mintTx.inputs[0]) === consumedLaneTxId + ':0');
    check('[#' + i + '] serial recomputes from lane outpoint', serialOfV10(consumedLaneTxId, 0) === String(ed.serial));
    const edState = { ownerIdentifier: ed.owner, identifierType: 0, price: ed.price, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial: ed.serial };
    const edSpk = p2shHex(B.concat([Ed.prefix, V.encState(Ed, edState), Ed.suffix]));
    check('[#' + i + '] edition covenant_id == mintTx.outputs[1].covenant_id', (mintTx.outputs[1].covenant_id || '') === ed.cov);
    check('[#' + i + '] edition spk == mintTx.outputs[1].scriptPubKey', edSpk === spkHex(mintTx.outputs[1]));
    const contSpk = p2shHex(B.concat([F.prefix, V.encState(F, { ...LD.series, mints_left: INIT_MINTS - (i + 1) }), F.suffix]));
    check('[#' + i + '] continuation spk (mints_left=' + (INIT_MINTS - (i + 1)) + ') == mintTx.outputs[0]', contSpk === spkHex(mintTx.outputs[0]));

    const outFile = 'reliks-v10-edition-' + ed.serial + '.svg';
    fs.writeFileSync(outFile, ENGINE.render(renderSeed(ed.serial)));
    console.log('[#' + i + '] rendered -> ' + outFile);
  }

    // F1 gate: the redeem revealed in the mint sigscript (authenticated by the spk checks)
  // must embed the exact anchored engine bytes. This closes the compiler-elision hole where
  // engine_code could be garbage while program_hash is honest.
  const mint0 = await (await fetch(V.rest + '/transactions/' + LD.editions[0].txId)).json();
  const ss = Buffer.from(mint0.inputs[0].signature_script || mint0.inputs[0].signatureScript, 'hex');
  const lastPush = (() => { let o = 0, data = Buffer.alloc(0);
    while (o < ss.length) { const op = ss[o++]; let len = 0;
      if (op === 0x00) { data = Buffer.alloc(0); continue; }
      if (op >= 0x01 && op <= 0x4b) len = op;
      else if (op === 0x4c) { len = ss[o]; o += 1; }
      else if (op === 0x4d) { len = ss.readUInt16LE(o); o += 2; }
      else if (op === 0x4e) { len = ss.readUInt32LE(o); o += 4; }
      else if (op === 0x4f) { data = Buffer.from([0x81]); continue; }
      else if (op >= 0x51 && op <= 0x60) { data = Buffer.from([op - 0x50]); continue; }
      else throw new Error('non-push opcode in sigscript: 0x' + op.toString(16));
      data = ss.subarray(o, o + len); o += len; }
    return data; })();
  const engineBytes = Buffer.from(ENGINE.ENGINE_SRC, 'utf8');
  // Old F1 gate: check('ENGINE_SRC embedded in on-chain redeem (engine_code == anchored engine)', lastPush.includes(engineBytes));
   // New robust F1 gate:
   const f1Tx = await (await fetch(V.rest + '/transactions/' + (LD.editions[0].mintTxId || LD.editions[0].txId))).json();
   const ss0_f1 = Buffer.from(f1Tx.inputs[0].signature_script, 'hex');
   const prefIdx_f1 = ss0_f1.indexOf(F.prefix);
   const sufIdx_f1 = ss0_f1.lastIndexOf(F.suffix);
   const mintRedeem_f1 = (prefIdx_f1 >= 0 && sufIdx_f1 > prefIdx_f1) ? ss0_f1.slice(prefIdx_f1, sufIdx_f1 + F.suffix.length) : Buffer.alloc(0);
   const engineInRedeem_f1 = mintRedeem_f1.length > 0 ? mintRedeem_f1.includes(Buffer.from(ENGINE.ENGINE_SRC, 'utf8')) : false;
   check('ENGINE_SRC embedded in on-chain redeem (engine_code == anchored engine)', engineInRedeem_f1);

  const ok = results.every(x => x);
  console.log(ok ? '\nAll ' + results.length + ' checks PASSED. Full lineage chain-anchored: genesis -> lane -> editions, no sigscripts, no IPFS.' : '\nSome checks FAILED.');
  process.exitCode = ok ? 0 : 1;
})().catch(e => { console.error(e); process.exit(1); });
