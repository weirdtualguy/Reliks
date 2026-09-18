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

const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8');
const ZERO32 = B.alloc(32, 0);
const Hash = d => B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
const u8 = v => B.from([v & 0xff]);
const varB = b => B.concat([le64(b.length), b]);

const previous_outputs_hash = ins => Hash(B.concat(ins.map(i => B.concat([H(i.txId), le32(i.index)]))));
const sequences_hash = ins => Hash(B.concat(ins.map(i => le64(i.sequence || 0))));
const outputs_hash_v1 = outs => Hash(B.concat(outs.map(o => {
  const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))];
  if (o.covenant) p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId)); else p.push(u8(0));
  return B.concat(p);
})));

const kaspa_sighash_v1 = (inputs, outputs, idx, gas = 0n) => {
  const inp = inputs[idx];
  return Hash(B.concat([le16(1), previous_outputs_hash(inputs), sequences_hash(inputs), H(inp.txId), le32(inp.index),
    le16(0), varB(H(inp.spk)), le64(inp.amount), le64(inp.sequence), outputs_hash_v1(outputs),
    le64(0), H('00'.repeat(20)), le64(gas), ZERO32, u8(1)]));
};

async function fetchRetry(url, opts, retries) {
  retries = retries || 4;
  for (let i = 0; i < retries; i++) {
    try { return await fetch(url, opts); }
    catch (e) {
      if (i === retries - 1) throw e;
      console.log('  network drop, retry ' + (i + 1) + '...');
      await new Promise(r => setTimeout(r, 2500));
    }
  }
}

const PRIV = require('./config').PRIV;
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const MIN_DUST = 100000000n; 
const FEE = 2000000n;

const fAbi = JSON.parse(fs.readFileSync('factory-abi-v5.json', 'utf8'));
const eAbi = JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8')); 
const chunksData = JSON.parse(fs.readFileSync('chunks.json', 'utf8'));

const fC = fAbi.contracts[Object.keys(fAbi.contracts)[0]];
const fBc = B.from(fC.compiled.bytecode);
const { offset: fOff, len: fLen } = fC.compiled.state_span;
const fPrefix = fBc.subarray(0, fOff), fSuffix = fBc.subarray(fOff + fLen);

const eC = eAbi.contracts[Object.keys(eAbi.contracts)[0]];
const eBc = B.from(eC.compiled.bytecode);
const { offset: eOff, len: eLen } = eC.compiled.state_span;
const ePrefix = eBc.subarray(0, eOff), eSuffix = eBc.subarray(eOff + eLen);
const eTemplateHash = eC.compiled.template_hash;

const encodeState = (c, vals) => B.concat(c.runtime_state.fields.map(f => {
  const t = f.type.kind, x = vals[f.name];
  if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x));
  if (t === 'byte') return pushExplicit(B.from([x]));
  if (t === 'bool') return pushExplicit(B.from([x ? 1 : 0]));
  return pushExplicit(H(x));
}));

const p2sh = R => 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87';

function buildArtChunkRedeem(artistPubKey, chunkHex) {
    const chunkBytes = H(chunkHex);
    const pushData = B.concat([B.from([0x4d]), le16(chunkBytes.length), chunkBytes]);
    const opDrop = B.from([0x75]);
    const pkCheck = B.concat([B.from([0x20]), artistPubKey, B.from([0xac])]);
    return B.concat([pushData, opDrop, pkCheck]);
}
function buildArtChunkSpk(artistPubKey, chunkHex) {
    const redeem = buildArtChunkRedeem(artistPubKey, chunkHex);
    return 'aa20' + hex(blake2b(redeem, { dkLen: 32 })) + '87';
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
        const s = d.toString(); clearTimeout(t); console.log('📥', s.substring(0, 300));
        let txId = null; try { txId = (JSON.parse(s).params || JSON.parse(s).result || {}).transactionId || null; } catch (e) {}
        ws.close(); resolve(txId);
      });
      ws.on('error', e => { clearTimeout(t); tryUrl(k + 1); });
    };
    tryUrl(0);
  });
}

