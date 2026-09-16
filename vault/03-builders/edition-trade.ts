import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake3 } from '@noble/hashes/blake3';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import { compileSeries } from './bridge3';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const S = JSON.parse(fs.readFileSync('series.json', 'utf8'));
const F = JSON.parse(fs.readFileSync('factory.json', 'utf8'));
const TAG_LIST = Buffer.from(blake3('__covenant_entrypoint_auth_list(sig,int)').slice(0, 4));
const TAG_BUY = Buffer.from(blake3('__covenant_entrypoint_auth_buy(byte[32],byte,int,int)').slice(0, 4));
const PRICE = 100000000n, ROYALTY = PRICE / 20n, FEE = 2000000n;
class SB { p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  int(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b; this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });
const wallet = async (): Promise<UtxoInput> => {
  const u: any[] = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json() as any[];
  const b = u.sort((a, x) => Number(BigInt(x.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  return { txId: b.outpoint.transactionId, index: b.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(b.utxoEntry.amount) }; };
const preflight = async (tx: any, utxos: any[]) => {
  const body = { ...tx, gas: 0, inputs: tx.inputs.map((i: any, k: number) => ({ ...i, utxo: utxos[k] })),
    outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  return await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json(); };
const broadcast = async (tx: any, pf: any): Promise<string | null> => {
  const transaction = { ...tx, gas: 0, mass: pf.masses.storage, outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const WS = require('ws');
  for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
    const id: string | null = await new Promise(res => { const ws = new WS(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); res(null); }, 12000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
      ws.on('message', (d: any) => { const s = d.toString(); console.log('📥', s.substring(0, 200)); clearTimeout(t);
        res(s.includes('transactionId') ? JSON.parse(s).params.transactionId : null); });
      ws.on('error', () => { clearTimeout(t); res(null); }); });
    if (id) return id; }
  return null; };
const bind = { authorizingInput: 0, covenantId: F.covenantId };
(async () => {
  // ── LIST: edition #0 (counter 0, price 0) → price = 1 TKAS
  const ed = compileSeries({ slot: S.slotHex, artist: USER, price: 0, cap: 64, role: 1, counter: 0, owner: USER });
  const listed = compileSeries({ slot: S.slotHex, artist: USER, price: Number(PRICE), cap: 64, role: 1, counter: 0, owner: USER });
  const w1 = await wallet();
  const edUtxo: UtxoInput = { txId: F.lastMint, index: 0, sequence: 0, spk: ed.scriptPublicKey, amount: 1000000000n };
  const lIn: UtxoInput[] = [edUtxo, w1];
  const lOut = [out(1000000000n, listed.scriptPublicKey, bind), out(w1.amount - FEE, `20${USER}ac`)];
  const sig0 = Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(lIn, lOut, 0, 0n), PRIV)).toString('hex') + '01';
  const sb1 = new SB(); sb1.data(Buffer.from(sig0, 'hex')); sb1.int(PRICE); sb1.data(TAG_LIST); sb1.data(Buffer.from(ed.bytecodeHex, 'hex'));
  const w1sig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(lIn, lOut, 1, 0n), PRIV)).toString('hex') + '01';
  const ltx = { version: 1, inputs: [
      { previousOutpoint: { transactionId: edUtxo.txId, index: 0 }, signatureScript: sb1.hex(), sequence: 0, sigOpCount: 0, computeBudget: 15 },
      { previousOutpoint: { transactionId: w1.txId, index: w1.index }, signatureScript: w1sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
    outputs: lOut.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
  const pf1: any = await preflight(ltx, [{ amount: '1000000000', scriptPublicKey: { version: 0, script: ed.scriptPublicKey }, covenantId: F.covenantId }, { amount: w1.amount.toString(), scriptPublicKey: { version: 0, script: w1.spk } }]);
  console.log('list preflight:', pf1.verdict, JSON.stringify((pf1.executed || []).map((e: any) => e.script_units_used)));
  if (pf1.verdict !== 'ready') { console.log(JSON.stringify(pf1.findings)); process.exit(1); }
  const listTxid = await broadcast(ltx, pf1); if (!listTxid) { console.log('❌ list broadcast failed'); process.exit(1); }
  console.log('🏷️ LISTED @ 1 TKAS:', listTxid);
  await new Promise(r => setTimeout(r, 5000));
  // ── BUY: trustless, no owner sig; seller gets PRICE, artist gets 5% royalty
  const bought = compileSeries({ slot: S.slotHex, artist: USER, price: 0, cap: 64, role: 1, counter: 0, owner: USER });
  const w2 = await wallet();
  const liUtxo: UtxoInput = { txId: listTxid, index: 0, sequence: 0, spk: listed.scriptPublicKey, amount: 1000000000n };
  const bIn: UtxoInput[] = [liUtxo, w2];
  const bOut = [out(1000000000n, bought.scriptPublicKey, bind), out(PRICE, `20${USER}ac`), out(ROYALTY, `20${USER}ac`), out(w2.amount - PRICE - ROYALTY - FEE, `20${USER}ac`)];
  const sb2 = new SB(); sb2.data(Buffer.from(USER, 'hex')); sb2.data(Buffer.from([0])); sb2.int(1n); sb2.int(2n); sb2.data(TAG_BUY); sb2.data(Buffer.from(listed.bytecodeHex, 'hex'));
  const w2sig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(bIn, bOut, 1, 0n), PRIV)).toString('hex') + '01';
  const btx = { version: 1, inputs: [
      { previousOutpoint: { transactionId: liUtxo.txId, index: 0 }, signatureScript: sb2.hex(), sequence: 0, sigOpCount: 0, computeBudget: 15 },
      { previousOutpoint: { transactionId: w2.txId, index: w2.index }, signatureScript: w2sig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
    outputs: bOut.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
  const pf2: any = await preflight(btx, [{ amount: '1000000000', scriptPublicKey: { version: 0, script: listed.scriptPublicKey }, covenantId: F.covenantId }, { amount: w2.amount.toString(), scriptPublicKey: { version: 0, script: w2.spk } }]);
  console.log('buy preflight:', pf2.verdict, JSON.stringify((pf2.executed || []).map((e: any) => e.script_units_used)));
  if (pf2.verdict !== 'ready') { console.log(JSON.stringify(pf2.findings)); process.exit(1); }
  const buyTxid = await broadcast(btx, pf2); if (!buyTxid) { console.log('❌ buy broadcast failed'); process.exit(1); }
  console.log('💰 BOUGHT (seller +1 TKAS, artist +0.05 TKAS royalty):', buyTxid);
  fs.writeFileSync('edition0.json', JSON.stringify({ mint: F.lastMint, list: listTxid, buy: buyTxid }, null, 1));
})();
