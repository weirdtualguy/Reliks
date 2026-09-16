import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake2b } from '@noble/hashes/blake2b';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import { compileSeries } from './bridge3';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const FPATH = process.argv[2] || 'factory2.json';
const F2 = JSON.parse(fs.readFileSync(FPATH, 'utf8'));
const PROG = fs.readFileSync(FPATH.replace('.json', '-program.hex'), 'utf8').trim();
const FSPK = 'aa20' + Buffer.from(blake2b(Buffer.from(PROG, 'hex'), { dkLen: 32 })).toString('hex') + '87';
const TAG = Buffer.from(F2.mintTag || '42c6a550', 'hex');
class SB { p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  int(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b; this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }
const i8 = (v: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v), 0); return b; };
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function wallet(spent: Set<string>): Promise<UtxoInput> {
  for (let t = 0; t < 4; t++) {
    const u: any[] = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json() as any[];
    const c = u.filter(x => !spent.has(x.outpoint.transactionId + ':' + x.outpoint.index))
      .sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)));
    if (c.length && BigInt(c[0].utxoEntry.amount) > 200000000n)
      return { txId: c[0].outpoint.transactionId, index: c[0].outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(c[0].utxoEntry.amount) };
    await sleep(4000);
  }
  throw new Error('no usable wallet utxo');
}
const broadcast = async (tx: any, pf: any): Promise<string | null> => {
  const transaction = { ...tx, gas: 0, mass: pf.masses.storage, outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
  const WS = require('ws');
  for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
    const id: string | null = await new Promise(res => { const ws = new WS(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
      const t = setTimeout(() => { ws.terminate(); res(null); }, 12000);
      ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
      ws.on('message', (d: any) => { const s = d.toString(); clearTimeout(t); res(s.includes('transactionId') ? JSON.parse(s).params.transactionId : null); });
      ws.on('error', () => { clearTimeout(t); res(null); }); });
    if (id) return id;
  }
  return null;
};
const bind = { authorizingInput: 0, covenantId: F2.covenantId };
(async () => {
  const F = JSON.parse(fs.readFileSync(FPATH, 'utf8'));
  const spent = new Set<string>(); const mints: { k: number; txid: string }[] = [];
  let prevTx = F.lastMint || F.genesis, prevIdx = F.counter === 0 ? 0 : 1;
  const slot = F.slotHex.replace(/^0x/, ''), usr = USER.replace(/^0x/, '');
  const START = F.counter; const END = Math.min(START + 5, 64);
  for (let k = START; k < END; k++) {
    const V = k === 0 ? 1000000000n : 50000000n;
    const child = compileSeries({ slot: F.slotHex, artist: USER, price: 0, cap: 64, role: 1, counter: k, owner: USER });
    const nextF = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k + 1, owner: USER });
    const fab = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k, owner: USER });
    const w = await wallet(spent);
    const inputs: UtxoInput[] = [{ txId: prevTx, index: prevIdx, sequence: 0, spk: fab.scriptPublicKey, amount: V }, w];
    const outputs = [out(V, child.scriptPublicKey, bind), out(50000000n, nextF.scriptPublicKey, bind),
      out(100000000n, `20${USER}ac`), out(w.amount - 150000000n - 2000000n, `20${USER}ac`)];
    const sb = new SB();
    sb.data(Buffer.from(slot + slot, 'hex'));                       // slot[]
    sb.data(Buffer.from(usr + usr, 'hex'));                         // artist[]
    sb.data(Buffer.concat([i8(0), i8(100000000)]));                 // price[]
    sb.data(Buffer.concat([i8(64), i8(64)]));                       // cap[]
    sb.data(Buffer.from([1, 0]));                                   // role[]
    sb.data(Buffer.concat([i8(k), i8(k + 1)]));                     // counter[]
    sb.data(Buffer.from(usr + usr, 'hex'));                         // owner[]
    sb.data(Buffer.from([0, 0]));                                   // type[]
    sb.data(Buffer.from(usr, 'hex')); sb.data(Buffer.from([0])); sb.int(2n);
    sb.data(TAG); sb.data(Buffer.from(fab.bytecodeHex, 'hex'));
    const wsig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 1, 0n), PRIV)).toString('hex') + '01';
    const tx = { version: 1, inputs: [
        { previousOutpoint: { transactionId: prevTx, index: prevIdx }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 60 },
        { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: wsig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
      outputs: outputs.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    const body = { ...tx, gas: 0, inputs: tx.inputs.map((i: any, ki: number) => ({ ...i, utxo: { amount: Number(ki === 0 ? V : w.amount), scriptPublicKey: { version: 0, script: ki === 0 ? fab.scriptPublicKey : w.spk }, ...(ki === 0 ? { covenantId: F2.covenantId } : {}) } })),
      outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
    const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const un = pf.executed?.[0]?.script_units_used || 0;
    console.log(`edition #${k}: preflight ${pf.verdict} | ${un}u`);
    if (pf.verdict !== 'ready') { console.log(JSON.stringify(pf.findings)); break; }
    const txid = await broadcast(tx, pf);
    if (!txid) { console.log('❌ broadcast failed at #' + k); break; }
    console.log(`🌸 EDITION #${k} MINTED: ${txid} (+1 TKAS to artist)`);
    spent.add(w.txId + ':' + w.index);
    F.counter = k + 1; F.lastMint = txid; fs.writeFileSync(FPATH, JSON.stringify(F, null, 1));
    mints.push({ k, txid }); prevTx = txid; prevIdx = 1;
    await sleep(5000);
  }
  const g = Buffer.from(F2.genesis, 'hex'); const eds = [];
  for (let i = 0; i < Math.max(8, F.counter); i++) eds.push({ i, seed: Buffer.from(blake2b(Buffer.concat([g, Buffer.from([i])]), { dkLen: 32 })).toString('hex') });
  fs.writeFileSync('editions2.json', JSON.stringify({ series: F2.covenantId, editions: eds }, null, 1));
  console.log(`\n✅ run complete: factory counter ${F.counter} | editions ${mints.map(m => '#' + m.k).join(', ')} | editions2.json refreshed`);
})();
