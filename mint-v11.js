const fs = require('fs');
const OL = require('./reliks-lib.js');
const V = require('./reliks-lib.js');
const secp = (() => { try { const s = require('@noble/secp256k1'); if (s.schnorr && s.schnorr.signSync) return s; } catch (e) {} const c = require('@noble/curves/secp256k1'); return { schnorr: { signSync: (m, p) => c.schnorr.sign(m, p) } }; })();
const { feeLoop, waitForConfirmation, pickUtxo, sighash, hex, pushMin, pushMinInt } = OL;
const covIdGenesis = require('./reliks-lib.js').covIdGenesis || V.covIdGenesis || OL.covIdGenesis;
if (typeof covIdGenesis !== 'function') { console.error('covIdGenesis unavailable in v7/v8/offer libs'); process.exit(1); }
const B = Buffer;
const F = V.parts(JSON.parse(fs.readFileSync((process.env.RELIKS_FACTORY_ABI || 'data/factory-abi-v11.json'), 'utf8')));
const Ed = V.parts(JSON.parse(fs.readFileSync('data/edition-abi-v6.json', 'utf8')));
const LD = JSON.parse(fs.readFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), 'utf8'));
const MINT_FEE = 100000000n, CARRIER = 100000000n;
const TAG = (n) => B.from(F.c.entries[n].dispatch_tag, 'hex');
const serialOfV10 = (txId, idx) => {
  const h = V.blake2b(B.concat([B.from('ReliksSerialV10', 'utf8'), B.from(txId, 'hex'), (() => { const b = B.alloc(4); b.writeUInt32LE(idx); return b; })()]), { dkLen: 32 });
  let s = 0n;
  s += BigInt(h[0]); s += BigInt(h[1]) * 256n; s += BigInt(h[2]) * 65536n; s += BigInt(h[3]) * 16777216n;
  s += BigInt(h[4]) * 4294967296n; s += BigInt(h[5]) * 1099511627776n; s += BigInt(h[6]) * 281474976710656n;
  s += BigInt(h[7] % 128) * 72057594037927936n;
  return s.toString();
};
const covHex = (c) => typeof c === 'string' ? c : hex(c);
const prevOf = (inp) => ({ txId: inp.previous_outpoint_hash || inp.previousOutpoint.transactionId, index: inp.previous_outpoint_index !== undefined ? inp.previous_outpoint_index : inp.previousOutpoint.index });
const spkOf = (o) => { const s = o.script_public_key || o.scriptPublicKey; return typeof s === 'string' ? s : (s.scriptPublicKey || ''); };
const rpc = (inputs, outputs) => ({ version: 1, inputs, outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 });

// F-M1 GUARD (audit): The factory's mint entrypoint does not validate buyerScheme.
// If a builder passes scheme != 0 or a malformed pubkey, the spawned edition is
// permanently bricked (all owner routes require identifierType == 0 and checkSig).
// This builder hardcodes scheme=0 and the operator's pubkey; we assert it here
// to prevent future modifications from silently bricking editions.
if (V.USER.length !== 64 || !/^[0-9a-fA-F]{64}$/.test(V.USER)) {
  console.error('F-M1 GUARD: V.USER must be a valid 32-byte x-only pubkey hex (got ' + V.USER.length + ' chars)');
  process.exit(1);
}
const BUYER_SCHEME = 0; // IDENTIFIER_PUBKEY

