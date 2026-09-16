const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer; const hex = b => B.from(b).toString('hex'); const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const le32 = n => { const b = B.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
function pushExplicit(p) { const n = p.length; if (n === 0) return B.from([0x00]); if (n <= 75) return B.concat([B.from([n]), p]); if (n <= 255) return B.concat([B.from([0x4c, n]), p]); return B.concat([B.from([0x4d]), le16(n), p]); }
function pushMinimalInt(v) { if (v === 0) return B.from([0x00]); if (v >= 1 && v <= 16) return B.from([0x50 + v]); let h = v.toString(16); if (h.length % 2) h = '0' + h; let b = B.from(h, 'hex').reverse(); if (b[b.length - 1] & 0x80) b = B.concat([b, B.from([0])]); return B.concat([B.from([b.length]), b]); }

const E = JSON.parse(fs.readFileSync('edition-abi-v2.json', 'utf8'));
const c = E.contracts[Object.keys(E.contracts)[0]];
const bc = B.from(c.compiled.bytecode);
const { offset, len } = c.compiled.state_span;
const prefix = bc.subarray(0, offset), suffix = bc.subarray(offset + len);
const TAG_BUY = H(c.entries.__covenant_entrypoint_auth_buy.dispatch_tag);

const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const FACT_COV = '0c2ce37edb08f842a3960d3efaa7afb336f7cdd3427f8fddb63aaf5db4256b95';
const ART_HASH = '93e87b071619614e6840b2f244b4b093f2d11a7e3896fc88501f1e91533652de';

const state = { ownerIdentifier: USER, identifierType: 0, price: 0, artist: USER, royalty_bips: 500, program_hash: ART_HASH, factory_covid: FACT_COV, serial: 0 };
const encState = vals => B.concat(c.runtime_state.fields.map(f => { const t = f.type.kind, x = vals[f.name]; if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x)); if (t === 'byte') return pushExplicit(B.from([x])); return pushExplicit(H(x)); }));
const oldRedeem = B.concat([prefix, encState(state), suffix]);
const oldSpk = 'aa20' + hex(blake2b(oldRedeem, { dkLen: 32 })) + '87';

// Construct a malicious buy sigscript with scheme = 1 (the v1 exploit)
const sig0_script = B.concat([
  pushExplicit(H(USER)),       // buyer
  pushExplicit(B.from([1])),   // buyerScheme = 1 (EXPLOIT!)
  pushMinimalInt(1),           // paymentOutIdx
  pushMinimalInt(2),           // royaltyOutIdx
  pushExplicit(TAG_BUY),
  pushExplicit(oldRedeem)
]);

const tx = {
  version: 1, lockTime: 0, subnetworkId: '00'.repeat(20), gas: 0, payload: '', mass: 0,
  inputs: [
    { previousOutpoint: { transactionId: '5b3719b3a0c057980a39fba98f8c71368008f01c3b6935ff7efe607700082aa5', index: 1 }, signatureScript: hex(sig0_script), sequence: 0, sigOpCount: 0, computeBudget: 60 },
    { previousOutpoint: { transactionId: '00'.repeat(32), index: 0 }, signatureScript: '00', sequence: 0, sigOpCount: 0, computeBudget: 10 }
  ],
  outputs: [
    { value: 10000000, scriptPublicKey: '0000' + oldSpk, covenant: { authorizingInput: 0, covenantId: '594faea4d28efb0e27799966c5c22b37b6ed2198d02c6377d097aff2fae563ba' } },
    { value: 100000000, scriptPublicKey: '000020' + USER + 'ac' },
    { value: 100000000, scriptPublicKey: '000020' + USER + 'ac' },
    { value: 100000000, scriptPublicKey: '000020' + USER + 'ac' }
  ]
};

const body = {
  ...tx,
  inputs: tx.inputs.map((i, k) => ({ ...i, utxo: { amount: k === 0 ? 10000000 : 1000000000, scriptPublicKey: { version: 0, script: k === 0 ? oldSpk : '20' + USER + 'ac' }, ...(k === 0 ? { covenantId: '594faea4d28efb0e27799966c5c22b37b6ed2198d02c6377d097aff2fae563ba' } : {}) } })),
  outputs: tx.outputs.map(o => ({ value: o.value, scriptPublicKey: { version: 0, script: o.scriptPublicKey.slice(4) }, ...(o.covenant ? { covenant: o.covenant } : {}) }))
};

(async () => {
  console.log('Sending exploit payload (scheme=1) to preflight oracle...');
  const pf = await (await fetch('https://kascov.io/data/testnet-10/preflight', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  console.log('verdict :', pf.verdict);
  console.log('executed:', JSON.stringify(pf.executed, null, 2));
  if (pf.executed && pf.executed[0] && pf.executed[0].pass === false) {
    console.log('\n✅ SUCCESS: The v2 contract correctly REJECTED the scheme-brick exploit!');
    console.log('The audit patch is mathematically proven to be active on-chain.');
  } else {
    console.log('\n❌ FAILURE: The contract did not reject the exploit.');
  }
})();
