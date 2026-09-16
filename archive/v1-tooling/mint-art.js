const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const secp = require('@noble/secp256k1');
const crypto = require('crypto');
const WebSocket = require('ws');

secp.utils.sha256Sync = (...m) => {
  const h = crypto.createHash('sha256');
  m.forEach(b => h.update(b));
  return h.digest();
};

const B = Buffer;
const hex = b => B.from(b).toString('hex');
const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = n => { const b = B.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

const pushExplicit = p => {
  const n = p.length;
  if (n === 0) return B.from([0x00]);
  if (n <= 75) return B.concat([B.from([n]), p]);
  if (n <= 255) return B.concat([B.from([0x4c, n]), p]);
  if (n <= 65535) return B.concat([B.from([0x4d]), le16(n), p]);
  return B.concat([B.from([0x4e]), le32(n), p]);
};

const payload = (ty, v) => {
  if (ty.kind === 'int' || ty.kind === 'temporal') return sm8(v);
  if (ty.kind === 'byte') return B.from([v]);
  if (ty.kind === 'bool') return B.from([v ? 1 : 0]);
  if (ty.kind === 'fixed_bytes') return H(v);
  throw new Error('unsupported ' + ty.kind);
};

const encodeState = (abi, cn, vals) =>
  B.concat(abi.contracts[cn].runtime_state.fields.map(f => pushExplicit(payload(f.type, vals[f.name]))));

const parts = (abi, cn) => {
  const c = abi.contracts[cn];
  const bc = B.from(c.compiled.bytecode);
  const { offset, len } = c.compiled.state_span;
  return { prefix: bc.subarray(0, offset), suffix: bc.subarray(offset + len), bc };
};

const p2sh = R => B.concat([B.from([0xaa, 0x20]), blake2b(R, { dkLen: 32 }), B.from([0x87])]);

const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8');
const ZERO32 = B.alloc(32, 0);
function Hash(d) {
  return B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
}
const u8 = v => B.from([v & 0xff]);
const varB = b => B.concat([le64(b.length), b]);

function previous_outputs_hash(inputs) {
  return Hash(B.concat(inputs.map(i => B.concat([H(i.txId), le32(i.index)]))));
}
function sequences_hash(inputs) {
  return Hash(B.concat(inputs.map(i => le64(i.sequence || 0))));
}
function outputs_hash_v1(outputs) {
  return Hash(B.concat(outputs.map(o => {
    const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))];
    if (o.covenant) {
      p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId));
    } else {
      p.push(u8(0));
    }
    return B.concat(p);
  })));
}

function kaspa_sighash_v1(inputs, outputs, inputIndex, gas = 0n) {
  const inp = inputs[inputIndex];
  const P = [];
  P.push(le16(1)); 
  P.push(previous_outputs_hash(inputs));
  P.push(sequences_hash(inputs));
  P.push(H(inp.txId));
  P.push(le32(inp.index));
  P.push(le16(0)); 
  P.push(varB(H(inp.spk)));
  P.push(le64(inp.amount));
  P.push(le64(inp.sequence));
  P.push(outputs_hash_v1(outputs));
  P.push(le64(0)); 
  P.push(H('00'.repeat(20))); 
  P.push(le64(gas));
  P.push(ZERO32); 
  P.push(u8(1)); 
  return Hash(B.concat(P));
}

