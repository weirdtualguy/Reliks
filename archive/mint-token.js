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
const DUST = 100000000n; const FEE = 2000000n; const MINT = 1000;
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
  const M = parts(JSON.parse(fs.readFileSync('pixel-minter-abi.json', 'utf8')));
  const TAG_T = H(T.c.entries.__leader_transfer.dispatch_tag);
  const TAG_M = H(M.c.entries.__covenant_entrypoint_auth_mint.dispatch_tag);
  const A = L.A, C = L.C, ALLOW = L.allowance;
  if (MINT > ALLOW) throw new Error('mint exceeds allowance');
  const nextAllow = ALLOW - MINT;

  const tokState = (owner, type, amt, isM) => ({ ownerIdentifier: owner, identifierType: type, amount: amt, isMinter: isM });
  const redeemA = tok => p2sh(B.concat([T.prefix, encState(T, tok), T.suffix]));
  const redeemC = st => p2sh(B.concat([M.prefix, encState(M, st), M.suffix]));

  const curTok = tokState(C, 2, 0, true);
  const curMin = { tokenCovid: A, amount: ALLOW, initialized: true };
  const spkA = redeemA(curTok);
  const spkC = redeemC(curMin);

  const inputs = [
    { txId: L.assetGenesisTxId, index: 0, sequence: 0, spk: spkA, amount: DUST },
    { txId: L.assetGenesisTxId, index: 1, sequence: 0, spk: spkC, amount: DUST }
  ];
  const w = await (await fetchRetry('https://api-tn10.kaspa.org/addresses/' + WALLET + '/utxos')).json();
  const conf = w.filter(x => x.utxoEntry.blockDaaScore);
  conf.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wIn = { txId: conf[0].outpoint.transactionId, index: conf[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(conf[0].utxoEntry.amount) };
  inputs.push(wIn);

  const outTokMinter = tokState(C, 2, 0, true);
  const outTokRecv = tokState(USER, 0, MINT, false);
  const outMinNext = { tokenCovid: A, amount: nextAllow, initialized: true };
  const outputs = [
    { amount: DUST, scriptPublicKey: redeemA(outTokMinter), covenant: { authorizingInput: 0, covenantId: A } },
    { amount: DUST, scriptPublicKey: redeemA(outTokRecv), covenant: { authorizingInput: 0, covenantId: A } },
    { amount: DUST, scriptPublicKey: redeemC(outMinNext), covenant: { authorizingInput: 1, covenantId: C } },
    { amount: wIn.amount - DUST - FEE, scriptPublicKey: wIn.spk }
  ];

  // leader transfer sigscript (input 0): grouped struct array + empty sigs + witness [1]
  const ssA = B.concat([
    pushMin(B.concat([H(C), H(USER)])),
    pushMin(B.from([2, 0])),
    pushMin(B.concat([sm8(0), sm8(MINT)])),
    pushMin(B.from([1, 0])),
    pushMin(B.from([])),
    pushMin(B.from([1])),
    pushMin(TAG_T),
    pushMin(B.concat([T.prefix, encState(T, curTok), T.suffix]))
  ]);
  // minter mint sigscript (input 1)
  const sig1 = secp.schnorr.signSync(sighash(inputs, outputs, 1), PRIV);
  const ssC = B.concat([
    pushMin(H(A)), pushMinInt(nextAllow), pushMinInt(1),
    pushMin(B.concat([sig1, B.from([0x01])])),
    pushMin(H(C)), pushMin(B.from([2])), pushMinInt(0), pushMinInt(1),
    pushMin(H(USER)), pushMin(B.from([0])), pushMinInt(MINT), pushMinInt(0),
    pushMin(TAG_M),
    pushMin(B.concat([M.prefix, encState(M, curMin), M.suffix]))
  ]);
  const sig2 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 2), PRIV)) + '01';

  const rpcTx = {
    version: 1,
    inputs: [
      { previousOutpoint: { transactionId: inputs[0].txId, index: 0 }, signatureScript: hex(ssA), sequence: 0, sigOpCount: 0, computeBudget: 60 },
      { previousOutpoint: { transactionId: inputs[1].txId, index: 1 }, signatureScript: hex(ssC), sequence: 0, sigOpCount: 0, computeBudget: 60 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig2, sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ],
    outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0
  };
  const txId = await broadcast(rpcTx);
  if (!txId) throw new Error('mint broadcast failed');
  L.mintTxId = txId;
  L.recipientOutpoint = txId + ':1';
  L.allowance = nextAllow;
  fs.writeFileSync('token-ledger.json', JSON.stringify(L, null, 2));
  console.log('PCRT MINT:', txId, '| minted', MINT, 'PCRT to', USER.slice(0, 8) + '... | allowance left', nextAllow);
})().catch(e => { console.error(e); process.exit(1); });
