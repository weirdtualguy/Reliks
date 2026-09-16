const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const secp = require('@noble/secp256k1');
const crypto = require('crypto');
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
function Hash(d) { return B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) })); }
const u8 = v => B.from([v & 0xff]); const varB = b => B.concat([le64(b.length), b]);
const previous_outputs_hash = i => Hash(B.concat(i.map(x => B.concat([H(x.txId), le32(x.index)]))));
const sequences_hash = i => Hash(B.concat(i.map(x => le64(x.sequence || 0))));
const outputs_hash_v1 = o => Hash(B.concat(o.map(x => {
  const p = [le64(x.amount), le16(0), varB(H(x.scriptPublicKey))];
  if (x.covenant) p.push(u8(1), le16(x.covenant.authorizingInput), H(x.covenant.covenantId)); else p.push(u8(0));
  return B.concat(p); })));
const kaspa_sighash_v1 = (inputs, outputs, idx, gas = 0n) => { const inp = inputs[idx];
  return Hash(B.concat([le16(1), previous_outputs_hash(inputs), sequences_hash(inputs), H(inp.txId), le32(inp.index), le16(0), varB(H(inp.spk)), le64(inp.amount), le64(inp.sequence), outputs_hash_v1(outputs), le64(0), H('00'.repeat(20)), le64(gas), ZERO32, u8(1)])); };

const PRIV = 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const eAbi = JSON.parse(fs.readFileSync('edition-abi.json', 'utf8'));
const c = eAbi.contracts[Object.keys(eAbi.contracts)[0]];
const bc = B.from(c.compiled.bytecode);
const { offset, len } = c.compiled.state_span;
const prefix = bc.subarray(0, offset), suffix = bc.subarray(offset + len);
const encodeState = v => B.concat(c.runtime_state.fields.map(f => {
  const t = f.type.kind, x = v[f.name];
  if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x));
  if (t === 'byte') return pushExplicit(B.from([x]));
  return pushExplicit(H(x)); }));
const TAG_LIST = H('5703f99d');

(async () => {
  const covid = process.argv[2], newPrice = parseInt(process.argv[3]);
  const ed = JSON.parse(fs.readFileSync('editions-ledger.json', 'utf8')).find(e => e.covenantId === covid);
  const cov = await (await fetch(`https://kascov.io/data/testnet-10/c/${covid}.json`)).json();
  const utxo = cov.utxos.find(u => u.live);
  const [txId, index] = utxo.outpoint.split(':');
  const amount = BigInt(utxo.value);

  const oldRedeem = B.concat([prefix, encodeState(ed), suffix]);
  const oldSpk = 'aa20' + hex(blake2b(oldRedeem, { dkLen: 32 })) + '87';
  console.log('computed input0 spk :', oldSpk);
  console.log('onchain  input0 spk :', utxo.script_hex);
  console.log('P2SH match          :', oldSpk === utxo.script_hex ? 'YES' : 'NO  <-- state drift!');

  const newState = { ...ed, price: newPrice };
  const newSpk = 'aa20' + hex(blake2b(B.concat([prefix, encodeState(newState), suffix]), { dkLen: 32 })) + '87';

  const w = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json();
  w.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wU = w[0]; const wSpk = '20' + USER + 'ac';
  const wAmount = BigInt(wU.utxoEntry.amount);

  const outputs = [
    { amount, scriptPublicKey: newSpk, covenant: { authorizingInput: 0, covenantId: covid } },
    { amount: wAmount - 2000000n, scriptPublicKey: wSpk }
  ];
  const inputs = [
    { txId, index: parseInt(index), sequence: 0, spk: oldSpk, amount },
    { txId: wU.outpoint.transactionId, index: wU.outpoint.index, sequence: 0, spk: wSpk, amount: wAmount }
  ];
  const sig0 = B.concat([secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 0, 0n), PRIV), B.from([0x01])]);
  const sig0_script = B.concat([pushExplicit(sig0), pushMinimalInt(newPrice), pushExplicit(TAG_LIST), pushExplicit(oldRedeem)]);
  const sig1_script = '41' + hex(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 1, 0n), PRIV)) + '01';

  const tx = {
    version: 1, lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0,
    inputs: [
      { previousOutpoint: { transactionId: txId, index: parseInt(index) }, signatureScript: hex(sig0_script), sequence: 0, sigOpCount: 0, computeBudget: 60 },
      { previousOutpoint: { transactionId: wU.outpoint.transactionId, index: wU.outpoint.index }, signatureScript: sig1_script, sequence: 0, sigOpCount: 0, computeBudget: 10 }
    ],
    outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) }))
  };
  const body = {
    ...tx,
    inputs: tx.inputs.map((i, k) => ({ ...i, utxo: { amount: Number(inputs[k].amount), scriptPublicKey: { version: 0, script: inputs[k].spk }, ...(k === 0 ? { covenantId: covid } : {}) } })),
    outputs: tx.outputs.map(o => ({ value: o.value, scriptPublicKey: { version: 0, script: o.scriptPublicKey.slice(4) }, ...(o.covenant ? { covenant: o.covenant } : {}) }))
  };
  const pf = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  console.log('\nverdict :', pf.verdict);
  console.log('executed:', JSON.stringify(pf.executed, null, 2));
  console.log('findings:', JSON.stringify(pf.findings, null, 2));
  console.log('note    :', pf.execution_note);
})();