async function main() {
  const PRIV = 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
  const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
  let FACT_COV;
  const LEDGER = JSON.parse(fs.readFileSync('factory-ledger-art.json', 'utf8')); FACT_COV = LEDGER.covenantId; const FACT_TX = LEDGER.txId; const COUNTER = LEDGER.counter;
  let FACT_SPK = '';
  const FACT_VAL = 500000000n;

  console.log('Loading ABIs...');
  const fAbi = JSON.parse(fs.readFileSync('factory-abi-art.json', 'utf8'));
  const eAbi = JSON.parse(fs.readFileSync('edition-abi.json', 'utf8'));
  const fN = Object.keys(fAbi.contracts)[0], eN = Object.keys(eAbi.contracts)[0];
  
  const ART = fs.readFileSync('art-program.hex', 'utf8').trim();
  const programHash = hex(blake2b(H(ART), { dkLen: 32 }));
  const fp = parts(fAbi, fN), ep = parts(eAbi, eN);
  const curState = encodeState(fAbi, fN, { art: ART, artist: USER, price: 100000000, royalty_bips: 500, cap: 64, counter: COUNTER });
  FACT_SPK = hex(p2sh(B.concat([fp.prefix, curState, fp.suffix])));

  console.log('Fetching wallet UTXOs...');
  const utxoRes = await fetch(`https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos`);
  const utxos = await utxoRes.json();
  
  utxos.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wUtxo = utxos[0];
  const wTxId = wUtxo.outpoint.transactionId;
  const wIdx = wUtxo.outpoint.index;
  const wAmount = BigInt(wUtxo.utxoEntry.amount);
  const wSpk = '20' + USER + 'ac';
  
  console.log(`Using wallet UTXO: ${wTxId}:${wIdx} (${wAmount} sompi)`);

  const Rnext = B.concat([fp.prefix, encodeState(fAbi, fN,
    { art: ART, artist: USER, price: 100000000, royalty_bips: 500, cap: 64, counter: COUNTER + 1 }), fp.suffix]);
  const spkF = hex(p2sh(Rnext));

  const Red = B.concat([ep.prefix, encodeState(eAbi, eN,
    { ownerIdentifier: USER, identifierType: 0, price: 0, artist: USER,
      royalty_bips: 500, program_hash: programHash, factory_covid: FACT_COV, serial: COUNTER }), ep.suffix]);
  const spkE = hex(p2sh(Red));

  const personal = B.concat([B.from('CovenantID'), B.alloc(6)]);
  const edCov = hex(blake2b(B.concat([
    H(wTxId), le32(wIdx),
    le64(1), le32(1), le64(10000000), le16(0), le64(H(spkE).length), H(spkE)
  ]), { dkLen: 32, key: B.from('CovenantID') }));

  const artistPayment = 100000000n;
  const editionDust = 10000000n;
  const fee = 2000000n;
  const change = wAmount - artistPayment - editionDust - fee;

  if (change < 0n) {
    console.error('❌ Insufficient wallet funds for artist payment + fee');
    process.exit(1);
  }

  const outputs = [
    { amount: FACT_VAL, scriptPublicKey: spkF, covenant: { authorizingInput: 0, covenantId: FACT_COV } },
    { amount: editionDust, scriptPublicKey: spkE, covenant: { authorizingInput: 1, covenantId: edCov } },
    { amount: artistPayment, scriptPublicKey: wSpk },
    { amount: change, scriptPublicKey: wSpk }
  ];

  const tag = H(fAbi.contracts[fN].entries.mint.dispatch_tag);
  const sig = B.concat([
    pushExplicit(H(USER)), 
    B.from([0x52]), // OP_2 (paymentOutIdx)
    B.from([0x51]), // OP_1 (editionOutIdx)
    B.from([0x04]), tag, 
    pushExplicit(B.concat([fp.prefix, curState, fp.suffix]))
  ]);

  const inputs = [
    { txId: FACT_TX, index: 0, sequence: 0, spk: FACT_SPK, amount: FACT_VAL },
    { txId: wTxId, index: wIdx, sequence: 0, spk: wSpk, amount: wAmount }
  ];

  console.log('Computing sighash and signing wallet input...');
  const digest = kaspa_sighash_v1(inputs, outputs, 1, 0n);
  const signatureBytes = secp.schnorr.signSync(digest, PRIV);
  const walletSigScript = '41' + B.from(signatureBytes).toString('hex') + '01';

  // EXACT WIRE FORMAT FROM mint-v2.ts
  const rpcTx = {
    version: 1,
    inputs: [
      {
        previousOutpoint: { transactionId: FACT_TX, index: 0 },
        signatureScript: hex(sig),
        sequence: 0, sigOpCount: 0, computeBudget: 60
      },
      {
        previousOutpoint: { transactionId: wTxId, index: wIdx },
        signatureScript: walletSigScript,
        sequence: 0, sigOpCount: 0, computeBudget: 10
      }
    ],
    outputs: outputs.map(o => ({
      value: Number(o.amount), // MUST BE NUMBER
      scriptPublicKey: '0000' + o.scriptPublicKey,
      ...(o.covenant ? { covenant: o.covenant } : {})
    })),
    lockTime: 0,
    subnetworkId: '00'.repeat(20),
    gas: 0, // MUST BE NUMBER
    payload: '',
    mass: 0
  };

  fs.writeFileSync('mint-next-tx.json', JSON.stringify(rpcTx, null, 2)); console.log('Broadcasting...');
  const ws = new WebSocket('wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' }
  });

  ws.on('open', () => {
    ws.send(JSON.stringify({
      id: 1,
      method: 'submitTransaction',
      params: { transaction: rpcTx, allowOrphan: true }
    }));
  });

  ws.on('message', d => {
    const s = d.toString();
    console.log('📥', s.substring(0, 300));
    if (s.includes('transactionId')) {
      const txId = (JSON.parse(s).params || JSON.parse(s).result).transactionId; LEDGER.editions.push(edCov);
      LEDGER.txId = txId; LEDGER.index = 0; LEDGER.counter = COUNTER + 1; fs.writeFileSync('factory-ledger-art.json', JSON.stringify(LEDGER, null, 2)); console.log('🌸 EDITION #' + COUNTER + ' MINTED! ledger updated.');
      console.log('TxId:', txId);
      console.log(`https://kascov.io/testnet-10/tx/${txId}`);
    }
    ws.close();
  });

  ws.on('error', err => console.error('WS Error:', err.message));
}

main().catch(e => console.error(e));