(async () => {
  console.log(`🚀 Deploying v5 Factory with ${chunksData.chunks.length} ArtChunks...`);
  
  const wUtxos = await (await fetchRetry(`https://api-tn10.kaspa.org/addresses/${WALLET}/utxos`)).json();
  wUtxos.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wU = wUtxos[0];
  if (!wU) { console.error('No funding UTXOs found'); process.exit(1); }
  
  const wInput = { 
    txId: wU.outpoint.transactionId, 
    index: wU.outpoint.index, 
    sequence: 0, 
    spk: '20' + USER + 'ac', 
    amount: BigInt(wU.utxoEntry.amount) 
  };

  const facAmt = MIN_DUST; 
  const chunkAmt = MIN_DUST; 
  
  const eTplHashBuf = Array.isArray(eTemplateHash) ? B.from(eTemplateHash) : H(eTemplateHash);

  const fStateWithTemplate = {
    program_hash: chunksData.programHash,
    artist: USER,
    price: 100000000, 
    royalty_bips: 500,
    cap: 64,
    counter: 0,
    edition_template_prefix: hex(ePrefix),
    edition_template_suffix: hex(eSuffix),
    expected_template_hash: hex(eTplHashBuf)
  };

  const facSpk = p2sh(B.concat([fPrefix, encodeState(fC, fStateWithTemplate), fSuffix]));
  
  const facCovId = hex(blake2b(B.concat([
      H(wInput.txId), le32(wInput.index), 
      le64(1), le32(0), le64(facAmt), le16(0), le64(H(facSpk).length), H(facSpk)
  ]), { dkLen: 32, key: B.from('CovenantID') }));

  const outputs = [
    { amount: facAmt, scriptPublicKey: facSpk, covenant: { authorizingInput: 0, covenantId: facCovId } }
  ];

  for (let i = 0; i < chunksData.chunks.length; i++) {
      const chunkSpk = buildArtChunkSpk(H(USER), chunksData.chunks[i]);
      outputs.push({ amount: chunkAmt, scriptPublicKey: chunkSpk }); 
  }

  const totalOutsValue = facAmt + (BigInt(chunksData.chunks.length) * chunkAmt);
  const change = wInput.amount - totalOutsValue - FEE;
  if (change < 0n) { console.error('Insufficient funds for genesis'); process.exit(1); }
  
  outputs.push({ amount: change, scriptPublicKey: wInput.spk });

  const inputs = [wInput];
  const sig0script = '41' + hex(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 0, 0n), PRIV)) + '01';

  const rpcTx = {
    version: 1,
    inputs: inputs.map(inp => ({
      previousOutpoint: { transactionId: inp.txId, index: inp.index },
      signatureScript: sig0script, sequence: 0, sigOpCount: 0, computeBudget: 10
    })),
    outputs: outputs.map(o => ({
      value: Number(o.amount), 
      scriptPublicKey: '0000' + o.scriptPublicKey, 
      ...(o.covenant ? { covenant: o.covenant } : {})
    })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0
  };

  const txId = await broadcast(rpcTx);
  if (txId) {
    console.log('✅ v5 GENESIS DEPLOYED:', txId);
    console.log('🔗 https://kascov.io/testnet-10/tx/' + txId);
    console.log('Factory Covenant ID:', facCovId);
    
    const ledger = {
        covenantId: facCovId,
        genesisTxId: txId,
        txId: txId,
        index: 0,
        counter: 0,
        editions: [],
        artProgramHash: chunksData.programHash,
        chunkCount: chunksData.chunks.length
    };
    fs.writeFileSync('factory-ledger-v5.json', JSON.stringify(ledger, null, 2));
    console.log('✅ Saved factory-ledger-v5.json');
  } else {
    console.error('❌ Broadcast failed');
  }
})().catch(e => { console.error(e); process.exit(1); });
