const N = require('./network.js');
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
const p2sh = R => 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87';
const PRIV = require('./config').PRIV;
const USER = hex(B.from(secp.getPublicKey(B.from(PRIV, 'hex'), true)).subarray(1, 33)); // derived from PC_PRIV; no hardcoded identity
const WALLET = process.env.PC_WALLET || (N.NET === 'testnet' ? 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd' : (() => { console.error('FATAL: PC_WALLET required on ' + N.NET); process.exit(1); })());
if (!WALLET.startsWith(N.hrp + ':')) { console.error('FATAL: PC_WALLET prefix mismatch for PC_NET=' + N.NET + ' (wallet: ' + WALLET.slice(0, 12) + '..., expected prefix ' + N.hrp + ':)'); process.exit(1); }
const FEE = 2000000n;
async function fetchRetry(u, o, n) { n = n || 4; for (let i = 0; i < n; i++) { try { return await fetch(u, o); } catch (e) { if (i === n - 1) throw e; await new Promise(r => setTimeout(r, 2500)); } } }
function broadcast(rpcTx) {
  const urls = N.wrpc;
  return new Promise(resolve => {
    const tryUrl = k => {
      if (k >= urls.length) return resolve(null);
      const ws = new WebSocket(urls[k], { rejectUnauthorized: false, headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { console.log('WRPC TIMEOUT [' + N.wrpc[k] + '] after 15s'); ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); console.log('recv', s.substring(0, 300)); let txId = null; try { txId = (JSON.parse(s).params || JSON.parse(s).result || {}).transactionId || null; } catch (e) {} ws.close(); resolve(txId); });
      ws.on('error', (e) => { clearTimeout(t); console.error('WRPC ERROR [' + N.wrpc[k] + ']:', e.message || e.code || e); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}
const parts = abi => { const c = abi.contracts[Object.keys(abi.contracts)[0]]; const bc = B.from(c.compiled.bytecode); const s = c.compiled.state_span; return { c, bc, prefix: bc.subarray(0, s.offset), suffix: bc.subarray(s.offset + s.len) }; };
const encState = (P, vals) => B.concat(P.c.runtime_state.fields.map(f => { const t = f.type.kind, x = vals[f.name]; if (t === 'int' || t === 'temporal') return pushExp(sm8(x)); if (t === 'byte') return pushExp(B.from([x])); if (t === 'bool') return pushExp(B.from([x ? 1 : 0])); return pushExp(H(x)); }));
async function pickUtxo() {
  const w = await (await fetchRetry(N.rest + '/addresses/' + WALLET + '/utxos')).json();
  if (!Array.isArray(w)) throw new Error('non-array UTXO response: ' + JSON.stringify(w).slice(0, 200));
  const conf = w.filter(x => x.utxoEntry.blockDaaScore);
  conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  return { txId: conf[0].outpoint.transactionId, index: conf[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(conf[0].utxoEntry.amount) };
}
module.exports = { NET: N.NET, rest: N.rest, kascov: N.kascov, hrp: N.hrp, label: N.label,  B, hex, H, le16, le32, le64, sm8, pushExp, pushMin, pushMinInt, sighash, p2sh, PRIV, USER, WALLET, FEE, fetchRetry, broadcast, parts, encState, pickUtxo, secp, crypto, fs };

// F-05: Confirmation margin (sort by oldest DAA score first to avoid orphan window)
const origPickUtxo = pickUtxo;
async function pickUtxoSafe() {
  const w = await (await fetchRetry(N.rest + '/addresses/' + WALLET + '/utxos')).json();
  if (!Array.isArray(w)) throw new Error('non-array UTXO response: ' + JSON.stringify(w).slice(0, 200));
  const conf = w.filter(x => x.utxoEntry.blockDaaScore);
  conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount))); // largest-first: storage-mass credit dominates
  if (!conf[0]) throw new Error('no confirmed UTXOs found for ' + WALLET);
  return { txId: conf[0].outpoint.transactionId, index: conf[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(conf[0].utxoEntry.amount) };
}

// F-06: Canonical broadcastWithMsg + feeLoop
async function broadcastWithMsg(rpcTx) {
  let WsCtor;
  try { WsCtor = require('ws'); } catch (e) { WsCtor = WebSocket; }
  return new Promise((resolve) => {
    const tryUrl = (k) => {
      if (k >= N.wrpc.length) { resolve({ txId: null, msg: 'all endpoints failed' }); return; }
      const ws = new WsCtor(N.wrpc[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { console.log('  wrpc timeout [' + N.wrpc[k] + ']'); ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => { const s = d.toString(); clearTimeout(t); let txId = null, msg = ''; try { const j = JSON.parse(s); txId = (j.params || j.result || {}).transactionId || null; msg = (j.error && j.error.message) || s.substring(0, 240); } catch (e) { msg = s.substring(0, 240); } ws.close(); resolve({ txId, msg }); });
      ws.on('error', (e) => { clearTimeout(t); console.error('  wrpc error [' + N.wrpc[k] + ']:', e.message); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}

function toRESTFormat(tx) {
  const stripVer = (spk) => (typeof spk === 'string' && spk.slice(0,4) === '0000') ? spk.slice(4) : spk;
  return {
    version: tx.version || 1,
    inputs: (tx.inputs || []).map(i => ({
      previousOutpoint: i.previousOutpoint,
      signatureScript: i.signatureScript,
      sequence: i.sequence,
      sigOpCount: i.sigOpCount,
      computeBudget: i.computeBudget,
      compute_budget: i.computeBudget
    })),
    outputs: (tx.outputs || []).map(o => {
      const out = {
        amount: o.value !== undefined ? o.value : o.amount,
        scriptPublicKey: {
          scriptPublicKey: stripVer(o.scriptPublicKey),
          version: 0
        }
      };
      if (o.covenant) {
        out.covenant = {
          authorizingInput: o.covenant.authorizingInput,
          covenantId: o.covenant.covenantId,
          authorizing_input: o.covenant.authorizingInput,
          covenant_id: o.covenant.covenantId
        };
      }
      return out;
    }),
    lockTime: tx.lockTime || 0,
    subnetworkId: tx.subnetworkId || '00'.repeat(20),
    gas: tx.gas || 0,
    payload: tx.payload || ''
  };
}

async function broadcastREST(rpcTx) {
  try {
    const res = await fetch(N.rest + '/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' },
      body: JSON.stringify({ transaction: toRESTFormat(rpcTx), allowOrphan: false })
    });
    const text = await res.text();
    let txId = null, msg = '';
    try {
      const j = JSON.parse(text);
      if (res.ok) { txId = j.transactionId || j.id || null; msg = txId ? 'accepted' : text.substring(0, 240); }
      else { msg = (j.message || j.error || text).substring(0, 240); }
    } catch (e) { msg = text.substring(0, 240); }
    return { txId, msg };
  } catch (e) { return { txId: null, msg: e.message }; }
}

async function feeLoop(buildFn, initialFee = 3000000n) {
  let fee = initialFee;
  for (let attempt = 0; attempt < 6; attempt++) {
    console.log('  attempt', attempt, '| fee', fee.toString(), '| trying wRPC first...');
    const restRes = await broadcastWithMsg(buildFn(fee));
    if (restRes.txId) return { txId: restRes.txId, fee };
    console.log('  wRPC failed:', restRes.msg, '| trying REST fallback...');
    const res = await broadcastREST(buildFn(fee));
    if (res.txId) return { txId: res.txId, fee };
    console.log('  attempt ' + attempt + ' rejected: ' + restRes.msg);
    const m = restRes.msg.match(/required fee of (\d+)/i) || restRes.msg.match(/under the required (\d+)/i) || restRes.msg.match(/required fee[^\d]*(\d+)/i);
    if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
    else if (/fee/i.test(restRes.msg)) fee = fee * 2n;
    else throw new Error('non-fee rejection: ' + restRes.msg);
  }
  throw new Error('fee discovery exhausted');
}

// F-07: Confirmation gate (prevents ledger writes for orphaned txs)
async function waitForConfirmation(txId, maxWait = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(N.rest + '/transactions/' + txId);
      if (res.ok) {
        const tx = await res.json();
        if (tx.is_accepted || tx.block_hash) {
          console.log('  confirmed in block:', tx.block_hash ? tx.block_hash[0].slice(0, 8) + '...' : 'accepted');
          console.log('  waiting 10s to clear orphan window...');
          await new Promise(r => setTimeout(r, 10000));
          return true;
        }
      }
    } catch (e) {}
    await new Promise(r => setTimeout(r, 2000));
  }
  console.warn('  WARN: tx ' + txId + ' not confirmed within ' + maxWait + 'ms. Ledger may need manual reconciliation if orphaned.');
  return false;
}

module.exports.pickUtxo = pickUtxoSafe;
module.exports.broadcastWithMsg = broadcastWithMsg;
module.exports.feeLoop = feeLoop;
module.exports.waitForConfirmation = waitForConfirmation;