const RG = (() => { const fs2 = require('fs'); const src = fs2.readFileSync(__dirname + '/web/reliks-gallery-runtime.js', 'utf8'); return new Function('RB2B', 'REG', 'self', src + ';return self.ReliksGallery;')(require('@noble/hashes/blake2b').blake2b, { hrp: require('./network.js').hrp }, {}); })();
if (V.WALLET !== RG.p2pkAddress('20' + V.USER + 'ac')) { console.error('WALLET/PRIV mismatch — stale PC_WALLET in env?'); process.exit(1); }
(async () => {
  const laneTxId = LD.editions.length ? LD.editions[LD.editions.length - 1].txId : LD.genesisTxId;
  const laneTx = await (await fetch(V.rest + '/transactions/' + laneTxId)).json();
  const laneAmt = BigInt(laneTx.outputs[0].amount);
  const laneSpk = spkOf(laneTx.outputs[0]);
  const expectLane = V.p2sh(B.concat([F.prefix, V.encState(F, { ...LD.series, mints_left: LD.series.mints_left - LD.editions.length }), F.suffix]));
  if (hex(expectLane) !== laneSpk && expectLane !== laneSpk) { console.error('lane spk drift — ledger out of sync with chain'); process.exit(1); }
  const serial = serialOfV10(laneTxId, 0);
  const edState = { ownerIdentifier: V.USER, identifierType: BUYER_SCHEME, price: 0, artist: LD.series.artist, royalty_bips: LD.series.royalty_bips, program_hash: LD.series.program_hash, factory_covid: LD.C, serial };
  const edRedeem = B.concat([Ed.prefix, V.encState(Ed, edState), Ed.suffix]);
  const wIn = await pickUtxo();
  console.log('funding mint with 1 UTXO(s) totaling', (Number(wIn.amount) / 1e8), 'KAS');
  const covEd = covHex(covIdGenesis(wIn.txId, wIn.index, [{ idx: 1, value: Number(CARRIER), script: V.p2sh(edRedeem) }]));
  const price = BigInt(LD.series.price);
  const artistCut = price > 0n ? price - MINT_FEE : 0n;
  const artistOutIdx = artistCut > 0n ? 3 : 2;   // unused by contract when cut == 0
  const platformOutIdx = 2;
  const hsInputs = [
    { txId: laneTxId, index: 0, sequence: 0, spk: laneSpk, amount: laneAmt },
    { txId: wIn.txId, index: wIn.index, sequence: 0, spk: wIn.spk, amount: wIn.amount }
  ];
  const inputs = [
    { previousOutpoint: { transactionId: laneTxId, index: 0 }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: Number(process.env.PC_LANE_BUDGET || 100) },
    { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: '', sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ];
  function build(fee) {
    const outputs = [
      { amount: laneAmt, scriptPublicKey: V.p2sh(B.concat([F.prefix, V.encState(F, { ...LD.series, mints_left: LD.series.mints_left - LD.editions.length - 1 }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LD.C } },
      { amount: CARRIER, scriptPublicKey: V.p2sh(edRedeem), covenant: { authorizingInput: 1, covenantId: covEd } },
      { amount: MINT_FEE, scriptPublicKey: '20' + LD.series.treasury + 'ac' }
    ];
    if (artistCut > 0n) outputs.push({ amount: artistCut, scriptPublicKey: '20' + LD.series.artist + 'ac' });
    outputs.push({ amount: BigInt(wIn.amount) - MINT_FEE - artistCut - CARRIER - fee, scriptPublicKey: wIn.spk });
    const ss = B.concat([pushMin(B.from(V.USER, 'hex')), pushMin(B.from([BUYER_SCHEME])), pushMinInt(1), pushMinInt(artistOutIdx), pushMinInt(platformOutIdx), pushMin(TAG('mint')), pushMin(B.concat([F.prefix, V.encState(F, { ...LD.series, mints_left: LD.series.mints_left - LD.editions.length }), F.suffix]))]);
    inputs[0].signatureScript = hex(ss);
    inputs[1].signatureScript = '41' + hex(secp.schnorr.signSync(sighash(hsInputs, outputs, 1), V.PRIV)) + '01';
    return rpc(inputs, outputs);
  }
  const { txId, fee } = await feeLoop(build);
  await waitForConfirmation(txId);
  LD.editions.push({ txId, index: 1, mintTxId: txId, mintIndex: 1, cov: covEd, serial, owner: V.USER, price: 0, amount: Number(CARRIER), spk: hex(V.p2sh(edRedeem)) });
  fs.writeFileSync((process.env.RELIKS_LEDGER || 'data/factory-ledger-v11.json'), JSON.stringify(LD, null, 2));
  console.log('RELIKS V11 MINT:', txId, '| serial', serial, '| artistCut', artistCut.toString(), '| platformFee', MINT_FEE.toString(), '| edition', covEd.slice(0, 16) + '...');
})().catch(e => { console.error(e); process.exit(1); });
