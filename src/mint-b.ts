import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake2b } from '@noble/hashes/blake2b';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import { compileSeries } from './bridge3';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const S = JSON.parse(fs.readFileSync('series.json', 'utf8'));
const F = JSON.parse(fs.readFileSync('factory.json', 'utf8'));
const PROG = fs.readFileSync('series-factory.hex', 'utf8').trim();
const FSPK = 'aa20' + Buffer.from(blake2b(Buffer.from(PROG, 'hex'), { dkLen: 32 })).toString('hex') + '87';
const TAG = Buffer.from('42c6a550', 'hex');
class SB { p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  mini(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v >= 1n && v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b; this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }
const i8 = (v: number) => { const b = Buffer.alloc(8); b.writeBigInt64LE(BigInt(v), 0); return b; };   // serialize_fixed_i64(v, 8)
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });
(async () => {
  const child = compileSeries({ slot: S.slotHex, artist: USER, price: 0, cap: 64, role: 1, counter: 0, owner: USER });
  const nextF = compileSeries({ slot: S.slotHex, artist: USER, price: 100000000, cap: 64, role: 0, counter: 1, owner: USER });
  const u: any[] = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json() as any[];
  const best = u.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  const w: UtxoInput = { txId: best.outpoint.transactionId, index: best.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(best.utxoEntry.amount) };
  const bind = { authorizingInput: 0, covenantId: F.covenantId };
  const inputs: UtxoInput[] = [{ txId: F.genesis, index: 0, sequence: 0, spk: FSPK, amount: 1000000000n }, w];
  const outputs = [out(1000000000n, child.scriptPublicKey, bind), out(50000000n, nextF.scriptPublicKey, bind),
    out(100000000n, `20${USER}ac`), out(w.amount - 150000000n - 2000000n, `20${USER}ac`)];
  const wsig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, outputs, 1, 0n), PRIV)).toString('hex') + '01';
  const slot = Buffer.from(S.slotHex.replace(/^0x/, ''), 'hex'), usr = Buffer.from(USER.replace(/^0x/, ''), 'hex');
  const states: any[] = [ // child, cont (new_states[0], new_states[1])
    { slot, artist: usr, price: 0, cap: 64, role: 1, counter: 0, owner: usr, type: 0 },
    { slot, artist: usr, price: 100000000, cap: 64, role: 0, counter: 1, owner: usr, type: 0 }];
  const columns = (st: any[]) => [ // runtime-state field order, one push per field
    Buffer.concat(st.map(s => s.slot)),                                  // byte[568][]
    Buffer.concat(st.map(s => s.artist)),                                // byte[32][]
    Buffer.concat(st.map(s => i8(s.price))),                             // int[] (8-byte fixed)
    Buffer.concat(st.map(s => i8(s.cap))),
    Buffer.concat(st.map(s => Buffer.from([s.role]))),                   // byte[]
    Buffer.concat(st.map(s => i8(s.counter))),
    Buffer.concat(st.map(s => s.owner)),
    Buffer.concat(st.map(s => Buffer.from([s.type])))];
  for (const elem of ['childcont', 'contchild']) {
    const st = elem === 'childcont' ? states : [states[1], states[0]];
    const sb = new SB();
    for (const c of columns(st)) sb.data(c);          // new_states columnar (deepest)
    sb.data(usr);                                      // buyerIdentifier byte[32]
    sb.data(Buffer.from([0]));                         // buyerScheme byte
    sb.mini(2n);                                       // paymentOutIdx int (minimal)
    sb.data(TAG); sb.data(Buffer.from(PROG, 'hex'));
    const tx = { version: 1, inputs: [
        { previousOutpoint: { transactionId: F.genesis, index: 0 }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 60 },
        { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: wsig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
      outputs: outputs.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    const body = { ...tx, gas: 0, inputs: tx.inputs.map((i: any, k: number) => ({ ...i, utxo: { amount: Number(k === 0 ? 1000000000n : w.amount), scriptPublicKey: { version: 0, script: k === 0 ? FSPK : `20${USER}ac` }, ...(k === 0 ? { covenantId: F.covenantId } : {}) } })),
      outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
    const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const un = pf.executed?.[0]?.script_units_used || 0;
    console.log(`${elem} → ${pf.verdict} | ${un}u | ${(pf.executed?.[0]?.verdict || pf.findings?.[0]?.message || '').substring(0, 60)}`);
    if (pf.verdict === 'ready') {
      const transaction = { ...tx, gas: 0, mass: pf.masses.storage, outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: '0000' + o.scriptPublicKey.scriptPublicKey, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
      const WS = require('ws');
      for (const url of ['wss://electron-10.kaspa.stream/kaspa/testnet-10/wrpc/json', 'wss://vector-10.kaspa.green/kaspa/testnet-10/wrpc/json']) {
        const ok = await new Promise<boolean>(res => { const ws = new WS(url, { headers: { 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wallet.kaspanet.io' } });
          const t = setTimeout(() => { ws.terminate(); res(false); }, 12000);
          ws.on('open', () => ws.send(JSON.stringify({ id: 1, method: 'submitTransaction', params: { transaction, allowOrphan: true } })));
          ws.on('message', (d: any) => { const s = d.toString(); console.log('📥', s.substring(0, 250)); clearTimeout(t);
            if (s.includes('transactionId')) { F.counter = 1; F.lastMint = JSON.parse(s).params.transactionId; fs.writeFileSync('factory.json', JSON.stringify(F, null, 1));
              console.log('🌸 EDITION #0 MINTED:', F.lastMint, '| elem order:', elem); res(true); } else res(false); });
          ws.on('error', () => { clearTimeout(t); res(false); }); });
        if (ok) break;
      }
      process.exit(0);
    }
  }
  console.log('❌ both element orders failed with signature-order params');
})();
