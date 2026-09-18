const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const secp = require('@noble/secp256k1');
const crypto = require('crypto');
const WebSocket = require('ws');
secp.utils.sha256Sync = (...m) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const B = Buffer;
const hex = b => B.from(b).toString('hex');
const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = n => { const b = B.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const sm8 = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
function pushExp(p) { const n = p.length; if (n === 0) return B.from([0x00]); if (n <= 75) return B.concat([B.from([n]), p]); if (n <= 255) return B.concat([B.from([0x4c, n]), p]); return B.concat([B.from([0x4d]), le16(n), p]); }
function pushMin(b) { const n = b.length; if (n === 0) return B.from([0x00]); if (n === 1) { if (b[0] >= 1 && b[0] <= 16) return B.from([0x50 + b[0]]); if (b[0] === 0x81) return B.from([0x4f]); return B.concat([B.from([1]), b]); } if (n <= 75) return B.concat([B.from([n]), b]); if (n <= 255) return B.concat([B.from([0x4c, n]), b]); return B.concat([B.from([0x4d]), le16(n), b]); }
function pushMinInt(v) { if (v === 0) return B.from([0x00]); if (v >= 1 && v <= 16) return B.from([0x50 + v]); if (v === -1) return B.from([0x4f]); let h = v.toString(16); if (h.length % 2) h = '0' + h; let b = B.from(h, 'hex').reverse(); if (b[b.length - 1] & 0x80) b = B.concat([b, B.from([0])]); return B.concat([B.from([b.length]), b]); }
const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8');
const ZERO32 = B.alloc(32, 0);
const Hash = d => B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
const u8 = v => B.from([v & 0xff]); const varB = b => B.concat([le64(b.length), b]);
const poh = ins => Hash(B.concat(ins.map(i => B.concat([H(i.txId), le32(i.index)]))));
const seqh = ins => Hash(B.concat(ins.map(i => le64(i.sequence || 0))));
const ohv1 = outs => Hash(B.concat(outs.map(o => { const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))]; if (o.covenant) p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId)); else p.push(u8(0)); return B.concat(p); })));
const sighash = (ins, outs, idx) => { const i = ins[idx]; return Hash(B.concat([le16(1), poh(ins), seqh(ins), H(i.txId), le32(i.index), le16(0), varB(H(i.spk)), le64(i.amount), le64(i.sequence), ohv1(outs), le64(0), H('00'.repeat(20)), le64(0), ZERO32, u8(1)])); };
const covIdGenesis = (authTxId, authIdx, outs) => hex(blake2b(B.concat([H(authTxId), le32(authIdx), le64(outs.length), ...outs.map(o => B.concat([le32(o.idx), le64(o.value), le16(0), le64(H(o.script).length), H(o.script)]))]), { dkLen: 32, key: B.from('CovenantID') }));
const p2sh = R => 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87';
const PRIV = require('./config').PRIV;
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const DUST = 100000000n; const FEE = 2000000n;
async function fetchRetry(u, o, n) { n = n || 4; for (let i = 0; i < n; i++) { try { return await fetch(u, o); } catch (e) { if (i === n - 1) throw e; await new Promise(r => setTimeout(r, 2500)); } } }
async function daaNow() { const j = await (await fetchRetry('https://api-tn10.kaspa.org/info/daa-score')).json(); const v = j.daaScore !== undefined ? j.daaScore : (j.score !== undefined ? j.score : j.daa_score); if (v === undefined || v === null) return null; return BigInt(v); }
async function pickConfirmedUtxo() {
  for (let i = 0; i < 24; i++) {
    const daa = await daaNow();
    const u = await (await fetchRetry('https://api-tn10.kaspa.org/addresses/' + WALLET + '/utxos')).json();
    const conf = daa === null ? u.filter(x => x.utxoEntry.blockDaaScore && BigInt(x.utxoEntry.blockDaaScore) > 0n) : u.filter(x => x.utxoEntry.blockDaaScore && BigInt(x.utxoEntry.blockDaaScore) <= daa - 2n);
    conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
    if (conf.length) { console.log('  picked confirmed utxo ' + conf[0].outpoint.transactionId.slice(0, 10) + ' daa ' + conf[0].utxoEntry.blockDaaScore + ' (now ' + daa + ')'); return { txId: conf[0].outpoint.transactionId, index: conf[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(conf[0].utxoEntry.amount) }; }
    console.log('  no confirmed wallet utxo yet (' + (i + 1) + '/24)');
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('no confirmed wallet utxo');
}
function broadcast(rpcTx) {
  const urls = ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json'];
  return new Promise(resolve => {
    const tryUrl = k => {
      if (k >= urls.length) return resolve(null);
      const ws = new WebSocket(urls[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); console.log('recv', s.substring(0, 300)); let txId = null; try { txId = (JSON.parse(s).params || JSON.parse(s).result || {}).transactionId || null; } catch (e) {} ws.close(); resolve(txId); });
      ws.on('error', () => { clearTimeout(t); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}
async function broadcastRetry(rpcTx, label) {
  for (let i = 0; i < 6; i++) {
    const txId = await broadcast(rpcTx);
    if (txId) return txId;
    console.log('  ' + label + ' rejected; parent may still be unconfirmed — retry same signed tx (' + (i + 1) + '/6)');
    await new Promise(r => setTimeout(r, 10000));
  }
  return null;
}
const parts = abi => { const c = abi.contracts[Object.keys(abi.contracts)[0]]; const bc = B.from(c.compiled.bytecode); const s = c.compiled.state_span; return { c, bc, prefix: bc.subarray(0, s.offset), suffix: bc.subarray(s.offset + s.len) }; };
const encState = (P, vals) => B.concat(P.c.runtime_state.fields.map(f => { const t = f.type.kind, x = vals[f.name]; if (t === 'int' || t === 'temporal') return pushExp(sm8(x)); if (t === 'byte') return pushExp(B.from([x])); if (t === 'bool') return pushExp(B.from([x ? 1 : 0])); return pushExp(H(x)); }));
(async () => {
  const M = parts(JSON.parse(fs.readFileSync('pixel-minter-abi.json', 'utf8')));
  const T = parts(JSON.parse(fs.readFileSync('pixel-token-abi.json', 'utf8')));
  const TAG_INIT = H(M.c.entries.__covenant_entrypoint_auth_init.dispatch_tag);
  const wIn = await pickConfirmedUtxo();

  // ---- Stage 1: minter genesis -> controller covenant id C ----
  const preRedeem = M.bc;
  const minterSpk = p2sh(preRedeem);
  const C = covIdGenesis(wIn.txId, wIn.index, [{ idx: 0, value: DUST, script: minterSpk }]);
  const outs1 = [
    { amount: DUST, scriptPublicKey: minterSpk, covenant: { authorizingInput: 0, covenantId: C } },
    { amount: wIn.amount - DUST - FEE, scriptPublicKey: wIn.spk }
  ];
  const ins1 = [wIn];
  const sig1 = '41' + hex(secp.schnorr.signSync(sighash(ins1, outs1, 0), PRIV)) + '01';
  const tx1 = { version: 1, inputs: [{ previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig1, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outs1.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  const txid1 = await broadcastRetry(tx1, 'minter genesis');
  if (!txid1) throw new Error('minter genesis broadcast failed');
  console.log('MINTER GENESIS:', txid1, '| controller C =', C);

  let mUtxo = null;
  for (let i = 0; i < 12 && !mUtxo; i++) {
    try {
      const res = await fetchRetry('https://kascov.io/data/testnet-10/c/' + C + '.json');
      if (!res.ok) throw new Error('not found');
      const cov = await res.json();
      mUtxo = cov.utxos && cov.utxos.find(u => u.live && u.script_hex === minterSpk);
    } catch (e) {}
    if (!mUtxo) {
      console.log('  gate: C not live in kascov yet (' + (i + 1) + '/12), trying REST fallback...');
      try {
        const txRes = await fetchRetry('https://api-tn10.kaspa.org/transactions/' + txid1);
        if (txRes.ok) {
          const tx = await txRes.json();
          if (tx.is_accepted && tx.outputs && tx.outputs[0] && tx.outputs[0].script_public_key === minterSpk && tx.outputs[0].covenant_id === C) {
            console.log('  REST API confirmed txid1 output 0! Bypassing kascov gate.');
            mUtxo = { outpoint: txid1 + ':0', value: tx.outputs[0].amount, script_hex: minterSpk };
          }
        }
      } catch (e2) {}
      if (!mUtxo) await new Promise(r => setTimeout(r, 5000));
    }
  }
  if (!mUtxo) throw new Error('minter utxo never became live');

  // ---- Stage 2: asset genesis + init -> token covenant id A, minter binds to A ----
  const [mTx, mIdx] = mUtxo.outpoint.split(':');
  const mAmt = BigInt(mUtxo.value);
  const tokenState = { ownerIdentifier: C, identifierType: 2, amount: 0, isMinter: true };
  const tokenSpk = p2sh(B.concat([T.prefix, encState(T, tokenState), T.suffix]));
  const A = covIdGenesis(mTx, parseInt(mIdx), [{ idx: 0, value: DUST, script: tokenSpk }]);
  const minterNewState = { tokenCovid: A, amount: 1000000, initialized: true };
  const minterNewSpk = p2sh(B.concat([M.prefix, encState(M, minterNewState), M.suffix]));
  const wIn2 = await pickConfirmedUtxo();
  const outs2 = [
    { amount: DUST, scriptPublicKey: tokenSpk, covenant: { authorizingInput: 0, covenantId: A } },
    { amount: DUST, scriptPublicKey: minterNewSpk, covenant: { authorizingInput: 0, covenantId: C } },
    { amount: wIn2.amount - DUST - FEE, scriptPublicKey: wIn2.spk }
  ];
  const ins2 = [{ txId: mTx, index: parseInt(mIdx), sequence: 0, spk: minterSpk, amount: mAmt }, wIn2];
  const sigInit = B.concat([pushMin(H(A)), pushMinInt(1000000), pushMinInt(1), pushMin(B.concat([secp.schnorr.signSync(sighash(ins2, outs2, 0), PRIV), B.from([0x01])])), pushMin(TAG_INIT), pushMin(preRedeem)]);
  const sigW2 = '41' + hex(secp.schnorr.signSync(sighash(ins2, outs2, 1), PRIV)) + '01';
  const tx2 = { version: 1, inputs: [{ previousOutpoint: { transactionId: mTx, index: parseInt(mIdx) }, signatureScript: hex(sigInit), sequence: 0, sigOpCount: 0, computeBudget: 60 }, { previousOutpoint: { transactionId: wIn2.txId, index: wIn2.index }, signatureScript: sigW2, sequence: 0, sigOpCount: 0, computeBudget: 10 }], outputs: outs2.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })), lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0 };
  const txid2 = await broadcastRetry(tx2, 'asset genesis+init');
  if (!txid2) throw new Error('asset genesis broadcast failed');
  console.log('ASSET GENESIS + INIT:', txid2, '| token A =', A);
  fs.writeFileSync('token-ledger.json', JSON.stringify({ C, A, minterGenesisTxId: txid1, assetGenesisTxId: txid2, allowance: 1000000, minterValue: Number(DUST), tokenMinterValue: Number(DUST) }, null, 2));
  console.log('saved token-ledger.json');
})().catch(e => { console.error(e); process.exit(1); });
