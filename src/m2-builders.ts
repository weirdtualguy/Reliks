import * as fs from 'fs';
import { blake2b } from '@noble/hashes/blake2b';
import { blake3 } from '@noble/hashes/blake3';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { compileV2 } from './bridge2';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };

const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CID = Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection', 'utf8'), { dkLen: 32 })).toString('hex');
const ART = (() => { const p = encodePalette(Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 })));
  const L = (t: any, id: number, v: number) => encodeTraitLayer(t, id, new Array(256).fill(v)).substring(4);
  return p + L(LayerType.Background, 0, 1) + L(LayerType.BodySkin, 1, 0) + L(LayerType.Eyes, 2, 0) + L(LayerType.Hair, 3, 0); })();
const PRICE = 100000000n; // 1 TKAS

class SB { private p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  int(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v >= 1n && v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b;
    this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }
const tag = (name: string, types: string[]) => Buffer.from(blake3(`${name}(${types.join(',')})`).slice(0, 4));
const TAG_LIST = tag('__covenant_entrypoint_auth_list', ['sig', 'int']);
const TAG_BUY = tag('__covenant_entrypoint_auth_buy', ['byte[32]', 'byte', 'int', 'int']);
const state = JSON.parse(fs.readFileSync('m2-state.json', 'utf8'));
const compileState = (owner: string, scheme: number, price: number) =>
  compileV2({ collectionId: CID, tokenId: state.tokenId, artPayload: ART, initOwner: owner, initScheme: scheme, initPrice: price, initRoyalty: USER });

async function walletUtxo(): Promise<UtxoInput> {
  const r = await fetch(`https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos`);
  const u: any[] = await r.json() as any[];
  const best = u.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  return { txId: best.outpoint.transactionId, index: best.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(best.utxoEntry.amount) };
}
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });

(async () => {
  const phase = process.argv[2];
  if (phase === 'list') {
    const cur = compileState(USER, 0, 0);
    const nxt = compileState(USER, 0, Number(PRICE));
    const sb = new SB();
    const sig = Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(
      [{ txId: state.txid, index: 0, sequence: 0, spk: state.spk, amount: BigInt(state.value) }],
      [out(BigInt(state.value) - 100000n, nxt.scriptPublicKey, { authorizingInput: 0, covenantId: state.covenantId })], 0, 0n), PRIV)).toString('hex') + '01';
    sb.data(Buffer.from(sig, 'hex')); sb.int(PRICE); sb.data(TAG_LIST); sb.data(Buffer.from(state.programHex, 'hex'));
    const tx = { version: 1, inputs: [{ previousOutpoint: { transactionId: state.txid, index: 0 }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 50 }],
      outputs: [{ amount: (BigInt(state.value) - 100000n).toString(), scriptPublicKey: { version: 0, scriptPublicKey: nxt.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId: state.covenantId } }],
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    fs.writeFileSync('plan.json', JSON.stringify({ transaction: tx, utxos: [{ amount: state.value, spk: state.spk, covenantId: state.covenantId }],
      next: { programHex: nxt.bytecodeHex, spk: nxt.scriptPublicKey, value: Number(BigInt(state.value) - 100000n), price: Number(PRICE) } }));
    console.log('✅ plan.json (list @ 1 TKAS) ready');
  }
  if (phase === 'buy') {
    const listed = compileState(USER, 0, Number(PRICE));
    const cont = compileState(USER, 0, 0); 
    const w = await walletUtxo();
    // FIX: Combine royalty into seller payout to avoid storage mass penalty
    const sellerPayout = PRICE + (PRICE / 50n); // 1 TKAS + 2% royalty = 1.02 TKAS
    const change = w.amount - sellerPayout - 200000n;
    const inputs: UtxoInput[] = [{ txId: state.txid, index: 0, sequence: 0, spk: state.spk, amount: BigInt(state.value) }, w];
    const outputs = [
      out(BigInt(state.value), cont.scriptPublicKey, { authorizingInput: 0, covenantId: state.covenantId }),
      out(sellerPayout, `20${USER}ac`), 
      out(change, `20${USER}ac`)];
    const h1 = kaspa_sighash_v1(inputs, outputs, 1, 0n);
    const fsig = '41' + Buffer.from(secp.schnorr.signSync(h1, PRIV)).toString('hex') + '01';
    const sb = new SB();
    sb.data(Buffer.from(USER, 'hex')); sb.data(Buffer.from([0])); sb.int(1n); sb.int(2n); sb.data(TAG_BUY); sb.data(Buffer.from(state.programHex, 'hex'));
    const tx = { version: 1, inputs: [
        { previousOutpoint: { transactionId: state.txid, index: 0 }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 50 },
        { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: fsig, sequence: 0, sigOpCount: 0, computeBudget: 50 }],
      outputs: outputs.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    fs.writeFileSync('plan.json', JSON.stringify({ transaction: tx, utxos: [{ amount: state.value, spk: state.spk, covenantId: state.covenantId }, { amount: w.amount.toString(), spk: w.spk }],
      next: { programHex: cont.bytecodeHex, spk: cont.scriptPublicKey, value: state.value, price: 0 } }));
    console.log('✅ plan.json (buy @ 1.02 TKAS total) ready');
  }
})();
