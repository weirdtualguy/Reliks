import * as fs from 'fs';
import * as secp from '@noble/secp256k1';
import * as crypto from 'crypto';
import { blake2b } from '@noble/hashes/blake2b';
import { kaspa_sighash_v1, UtxoInput, TxOutput } from './kaspa-sighash-v1';
secp.utils.sha256Sync = (...m: Uint8Array[]) => { const h = crypto.createHash('sha256'); m.forEach(b => h.update(b)); return h.digest(); };
const PRIV = process.env.PRIVATE_KEY_HEX || 'ce86e5c3cf81f3fbb24caec5c56405cb037d99884c0861e8bd8c105a50c0ecc3';
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const S = JSON.parse(fs.readFileSync('series.json', 'utf8'));
const F = JSON.parse(fs.readFileSync('factory.json', 'utf8'));
const PROG = fs.readFileSync('series-factory.hex', 'utf8').trim();
const FSPK = 'aa20' + Buffer.from(blake2b(Buffer.from(PROG, 'hex'), { dkLen: 32 })).toString('hex') + '87';
console.log('factory genesis in use:', F.genesis || '❌ EMPTY');
const out = (v: bigint, spk: string, cov?: any): TxOutput & { covenant?: any } => ({ amount: v, scriptPublicKey: spk, ...(cov ? { covenant: cov } : {}) });
(async () => {
  const u: any[] = await (await fetch('https://api-tn10.kaspa.org/addresses/kaspatest:qqelufw3s9rqemzktcyvamuqwcwzewvs6k2lgvvn5rrkydasm8xxssk52j3kd/utxos')).json() as any[];
  const best = u.sort((a, b) => Number(BigInt(b.utxoEntry.amount) - BigInt(a.utxoEntry.amount)))[0];
  const w: UtxoInput = { txId: best.outpoint.transactionId, index: best.outpoint.index, sequence: 0, spk: `20${USER}ac`, amount: BigInt(best.utxoEntry.amount) };
  console.log('wallet utxo:', w.txId.slice(0, 12), w.index, w.amount.toString());
  const bind = { authorizingInput: 0, covenantId: F.covenantId };
  const inputs: UtxoInput[] = [{ txId: F.genesis, index: 0, sequence: 0, spk: FSPK, amount: 1000000000n }, w];
  const withCov = [out(1000000000n, FSPK, bind), out(50000000n, FSPK, bind), out(100000000n, `20${USER}ac`), out(w.amount - 150000000n - 2000000n, `20${USER}ac`)];
  const noCov = withCov.map(o => ({ amount: o.amount, scriptPublicKey: o.scriptPublicKey }));
  const variants: [string, any[]][] = [['cov-in-sig', withCov], ['cov-stripped-sig', noCov]];
  for (const [name, sigOutputs] of variants) {
    const wsig = '41' + Buffer.from(secp.schnorr.signSync(kaspa_sighash_v1(inputs, sigOutputs as any, 1, 0n), PRIV)).toString('hex') + '01';
    const tx = { version: 1, inputs: [
        { previousOutpoint: { transactionId: F.genesis, index: 0 }, signatureScript: '00', sequence: 0, sigOpCount: 0, computeBudget: 10 },
        { previousOutpoint: { transactionId: w.txId, index: w.index }, signatureScript: wsig, sequence: 0, sigOpCount: 0, computeBudget: 10 }],
      outputs: withCov.map(o => ({ amount: o.amount.toString(), scriptPublicKey: { version: 0, scriptPublicKey: o.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })),
      lockTime: 0, subnetworkId: '00'.repeat(20), gas: '0', payload: '', mass: 0 };
    const body = { ...tx, gas: 0, inputs: tx.inputs.map((i: any, k: number) => ({ ...i, utxo: { amount: Number(k === 0 ? 1000000000n : w.amount), scriptPublicKey: { version: 0, script: k === 0 ? FSPK : `20${USER}ac` }, ...(k === 0 ? { covenantId: F.covenantId } : {}) } })),
      outputs: tx.outputs.map((o: any) => ({ value: Number(o.amount), scriptPublicKey: { version: 0, script: o.scriptPublicKey.scriptPublicKey }, ...(o.covenant ? { covenant: o.covenant } : {}) })) };
    const pf: any = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    console.log(`${name} → input1: ${(pf.executed || [])[1]?.script_units_used}u ${(pf.executed || [])[1]?.pass ? 'PASS' : 'fail'} | ${(pf.executed || [])[1]?.verdict || ''}`);
  }
})();
