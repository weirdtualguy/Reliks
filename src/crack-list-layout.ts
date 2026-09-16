import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake3 } from '@noble/hashes/blake3';
import { blake2b } from '@noble/hashes/blake2b';
import { compileV2 } from './bridge2';
import { kaspa_sighash_v1, TxOutput } from './kaspa-sighash-v1';
import { encodePalette, encodeTraitLayer, LayerType } from './encoder';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const CID = Buffer.from(blake2b(Buffer.from('pixel-cove-genesis-collection', 'utf8'), { dkLen: 32 })).toString('hex');
const ART = (() => { const p = encodePalette(Array.from({ length: 16 }, (_, i) => (i === 1 ? { r: 220, g: 40, b: 40 } : { r: 0, g: 0, b: 0 })));
  const L = (t: any, id: number, v: number) => encodeTraitLayer(t, id, new Array(256).fill(v)).substring(4);
  return p + L(LayerType.Background, 0, 1) + L(LayerType.BodySkin, 1, 0) + L(LayerType.Eyes, 2, 0) + L(LayerType.Hair, 3, 0); })();
const PRICE = 100000000n;
const TAG_LIST = Buffer.from(blake3('__covenant_entrypoint_auth_list(sig,int)').slice(0, 4));

class SB { private p: Buffer = Buffer.alloc(0);
  data(d: Buffer) { const l = d.length; if (l <= 75) this.p = Buffer.concat([this.p, Buffer.from([l]), d]); else if (l <= 255) this.p = Buffer.concat([this.p, Buffer.from([0x4c, l]), d]); else { const b = Buffer.alloc(2); b.writeUInt16LE(l); this.p = Buffer.concat([this.p, Buffer.from([0x4d]), b, d]); } }
  int(v: bigint) { if (v === 0n) { this.p = Buffer.concat([this.p, Buffer.from([0])]); return; } if (v >= 1n && v <= 16n) { this.p = Buffer.concat([this.p, Buffer.from([0x50 + Number(v)])]); return; }
    let h = v.toString(16); if (h.length % 2) h = '0' + h; const b = Buffer.from(h, 'hex').reverse();
    const body = (b[b.length - 1] & 0x80) ? Buffer.concat([b, Buffer.from([0])]) : b;
    this.p = Buffer.concat([this.p, Buffer.from([body.length]), body]); }
  hex() { return this.p.toString('hex'); } }

const state = JSON.parse(fs.readFileSync('m2-state.json', 'utf8'));
const compileState = (price: number) => compileV2({ collectionId: CID, tokenId: state.tokenId, artPayload: ART, initOwner: USER, initScheme: 0, initPrice: price, initRoyalty: USER });
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });

(async () => {
  const cur = compileState(0);
  const nxt = compileState(Number(PRICE));
  
  // Test 4 sigscript layouts
  const layouts = [
    { name: '[sig, price, tag, program]', build: (sb: SB) => { sb.data(Buffer.from(sig, 'hex')); sb.int(PRICE); sb.data(TAG_LIST); sb.data(prog); } },
    { name: '[price, sig, tag, program]', build: (sb: SB) => { sb.int(PRICE); sb.data(Buffer.from(sig, 'hex')); sb.data(TAG_LIST); sb.data(prog); } },
    { name: '[program, sig, price, tag]', build: (sb: SB) => { sb.data(prog); sb.data(Buffer.from(sig, 'hex')); sb.int(PRICE); sb.data(TAG_LIST); } },
    { name: '[program, price, sig, tag]', build: (sb: SB) => { sb.data(prog); sb.int(PRICE); sb.data(Buffer.from(sig, 'hex')); sb.data(TAG_LIST); } },
  ];

  const sig = Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(
    [{ txId: state.txid, index: 0, sequence: 0, spk: state.spk, amount: BigInt(state.value) }],
    [out(BigInt(state.value) - 1000000n, nxt.scriptPublicKey, { authorizingInput: 0, covenantId: state.covenantId })], 0, 0n), PRIV)).toString('hex') + '01';
  const prog = Buffer.from(state.programHex, 'hex');

  for (const l of layouts) {
    const sb = new SB();
    l.build(sb);
    const tx = { version: 1, inputs: [{ previousOutpoint: { transactionId: state.txid, index: 0 }, signatureScript: sb.hex(), sequence: 0, sigOpCount: 0, computeBudget: 50 }],
      outputs: [{ amount: (BigInt(state.value) - 1000000n).toString(), scriptPublicKey: { version: 0, scriptPublicKey: nxt.scriptPublicKey }, covenant: { authorizingInput: 0, covenantId: state.covenantId } }],
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    const body = { ...tx, inputs: tx.inputs.map(i => ({ ...i, utxo: { amount: Number(state.value), scriptPublicKey: { version: 0, script: state.spk }, covenantId: state.covenantId } })),
      outputs: tx.outputs.map(o => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, covenant: o.covenant })) };
    const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    const u = pf.executed?.[0]?.script_units_used || 0;
    console.log(`${l.name} → ${pf.verdict} | ${u}u | ${(pf.executed?.[0]?.verdict || pf.findings?.[0]?.message || '').substring(0, 60)}`);
    if (u > 50000) {
      console.log(`\n🎉 WINNER: ${l.name}`);
      fs.writeFileSync('plan.json', JSON.stringify({ transaction: tx, utxos: [{ amount: state.value, spk: state.spk, covenantId: state.covenantId }],
        next: { programHex: nxt.bytecodeHex, spk: nxt.scriptPublicKey, value: Number(BigInt(state.value) - 1000000n), price: Number(PRICE) } }));
      console.log('✅ plan.json saved → run: npx ts-node src/m2-run.ts');
      process.exit(0);
    }
  }
  console.log('❌ No layout matched the ~100k unit fingerprint. The v2 dispatcher may require a different argument encoding.');
  process.exit(1);
})();
