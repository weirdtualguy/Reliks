import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake3 } from '@noble/hashes/blake3';
import { blake2b } from '@noble/hashes/blake2b';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const COV = '4783a3d844a2cc356e54a821865174dc571f9e014ee7eae27ac926e1e56c4435';
const PROG = fs.readFileSync('token2-program.hex', 'utf8').trim();
const SPK = 'aa20' + Buffer.from(blake2b(Buffer.from(PROG, 'hex'), { dkLen: 32 })).toString('hex') + '87';
const TAG_SELL = Buffer.from(blake3('__covenant_entrypoint_auth_sell(sig,byte[32],byte,int,int)').slice(0, 4));
const PRICE = 100000000n;

class SB { private p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  int(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v >= 1n && v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b;
    this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }

(async () => {
  const coin: any = await (await fetch(`https://kascov.io/data/testnet-10/c/${COV}.json`)).json();
  const genesis = coin.events[0].txid;
  console.log('genesis:', genesis, '| lifecycle:', coin.events.map((e: any) => e.kind).join('→'));
  const r = await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos');
  const u: any[] = await r.json() as any[];
  const best = u.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  const w: UtxoInput = { txId: best.outpoint.transactionId, index: best.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(best.utxoEntry.amount) };
  const coinValue = 1000000000n;
  const inputs: UtxoInput[] = [{ txId: genesis, index: 0, sequence: 0, spk: SPK, amount: coinValue }, w];
  const outputs: (TxOutput & { covenant?: any })[] = [
    { amount: coinValue, scriptPublicKey: SPK, covenant: { authorizingInput: 0, covenantId: COV } },
    { amount: PRICE, scriptPublicKey: `20${USER}ac` },
    { amount: w.amount - PRICE - 2000000n, scriptPublicKey: `20${USER}ac` }];
  const sig0 = Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 0, 0n), PRIV)).toString('hex') + '01';
  const sig1 = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 1, 0n), PRIV)).toString('hex') + '01';
  const sb = new SB();
  sb.data(Buffer.from(sig0, 'hex')); sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(PRICE); sb.int(1n); sb.data(TAG_SELL); sb.data(Buffer.from(PROG, 'hex'));
  const tx = { version: 1, inputs: [
    { previousOutpoint: { transactionId: genesis, index: 0 }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 15 },
    { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: sig1, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
    outputs: outputs.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
    lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
  const body = { ...tx, gas: 0, inputs: tx.inputs.map((i: any, k: number) => ({ ...i, utxo: { amount: Number(k === 0 ? coinValue : w.amount), scriptPublicKey: { version: 0, script: k === 0 ? SPK : `20${USER}ac` }, ...(k === 0 ? { covenantId: COV } : {}) } })),
    outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  console.log('preflight:', pf.verdict, JSON.stringify((pf.executed || []).map((e: any) => [e.input_index, e.pass, e.script_units_used])));
  if (pf.verdict !== 'ready') { console.log(JSON.stringify(pf.findings, null, 1)); process.exit(1); }
  const transaction = { ...tx, gas: 0, mass: pf.masses.storage,
    outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const WebSocket = require('ws');
  for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
    const ok = await new Promise<boolean>(res => {
      const ws = new WebSocket(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); res(false); }, 12000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
      ws.on('message', (d: any) => { const s = d.toString(); console.log('📥', s.substring(0, 300)); clearTimeout(t);
        if (s.includes('transactionId')) { console.log('🎉 FACE REVEAL TX:', JSON.parse(s).params.transactionId); res(true); } else res(false); });
      ws.on('error', () => { clearTimeout(t); res(false); });
    });
    if (ok) break;
  }
})();
