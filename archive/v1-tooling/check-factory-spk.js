const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
const hex = b => B.from(b).toString('hex');
const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const pushExplicit = p => { const n = p.length;
  if (n === 0) return B.from([0x00]);
  if (n <= 75) return B.concat([B.from([n]), p]);
  if (n <= 255) return B.concat([B.from([0x4c, n]), p]);
  return B.concat([B.from([0x4d]), le16(n), p]); };
const payload = (ty, v) => {
  if (ty.kind === 'int' || ty.kind === 'temporal') return sm8(v);
  if (ty.kind === 'byte') return B.from([v]);
  if (ty.kind === 'fixed_bytes') return H(v);
  throw new Error('unsupported ' + ty.kind); };
const fAbi = JSON.parse(fs.readFileSync('factory-abi.json', 'utf8'));
const fN = Object.keys(fAbi.contracts)[0];
const c = fAbi.contracts[fN];
const bc = B.from(c.compiled.bytecode);
const { offset, len } = c.compiled.state_span;
const prefix = bc.subarray(0, offset), suffix = bc.subarray(offset + len);
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const ART = '00'.repeat(2048);
for (const counter of [1, 2]) {
  const state = B.concat(c.runtime_state.fields.map(f =>
    pushExplicit(payload(f.type, { art: ART, artist: USER, price: 100000000,
      royalty_bips: 500, cap: 64, counter }[f.name]))));
  const R = B.concat([prefix, state, suffix]);
  console.log('computed counter=' + counter + ':', 'aa20' + hex(blake2b(R, { dkLen: 32 })) + '87');
}
(async () => {
  const j = await (await fetch('https://kascov.io/data/testnet-10/c/e37e5868903c20bf67843bc7b1586f4c5bbca301a698c4e73ce51b60bca1854a.json')).json();
  const live = j.utxos.find(u => u.live); console.log('onchain  live utxo :', live.script_hex, live.outpoint, 'value', live.value);
  console.log('onchain  outpoint  :', j.utxos[0].outpoint, 'value', j.utxos[0].value);
})();
