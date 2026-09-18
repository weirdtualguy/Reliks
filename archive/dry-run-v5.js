const fs = require('fs');
const { blake2b } = require('@noble/hashes/blake2b');
const B = Buffer;
const hex = b => B.from(b).toString('hex');
const H = s => B.from(s, 'hex');
const le16 = n => { const b = B.alloc(2); b.writeUInt16LE(n); return b; };
const sm8  = n => { const b = B.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

function pushExplicit(p) {
  const n = p.length;
  if (n === 0) return B.from([0x00]);
  if (n <= 75) return B.concat([B.from([n]), p]);
  if (n <= 255) return B.concat([B.from([0x4c, n]), p]);
  if (n <= 65535) return B.concat([B.from([0x4d]), le16(n), p]);
  return B.concat([B.from([0x4e]), le32(n), p]);
}
function pushMinimalInt(v) {
  if (v === 0) return B.from([0x00]);
  if (v >= 1 && v <= 16) return B.from([0x50 + v]);
  if (v === -1) return B.from([0x4f]);
  let h = v.toString(16); if (h.length % 2) h = '0' + h;
  let b = B.from(h, 'hex').reverse(); if (b[b.length - 1] & 0x80) b = B.concat([b, B.from([0])]);
  return B.concat([B.from([b.length]), b]);
}

const parts = abi => {
  const c = abi.contracts[Object.keys(abi.contracts)[0]];
  const bc = B.from(c.compiled.bytecode);
  const s = c.compiled.state_span;
  return { c, bc, prefix: bc.subarray(0, s.offset), suffix: bc.subarray(s.offset + s.len), templateHash: c.compiled.template_hash };
};

const encState = (P, vals) => B.concat(P.c.runtime_state.fields.map(f => {
  const t = f.type.kind, x = vals[f.name];
  if (t === 'int' || t === 'temporal') return pushExplicit(sm8(x));
  if (t === 'byte') return pushExplicit(B.from([x]));
  return pushExplicit(H(x));
}));

const F = parts(JSON.parse(fs.readFileSync('factory-abi-v5.json', 'utf8')));
const E = parts(JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8')));
const LEDGER = JSON.parse(fs.readFileSync('factory-ledger-v5.json', 'utf8'));

const eTplHash = Array.isArray(E.templateHash) ? hex(B.from(E.templateHash)) : E.templateHash;

const fState = {
  program_hash: LEDGER.artProgramHash,
  artist: '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68',
  price: 100000000,
  royalty_bips: 500,
  cap: 64,
  counter: LEDGER.counter,
  edition_template_prefix: hex(E.prefix),
  edition_template_suffix: hex(E.suffix),
  expected_template_hash: eTplHash
};

console.log('=== FACTORY STATE FIELDS (from ABI) ===');
F.c.runtime_state.fields.forEach(f => console.log(f.name, f.type.kind));

console.log('\n=== SIGSCRIPT PUSHES (mint args) ===');
console.log('1. buyerIdentifier (byte[32]):', hex(pushExplicit(H('33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68'))));
console.log('2. paymentOutIdx (int):', hex(pushMinimalInt(2)));
console.log('3. editionOutIdx (int):', hex(pushMinimalInt(1)));
console.log('4. dispatch_tag:', hex(pushExplicit(H(F.c.entries.mint.dispatch_tag))));
console.log('5. redeem_script_len:', B.concat([F.prefix, encState(F, fState), F.suffix]).length, 'bytes');

console.log('\n=== EDITION TEMPLATE CHECK ===');
console.log('Factory expects template_hash:', eTplHash);
console.log('Edition ABI template_hash:', hex(B.from(E.templateHash)));
console.log('Match?', eTplHash === hex(B.from(E.templateHash)));

console.log('\n=== OUTPUT SPKs ===');
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
console.log('Output 2 (artist payment) SPK:', '20' + USER + 'ac');
console.log('Expected by covenant (new ScriptPubKeyP2PK):', '20' + USER + 'ac');
