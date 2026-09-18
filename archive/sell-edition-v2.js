const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const secp = require('@noble/secp256k1');
const crypto = require('crypto');
const WebSocket = require('ws');
secp.utils.sha256Sync = (...m) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const B = Buffer; const hex = b => B.from(b).toString('hex'); const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = n => { const b = B.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
function pushExplicit(p) { const n = p.length;
  if (n === 0) return B.from([0x00]); if (n <= 75) return B.concat([B.from([n]), p]);
  if (n <= 255) return B.concat([B.from([0x4c, n]), p]);
  return B.concat([B.from([0x4d]), le16(n), p]); }
function pushMinimalInt(val) {
  if (val === 0) return B.from([0x00]); if (val >= 1 && val <= 16) return B.from([0x50 + val]);
  if (val === -1) return B.from([0x4f]);
  let h = val.toString(16); if (h.length % 2) h = '0' + h;
  let b = B.from(h, 'hex').reverse(); if (b[b.length - 1] & 0x80) b = B.concat([b, B.from([0])]);
  return B.concat([B.from([b.length]), b]); }
const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8'); const ZERO32 = B.alloc(32, 0);
const Hash = d => B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
const u8 = v => B.from([v & 0xff]); const varB = b => B.concat([le64(b.length), b]);
const previous_outputs_hash = ins => Hash(B.concat(ins.map(i => B.concat([H(i.txId), le32(i.index)]))));
const sequences_hash = ins => Hash(B.concat(ins.map(i => le64(i.sequence || 0))));
const outputs_hash_v1 = outs => Hash(B.concat(outs.map(o => {
  const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))];
  if (o.covenant) p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId)); else p.push(u8(0));
  return B.concat(p); })));
const kaspa_sighash_v1 = (inputs, outputs, idx, gas = 0n) => { const inp = inputs[idx];
  return Hash(B.concat([le16(1), previous_outputs_hash(inputs), sequences_hash(inputs), H(inp.txId), le32(inp.index),
    le16(0), varB(H(inp.spk)), le64(inp.amount), le64(inp.sequence), outputs_hash_v1(outputs),
    le64(0), H('00'.repeat(20)), le64(gas), ZERO32, u8(1)])); };

const PRIV = require('./config').PRIV;
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const MIN_DUST = 100000000n; const FEE = 2000000n;
const TAG_SELL = H('616a2258');

const eAbi = JSON.parse(fs.readFileSync('edition-abi-v2.json', 'utf8'));
const c = eAbi.contracts[Object.keys(eAbi.contracts)[0]];
const bc = B.from(c.compiled.bytecode);
const { offset, len } = c.compiled.state_span;
const prefix = bc.subarray(0, offset), suffix = bc.subarray(offset + len);
const encodeState = v => B.concat(c.runtime_state.fields.map(f => {
  const t = f.type.kind, x = v[f.name];
  if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x));
  if (t === 'byte') return pushExplicit(B.from([x]));
  return pushExplicit(H(x)); }));
const p2sh = R => 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87';

async function fetchRetry(url, opts, retries = 4) {
  for (let i = 0; i < retries; i++) {
    try { return await fetch(url, opts); } 
    catch (e) { if (i === retries - 1) throw e; await new Promise(r => setTimeout(r, 2500)); }
  }
}

