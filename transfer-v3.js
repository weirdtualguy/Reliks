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
const SIGHASH_KEY = B.from('TransactionSigningHash', 'utf8'); const ZERO32 = B.alloc(32, 0);
const Hash = d => B.from(blake2b(Uint8Array.from(d), { dkLen: 32, key: Uint8Array.from(SIGHASH_KEY) }));
const u8 = v => B.from([v & 0xff]); const varB = b => B.concat([le64(b.length), b]);
const poh = ins => Hash(B.concat(ins.map(i => B.concat([H(i.txId), le32(i.index)]))));
const seqh = ins => Hash(B.concat(ins.map(i => le64(i.sequence || 0))));
const ohv1 = outs => Hash(B.concat(outs.map(o => {
  const p = [le64(o.amount), le16(0), varB(H(o.scriptPublicKey))];
  if (o.covenant) p.push(u8(1), le16(o.covenant.authorizingInput), H(o.covenant.covenantId)); else p.push(u8(0));
  return B.concat(p); })));
const sighash = (ins, outs, idx) => { const i = ins[idx];
  return Hash(B.concat([le16(1), poh(ins), seqh(ins), H(i.txId), le32(i.index), le16(0), varB(H(i.spk)),
    le64(i.amount), le64(i.sequence), ohv1(outs), le64(0), H('00'.repeat(20)), le64(0), ZERO32, u8(1)])); };
const PRIV = 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const WALLET = 'kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd';
const FEE = 2000000n;
async function fetchRetry(url, opts, n) { n = n || 4;
  for (let i = 0; i < n; i++) { try { return await fetch(url, opts); }
    catch (e) { if (i === n - 1) throw e; await new Promise(r => setTimeout(r, 2500)); } } }
function broadcast(rpcTx) {
  const urls = ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json'];
  return new Promise(resolve => { const tryUrl = k => { if (k >= urls.length) return resolve(null);
    const ws = new WebSocket(urls[k], { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
    const t = setTimeout(() => { ws.terminate(); tryUrl(k + 1); }, 15000);
    ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction: rpcTx, allowOrphan: true } })));
    ws.on('message', d => { const s = d.toString(); clearTimeout(t); console.log('📥', s.substring(0, 300));
      let id = null; try { id = (JSON.parse(s).params || JSON.parse(s).result || {}).transactionId || null; } catch (e) {}
      ws.close(); resolve(id); });
    ws.on('error', () => { clearTimeout(t); tryUrl(k + 1); }); }; tryUrl(0); });
}
const E = JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8'));
const c = E.contracts[Object.keys(E.contracts)[0]];
const bc = B.from(c.compiled.bytecode); const sp = c.compiled.state_span;
const prefix = bc.subarray(0, sp.offset), suffix = bc.subarray(sp.offset + sp.len);
const encState = v => B.concat(c.runtime_state.fields.map(f => {
  const t = f.type.kind, x = v[f.name];
  if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x));
  if (t === 'byte') return pushExplicit(B.from([x]));
  return pushExplicit(H(x)); }));
const p2sh = R => 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87';
const tKey = Object.keys(c.entries).find(k => k.indexOf('transfer') >= 0);
const TAG = H(c.entries[tKey].dispatch_tag);
console.log('transfer entry:', tKey, c.entries[tKey].dispatch_tag);
(async () => {
  const [covid, newOwner, sigPriv] = process.argv.slice(2);
  const owner = newOwner || USER;
  const signer = sigPriv || PRIV;
  const led = JSON.parse(fs.readFileSync('editions-ledger.json', 'utf8'));
  const ed = led.find(e => e.covenantId === covid);
  if (!ed) { console.error('not in ledger'); process.exit(1); }
  const oldRedeem = B.concat([prefix, encState(ed), suffix]);
  const oldSpk = p2sh(oldRedeem);
  let utxo;
  for (let i = 0; i < 24; i++) {
    const cov = await (await fetchRetry('https://kascov.io/data/testnet-10/c/' + covid + '.json')).json();
    utxo = cov.utxos.find(u => u.live && u.script_hex === oldSpk);
    if (utxo) break;
    console.log('  indexer lag (' + (i + 1) + '/24)');
    await new Promise(r => setTimeout(r, 5000));
  }
  if (!utxo) { console.error('❌ drift/lag persists'); process.exit(1); }
  const [txId, idx] = utxo.outpoint.split(':');
  const amount = BigInt(utxo.value);
  const w = await (await fetchRetry('https://api-tn10.kaspa.org/addresses/' + WALLET + '/utxos')).json();
  w.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
  const wIn = { txId: w[0].outpoint.transactionId, index: w[0].outpoint.index, sequence: 0, spk: '20' + USER + 'ac', amount: BigInt(w[0].utxoEntry.amount) };
  const newState = { ...ed, ownerIdentifier: owner, identifierType: 0, price: 0 };
  const outputs = [
    { amount, scriptPublicKey: p2sh(B.concat([prefix, encState(newState), suffix])), covenant: { authorizingInput: 0, covenantId: covid } },
    { amount: wIn.amount - FEE, scriptPublicKey: wIn.spk }
  ];
  const inputs = [{ txId, index: parseInt(idx), sequence: 0, spk: oldSpk, amount }, wIn];
  const sig0 = B.concat([secp.schnorr.signSync(sighash(inputs, outputs, 0), signer), B.from([0x01])]);
  const sig0script = hex(B.concat([pushExplicit(sig0), pushExplicit(H(owner)), pushExplicit(B.from([0])), pushExplicit(TAG), pushExplicit(oldRedeem)]));
  const sig1script = '41' + hex(secp.schnorr.signSync(sighash(inputs, outputs, 1), PRIV)) + '01';
  const tx = { version: 1, lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0,
    inputs: [
      { previousOutpoint: { transactionId: txId, index: parseInt(idx) }, signatureScript: sig0script, sequence: 0, sigOpCount: 0, computeBudget: 60 },
      { previousOutpoint: { transactionId: wIn.txId, index: wIn.index }, signatureScript: sig1script, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
    outputs: outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const out = await broadcast(tx);
  if (out) { ed.ownerIdentifier = owner; ed.identifierType = 0; ed.price = 0;
    fs.writeFileSync('editions-ledger.json', JSON.stringify(led, null, 2));
    console.log('✅ TRANSFERRED to', owner.slice(0, 8) + '…', out); }
  else console.error('❌ broadcast failed');
})().catch(e => { console.error(e); process.exit(1); });
