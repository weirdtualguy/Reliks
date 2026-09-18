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
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const DUST = 100000000n; const FEE = 2000000n;
async function fetchRetry(u, o, n) { n = n || 4; for (let i = 0; i < n; i++) { try { return await fetch(u, o); } catch (e) { if (i === n - 1) throw e; await new Promise(r => setTimeout(r, 2500)); } } }
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
const parts = abi => { const c = abi.contracts[Object.keys(abi.contracts)[0]]; const bc = B.from(c.compiled.bytecode); const s = c.compiled.state_span; return { c, bc, prefix: bc.subarray(0, s.offset), suffix: bc.subarray(s.offset + s.len) }; };
const encState = (P, vals) => B.concat(P.c.runtime_state.fields.map(f => { const t = f.type.kind, x = vals[f.name]; if (t === 'int' || t === 'temporal') return pushExp(sm8(x)); if (t === 'byte') return pushExp(B.from([x])); if (t === 'bool') return pushExp(B.from([x ? 1 : 0])); return pushExp(H(x)); }));
(async () => {
  const L = JSON.parse(fs.readFileSync('token-ledger.json', 'utf8'));
  const T = parts(JSON.parse(fs.readFileSync('pixel-token-abi.json', 'utf8')));
  const TAG_T = H(T.c.entries.__leader_transfer.dispatch_tag);
  const A = L.A;
  const [rTx, rIdx] = L.recipientOutpoint.split(':');
  const AMT = 1000;

  const priv = crypto.randomBytes(32);
  const pub = B.from(secp.getPublicKey(priv, true)).subarray(1, 33);
  fs.writeFileSync('pcrt-recipient.json', JSON.stringify({ priv: hex(priv), pub: hex(pub) }, null, 2));
  console.log('fresh recipient pubkey:', hex(pub).slice(0, 16) + '...');

  const tokState = (owner, type, amt, isM) => ({ ownerIdentifier: owner, identifierType: type, amount: amt, isMinter: isM });
  const redeemA = tok => p2sh(B.concat([T.prefix, encState(T, tok), T.suffix]));
  const prevTok = tokState(USER, 0, AMT, false);
  const newTok = tokState(hex(pub), 0, AMT, false);
  const spkPrev = redeemA(prevTok);

  const inputs = [
    { txId: rTx, index: parseInt(rIdx), sequence: 0, spk: spkPrev, amount: DUST }
  ];
  const w = await (await fetchRetry('https://api-tn10.kaspa.org/addresses/' + WALLET + '/utxos')).json();
  const conf = w.filter(x => x.utxoEntry.blockDaaScore);
  conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wIn = { txId: conf[0].outpoint.transactionId, index: conf[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(conf[0].utxoEntry.amount) };
  inputs.push(wIn);

  const outputs = [
    { amount: DUST, scriptPublicKey: redeemA(newTok), covenant: { authorizingInput: 0, covenantId: A } },
    { amount: wIn.amount - FEE, scriptPublicKey: wIn.spk }
  ];

  // leader transfer sigscript: grouped struct array (1 element) + sigs[prevOwner] + witness [0]
  const sig0 = secp.schnorr.signSync(sighash(inputs, outputs, 0), PRIV);
  const ssA = B.concat([
    pushMin(H(pub)),
    pushMin(B.from([0])),
    pushMin(sm8(AMT)),
    pushMin(B.from([0])),
    pushMin(B.concat([sig0, B.from([0x01])])),
    pushMin(B.from([0])),
    pushMin(TAG_T),
    pushMin(B.concat([T.prefix, encState(T, prevTok), T.suffix]))
  ]);
  const sig1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), PRIV)) + '01';

  const rpcTx = {
    version: 1,
    inputs: [
      { previousOutpoint: { transactionId: rTx, index: parseInt(rIdx) }, signatureScript: hex(ssA), sequence: 0, sigOpCount: 0, computeBudget: 60 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig1, sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ],
    outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0
  };
  const txId = await broadcast(rpcTx);
  if (!txId) throw new Error('transfer broadcast failed');
  L.transferTxId = txId;
  L.pcrtRecipientOutpoint = txId + ':0';
  L.pcrtRecipientPub = hex(pub);
  fs.writeFileSync('token-ledger.json', JSON.stringify(L, null, 2));
  console.log('PCRT TRANSFER:', txId, '| 1000 PCRT ->', hex(pub).slice(0, 16) + '... | supply conserved (non-minter branch)');
})().catch(e => { console.error(e); process.exit(1); });
