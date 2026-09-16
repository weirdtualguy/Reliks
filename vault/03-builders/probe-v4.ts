import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake2b } from '@noble/hashes/blake2b';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import { compileSeries } from './bridge3';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const FPATH = process.argv[2] || 'factory4.json';
const F = JSON.parse(fs.readFileSync(FPATH, 'utf8'));
const KNOWN = new Set(['5703f99d', '9909be01', '951976a2', '2b00e75d', '42c6a550']);
class SB { p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  int(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b; this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }
const i8 = (v: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v), 0); return b; };
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });
(async () => {
  const k = F.counter || 0;
  const V = k === 0 ? 1000000000n : 50000000n;
  const prevTx = k === 0 ? F.genesis : F.lastMint, prevIdx = k === 0 ? 0 : 1;
  const fab = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k, owner: USER });
  const prog = Buffer.from(fab.bytecodeHex, 'hex');
  const cands: string[] = []; let i = 0;
  while (i < prog.length) { const op = prog[i];
    if (op === 0x00) { i++; continue; }
    if (op >= 0x01 && op <= 0x4b) { if (op === 0x04 && i + 5 <= prog.length) { const t = prog.subarray(i + 1, i + 5).toString('hex'); if (!cands.includes(t)) cands.push(t); } i += 1 + op; continue; }
    if (op === 0x4c) { i += 2 + prog[i + 1]; continue; }
    if (op === 0x4d) { i += 3 + prog.readUInt16LE(i + 1); continue; }
    if (op === 0x4e) { i += 5 + prog.readUInt32LE(i + 1); continue; }
    i++; }
  const mintCands = cands.filter(t => !KNOWN.has(t));
  console.log('PUSH4 constants in template:', cands.join(' '));
  console.log('mint tag candidates:', mintCands.join(' ') || '(none!)');
  const child = compileSeries({ slot: F.slotHex, artist: USER, price: 0, cap: 64, role: 1, counter: k, owner: USER });
  const nextF = compileSeries({ slot: F.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: k + 1, owner: USER });
  const u: any[] = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json() as any[];
  const best = u.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  const w: UtxoInput = { txId: best.outpoint.transactionId, index: best.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(best.utxoEntry.amount) };
  const bind = { authorizingInput: 0, covenantId: F.covenantId };
  const inputs: UtxoInput[] = [{ txId: prevTx, index: prevIdx, sequence: 0, spk: fab.scriptPublicKey, amount: V }, w];
  const outputs = [out(V, child.scriptPublicKey, bind), out(50000000n, nextF.scriptPublicKey, bind),
    out(100000000n, `20${USER}ac`), out(w.amount - 150000000n - 2000000n, `20${USER}ac`)];
  const wsig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 1, 0n), PRIV)).toString('hex') + '01';
  const slot = Buffer.from(F.slotHex.replace(/^0x/, ''), 'hex'), usr = Buffer.from(USER.replace(/^0x/, ''), 'hex');
  for (const tagHex of mintCands) {
    const sb = new SB();
    sb.data(Buffer.concat([slot, slot])); sb.data(Buffer.concat([usr, usr]));
    sb.data(Buffer.concat([i8(0), i8(100000000)])); sb.data(Buffer.concat([i8(64), i8(64)]));
    sb.data(Buffer.from([1, 0])); sb.data(Buffer.concat([i8(k), i8(k + 1)]));
    sb.data(Buffer.concat([usr, usr])); sb.data(Buffer.from([0, 0]));
    sb.data(usr); sb.data(Buffer.from([0])); sb.int(2n);
    sb.data(Buffer.from(tagHex, 'hex')); sb.data(prog);
    const tx = { version: 1, inputs: [
        { previousOutpoint: { transactionId: prevTx, index: prevIdx }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 60 },
        { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: wsig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
      outputs: outputs.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    const body = { ...tx, gas: 0, inputs: tx.inputs.map((x: any, ki: number) => ({ ...x, utxo: { amount: Number(ki === 0 ? V : w.amount), scriptPublicKey: { version: 0, script: ki === 0 ? fab.scriptPublicKey : w.spk }, ...(ki === 0 ? { covenantId: F.covenantId } : {}) } })),
      outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
    const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const un = pf.executed?.[0]?.script_units_used || 0;
    console.log(`tag ${tagHex} → ${pf.verdict} | ${un}u | ${(pf.executed?.[0]?.verdict || pf.findings?.[0]?.message || '').substring(0, 60)}`);
    if (pf.verdict === 'ready') {
      const transaction = { ...tx, gas: 0, mass: pf.masses.storage, outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
      const WS = require('ws');
      for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
        const id: string | null = await new Promise(res => { const ws = new WS(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
          const t = setTimeout(() => { ws.terminate(); res(null); }, 12000);
          ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
          ws.on('message', (d: any) => { const s = d.toString(); console.log('📥', s.substring(0, 220)); clearTimeout(t);
            res(s.includes('transactionId') ? JSON.parse(s).params.transactionId : null); });
          ws.on('error', () => { clearTimeout(t); res(null); }); });
        if (id) { F.counter = k + 1; F.lastMint = id; F.mintTag = tagHex; fs.writeFileSync(FPATH, JSON.stringify(F, null, 1));
          console.log(`🌸 EDITION #${k} MINTED (v4): ${id} | mint tag ${tagHex} saved to ${FPATH}`); process.exit(0); } }
      console.log('❌ broadcast failed'); process.exit(1); } }
  console.log('❌ no candidate reached ready — paste full output');
})();
