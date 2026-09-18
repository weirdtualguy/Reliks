const N = require('./network.js');
const CHUNK_DUST = BigInt(process.env.PC_CHUNK_DUST || '100000000');

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
function pushExplicit(p) { const n = p.length; if (n === 0) return B.from([0x00]); if (n <= 75) return B.concat([B.from([n]), p]); if (n <= 255) return B.concat([B.from([0x4c, n]), p]); if (n <= 65535) return B.concat([B.from([0x4d]), le16(n), p]); return B.concat([B.from([0x4e]), le32(n), p]); }
const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8');
const ZERO32 = B.alloc(32, 0);
const Hash = d => B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
const u8 = v => B.from([v & 0xff]); const varB = b => B.concat([le64(b.length), b]);
const poh = ins => Hash(B.concat(ins.map(i => B.concat([H(i.txId), le32(i.index)]))));
const seqh = ins => Hash(B.concat(ins.map(i => le64(i.sequence || 0))));
const ohv1 = outs => Hash(B.concat(outs.map(o => { const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))]; if (o.covenant) p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId)); else p.push(u8(0)); return B.concat(p); })));
const sighash = (ins, outs, idx) => { const i = ins[idx]; return Hash(B.concat([le16(1), poh(ins), seqh(ins), H(i.txId), le32(i.index), le16(0), varB(H(i.spk)), le64(i.amount), le64(i.sequence), ohv1(outs), le64(0), H('00'.repeat(20)), le64(0), ZERO32, u8(1)])); };
  const V = require('./v8-lib.js');
  const PRIV = V.PRIV;
  const USER = V.USER;
const RATE_PIN = 1000n; // sompi per byte; conservative pin from 8-chunk reveal (2M rejected, 100M accepted @ ~17.7KB)
const CHUNK_VALUE = CHUNK_DUST;
function broadcast(rpcTx) {
  const urls = N.wrpc;
  return new Promise(resolve => {
    const tryUrl = k => {
      if (k >= urls.length) return resolve({ message: 'all endpoints failed' });
      const ws = new WebSocket(urls[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => {
        const s = d.toString(); clearTimeout(t);
        let j = null; try { j = JSON.parse(s); } catch (e) {}
        ws.close();
        if (j && j.error) resolve({ message: j.error.message || JSON.stringify(j.error) });
        else resolve({ txId: (j && (j.params || j.result) || {}).transactionId || null });
      });
      ws.on('error', () => { clearTimeout(t); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}
function buildRedeem(chunkHex) { return B.concat([pushExplicit(H(chunkHex)), B.from([0x75]), pushExplicit(H(USER)), B.from([0xac])]); }
(async () => {
  const groupSize = parseInt(process.argv[2] || '0', 10);
  const ledgerFile = process.argv[3] || 'data/factory-ledger-v5.json';
  const chunksFile = process.argv[4] || 'data/chunks.json';
  const ledger = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  const chunks = JSON.parse(fs.readFileSync(chunksFile, 'utf8')).chunks;
  const genesis = ledger.artTxId || ledger.genesisTxId || ledger.txId;
  const gs = groupSize > 0 ? groupSize : chunks.length;
  const groups = [];
  for (let i = 0; i < chunks.length; i += gs) groups.push(chunks.slice(i, i + gs).map((c, j) => ({ chunk: c, idx: i + j })));
  ledger.revealTxIds = ledger.revealTxIds || [];
  for (let g = 0; g < groups.length; g++) {
    const grp = groups[g];
    const inputs = grp.map(o => { const redeem = buildRedeem(o.chunk); return { txId: genesis, index: o.idx + 1, sequence: 0, spk: 'aa20' + hex(blake2b(redeem, { dkLen: 32 })) + '87', amount: CHUNK_VALUE, redeem }; });
    const totalIn = CHUNK_VALUE * BigInt(grp.length);
    let fee = RATE_PIN * BigInt(120 + grp.length * 2155 + 60);
    let txId = null;
    for (let attempt = 0; attempt < 5 && !txId; attempt++) {
      if (fee >= totalIn) throw new Error('fee exceeds group inputs');
      const outputs = [{ amount: totalIn - fee, scriptPublicKey: '20' + USER + 'ac' }];
      const rpcTx = {
        version: 1,
        inputs: inputs.map((inp, k) => {
          const sig = secp.schnorr.signSync(sighash(inputs, outputs, k, 0n), PRIV);
          const ss = hex(B.concat([pushExplicit(B.concat([sig, B.from([0x01])])), pushExplicit(inp.redeem)]));
          return { previousOutpoint: { transactionId: inp.txId, index: inp.index }, signatureScript: ss, sequence: 0, sigOpCount: 0, computeBudget: 60 };
        }),
        outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey })),
        lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0
      };
      const res = await broadcast(rpcTx);
      if (res.txId) { txId = res.txId; }
      else {
        console.log('  group ' + g + ' attempt ' + attempt + ' rejected: ' + res.message);
        const m = res.message.match(/required fee of (\d+)/i) || res.message.match(/under the required (\d+)/i) || res.message.match(/required fee[^\d]*(\d+)/i);
        if (m) fee = BigInt(m[1]) + BigInt(m[1]) / 10n + 1n;
        else if (/fee/i.test(res.message)) fee = fee * 2n;
        else throw new Error('non-fee rejection: ' + res.message);
      }
    }
    if (!txId) throw new Error('fee discovery exhausted for group ' + g);
    console.log('REVEAL group ' + g + ' (' + grp.length + ' chunks, fee ' + fee + '): ' + txId);
    ledger.revealTxIds.push(txId);
    ledger.revealTxId = ledger.revealTxIds[0];
    fs.writeFileSync(ledgerFile, JSON.stringify(ledger, null, 2));
  }
  console.log('revealTxIds: ' + JSON.stringify(ledger.revealTxIds));
})().catch(e => { console.error(e); process.exit(1); });
