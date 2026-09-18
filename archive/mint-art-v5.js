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
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

function pushExplicit(p) {
  const n = p.length;
  if (n === 0) return B.from([0x00]);
  if (n <= 75) return B.concat([B.from([n]), p]);
  if (n <= 255) return B.concat([B.from([0x4c, n]), p]);
  if (n <= 65535) return B.concat([B.from([0x4d]), le16(n), p]);
  return B.concat([B.from([0x4e]), le32(n), p]);
}

function pushMinimalInt(v) {
  if (v === 0) return B.from([0x00]);
  if (v >= 1 && v <= 16) return B.from([0x50 + v]);
  if (v === -1) return B.from([0x4f]);
  let h = v.toString(16); if (h.length % 2) h = '0' + h;
  let b = B.from(h, 'hex').reverse(); if (b[b.length - 1] & 0x80) b = B.concat([b, B.from([0])]);
  return B.concat([B.from([b.length]), b]);
}

const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8');
const ZERO32 = B.alloc(32, 0);
const Hash = d => B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
const u8 = v => B.from([v & 0xff]);
const varB = b => B.concat([le64(b.length), b]);

const poh = ins => Hash(B.concat(ins.map(i => B.concat([H(i.txId), le32(i.index)]))));
const seqh = ins => Hash(B.concat(ins.map(i => le64(i.sequence || 0))));
const ohv1 = outs => Hash(B.concat(outs.map(o => {
  const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))];
  if (o.covenant) p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId)); else p.push(u8(0));
  return B.concat(p);
})));

const sighash = (ins, outs, idx) => {
  const i = ins[idx];
  return Hash(B.concat([le16(1), poh(ins), seqh(ins), H(i.txId), le32(i.index), le16(0), varB(H(i.spk)),
    le64(i.amount), le64(i.sequence), ohv1(outs), le64(0), H('00'.repeat(20)), le64(0), ZERO32, u8(1)]));
};

const PRIV = require('./config').PRIV;
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';

async function fetchRetry(url, opts, n) {
  n = n || 4;
  for (let i = 0; i < n; i++) {
    try { return await fetch(url, opts); }
    catch (e) { if (i === n - 1) throw e; await new Promise(r => setTimeout(r, 2500)); }
  }
}