(async () => {
  const [covid, askPriceStr, buyerHex] = process.argv.slice(2);
  if (!covid || !askPriceStr) { console.log('Usage: node sell-edition.js <covenantId> <askPrice> [buyerPubkeyHex]'); process.exit(1); }
  const askPrice = parseInt(askPriceStr);
  const buyer = buyerHex || USER; // Default to selling to ourselves for the demo
  
  const ledgerPath = 'editions-ledger.json';
  const editions = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  const ed = editions.find(e => e.covenantId === covid);
  if (!ed) { console.error('Edition not in ledger'); process.exit(1); }
  if (ed.ownerIdentifier !== USER) { console.error('You are not the owner!'); process.exit(1); }

  const oldRedeem = B.concat([prefix, encodeState(ed), suffix]);
  const oldSpk = p2sh(oldRedeem);
  
  let cov, utxo;
  for (let i = 1; i <= 12; i++) {
    cov = await (await fetchRetry(`https://kascov.io/data/testnet-10/c/${covid}.json`)).json();
    utxo = cov.utxos.find(u => u.live && u.script_hex === oldSpk);
    if (utxo) break;
    console.log(`  indexer lag... (${i}/12)`);
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!utxo) { console.error('❌ P2SH drift persists'); process.exit(1); }
  
  const [txId, idxStr] = utxo.outpoint.split(':');
  const index = parseInt(idxStr); const amount = BigInt(utxo.value);

  const wUtxos = await (await fetchRetry(`https://api-tn10.kaspa.org/addresses/${WALLET}/utxos`)).json();
  wUtxos.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wU = wUtxos[0];
  const wInput = { txId: wU.outpoint.transactionId, index: wU.outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(wU.utxoEntry.amount) };

  const royalty = Math.floor(askPrice * Number(ed.royalty_bips) / 10000);
  const out0 = amount > MIN_DUST ? amount : MIN_DUST; // Edition continuation
  const out1 = BigInt(askPrice);                      // Seller payout
  const out2 = BigInt(royalty) > MIN_DUST ? BigInt(royalty) : MIN_DUST; // Royalty
  const totalCost = out1 + out2;
  const change = wInput.amount + amount - out0 - totalCost - FEE;
  if (change < 0n) { console.error('Insufficient wallet funds'); process.exit(1); }

  const scheme = 0;
  const newState = { ...ed, ownerIdentifier: buyer, identifierType: scheme, price: 0 };
  const outputs = [
    { amount: out0, scriptPublicKey: p2sh(B.concat([prefix, encodeState(newState), suffix])), covenant: { authorizingInput: 0, covenantId: covid } },
    { amount: out1, scriptPublicKey: '20' + ed.ownerIdentifier + 'ac' },
    { amount: out2, scriptPublicKey: '20' + ed.artist + 'ac' },
    { amount: change, scriptPublicKey: wInput.spk }
  ];
  const inputs = [{ txId, index, sequence: 0, spk: oldSpk, amount }, wInput];

  console.log(`Executing OTC Sell: ${askPrice} sompi to buyer ${buyer.substring(0,8)}...`);
  
  // 1. Owner signs the transaction digest (authorizing the specific askPrice and buyer)
  const digest0 = kaspa_sighash_v1(inputs, outputs, 0, 0n);
  const ownerSig = B.concat([secp.schnorr.signSync(digest0, PRIV), B.from([0x01])]);
  
  const sig0_script = B.concat([
    pushExplicit(ownerSig),       // sig (65 bytes)
    pushExplicit(H(buyer)),       // buyer byte[32]
    pushExplicit(B.from([scheme])),// scheme byte
    pushMinimalInt(askPrice),     // askPrice int
    pushMinimalInt(1),            // paymentOutIdx
    pushMinimalInt(2),            // royaltyOutIdx
    pushExplicit(TAG_SELL),       // 616a2258
    pushExplicit(oldRedeem)
  ]);

  // 2. Buyer (wallet) signs to fund the transaction
  const digest1 = kaspa_sighash_v1(inputs, outputs, 1, 0n);
  const sig1_script = '41' + hex(secp.schnorr.signSync(digest1, PRIV)) + '01';

  const rpcTx = {
    version: 1,
    inputs: inputs.map((inp, k) => ({ previousOutpoint: { transactionId: inp.txId, index: inp.index },
      signatureScript: k === 0 ? hex(sig0_script) : sig1_script, sequence: 0, sigOpCount: 0, computeBudget: k === 0 ? 60 : 10 })),
    outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0
  };

  const ws = new WebSocket('wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
  ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
  ws.on('message', d => {
    const s = d.toString(); console.log('📥', s.substring(0, 300));
    if (s.includes('transactionId')) {
      const txId = (JSON.parse(s).params || JSON.parse(s).result).transactionId;
      ed.ownerIdentifier = buyer; ed.identifierType = scheme; ed.price = 0;
      fs.writeFileSync(ledgerPath, JSON.stringify(editions, null, 2));
      console.log('✅ SUCCESS! TxId:', txId); console.log(`🔗 https://kascov.io/testnet-10/tx/${txId}`);
    }
    ws.close();
  });
  ws.on('error', err => console.error('WS Error:', err.message));
})();