function broadcast(rpcTx) {
  const urls = ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json'];
  return new Promise(resolve => {
    const tryUrl = k => {
      if (k >= urls.length) return resolve(null);
      const ws = new WebSocket(urls[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); tryUrl(k + 1); }, 15000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
      ws.on('message', d => {
        const s = d.toString(); clearTimeout(t); console.log('recv:', s.substring(0, 500));
        let txId = null; try { txId = (JSON.parse(s).params || JSON.parse(s).result || {}).transactionId || null; } catch (e) {}
        ws.close(); resolve(txId);
      });
      ws.on('error', () => { clearTimeout(t); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}

const parts = abi => {
  const c = abi.contracts[Object.keys(abi.contracts)[0]];
  const bc = B.from(c.compiled.bytecode);
  const s = c.compiled.state_span;
  return { c, bc, prefix: bc.subarray(0, s.offset), suffix: bc.subarray(s.offset + s.len), templateHash: c.compiled.template_hash };
};

const encState = (P, vals) => B.concat(P.c.runtime_state.fields.map(f => {
  const t = f.type.kind, x = vals[f.name];
  if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x));
  if (t === 'byte') return pushExplicit(B.from([x]));
  return pushExplicit(H(x));
}));

const p2sh = R => 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87';

(async () => {
  const F = parts(JSON.parse(fs.readFileSync('factory-abi-v5.json', 'utf8')));
  const E = parts(JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8'))); // v5 factory spawns v3 editions
  const LEDGER = JSON.parse(fs.readFileSync('factory-ledger-v5.json', 'utf8'));
  
  if (!LEDGER.txId) { console.error('ledger missing genesis txId'); process.exit(1); }
  const COUNTER = LEDGER.counter;

  // Reconstruct the template fields from the Edition ABI (since they are constant)
  const eTplHash = Array.isArray(E.templateHash) ? hex(B.from(E.templateHash)) : E.templateHash;
  
  const fState = {
    program_hash: LEDGER.artProgramHash,
    artist: USER,
    price: 100000000,
    royalty_bips: 500,
    cap: 64,
    counter: COUNTER,
    edition_template_prefix: hex(E.prefix),
    edition_template_suffix: hex(E.suffix),
    expected_template_hash: eTplHash
  };

  const curFSpk = p2sh(B.concat([F.prefix, encState(F, fState), F.suffix]));
  
  let futxo;
  for (let i = 0; i < 24; i++) {
    const cov = await (await fetchRetry('https://kascov.io/data/testnet-10/c/' + LEDGER.covenantId + '.json')).json();
    futxo = cov.utxos.find(u => u.live && u.script_hex === curFSpk);
    if (futxo) break;
    console.log('  indexer lag: factory spk not live yet (' + (i + 1) + '/24)');
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!futxo) { console.error('❌ factory spk drift/persistent lag:', curFSpk); process.exit(1); }

  const [fTx, fIdx] = futxo.outpoint.split(':');
  const fAmt = BigInt(futxo.value);

  const eState = {
    ownerIdentifier: USER, identifierType: 0, price: 0, artist: USER,
    royalty_bips: 500, program_hash: LEDGER.artProgramHash, factory_covid: LEDGER.covenantId, serial: COUNTER
  };
  const spkE = p2sh(B.concat([E.prefix, encState(E, eState), E.suffix]));

  const w = await (await fetchRetry('https://api-tn10.kaspa.org/addresses/' + WALLET + '/utxos')).json();
  w.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wIn = { txId: w[0].outpoint.transactionId, index: w[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(w[0].utxoEntry.amount) };

  const edCov = hex(blake2b(B.concat([H(wIn.txId), le32(wIn.index), le64(1), le32(1), le64(10000000), le16(0), le64(H(spkE).length), H(spkE)]), { dkLen: 32, key: B.from('CovenantID') }));

  const outputs = [
    { amount: fAmt, scriptPublicKey: p2sh(B.concat([F.prefix, encState(F, { ...fState, counter: COUNTER + 1 }), F.suffix])), covenant: { authorizingInput: 0, covenantId: LEDGER.covenantId } },
    { amount: 10000000n, scriptPublicKey: spkE, covenant: { authorizingInput: 1, covenantId: edCov } },
    { amount: 100000000n, scriptPublicKey: '20' + USER + 'ac' }, // Artist payment
    { amount: wIn.amount - 100000000n - 10000000n - 2000000n, scriptPublicKey: wIn.spk }
  ];

  const inputs = [{ txId: fTx, index: parseInt(fIdx), sequence: 0, spk: curFSpk, amount: fAmt }, wIn];
  const tag = H(F.c.entries.mint.dispatch_tag);

  const sig0 = B.concat([
    pushExplicit(H(USER)),       // buyerIdentifier
    pushMinimalInt(2),           // paymentOutIdx
    pushMinimalInt(1),           // editionOutIdx
    pushExplicit(tag),
    pushExplicit(B.concat([F.prefix, encState(F, fState), F.suffix]))
  ]);

  const sig1 = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), PRIV)) + '01';

  const tx = {
    version: 1, lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0,
    inputs: [
      { previousOutpoint: { transactionId: fTx, index: parseInt(fIdx) }, signatureScript: hex(sig0), sequence: 0, sigOpCount: 0, computeBudget: 60 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig1, sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ],
    outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) }))
  };

  const txId = await broadcast(tx);
  if (txId) {
    LEDGER.txId = txId; LEDGER.index = 0; LEDGER.counter = COUNTER + 1; LEDGER.editions.push(edCov);
    fs.writeFileSync('factory-ledger-v5.json', JSON.stringify(LEDGER, null, 2));
    console.log('🌸 v5 EDITION #' + COUNTER + ' MINTED:', txId);
    console.log('edition covenant:', edCov);
    console.log('🔗 https://kascov.io/testnet-10/tx/' + txId);
  } else console.error('❌ broadcast failed');
})().catch(e => { console.error(e); process.exit(1); });
