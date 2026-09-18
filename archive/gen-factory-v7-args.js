const fs = require('fs');
const e = JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8'));
const c = e.contracts[Object.keys(e.contracts)[0]];
const bc = Array.isArray(c.compiled.bytecode) ? c.compiled.bytecode : Array.from(Buffer.from(c.compiled.bytecode, 'hex'));
const off = c.compiled.state_span.offset;
const len = c.compiled.state_span.len;
const prefix = bc.slice(0, off);
const suffix = bc.slice(off + len);
const hash = Array.isArray(c.compiled.template_hash) ? c.compiled.template_hash : Array.from(Buffer.from(c.compiled.template_hash, 'hex'));
const CH = JSON.parse(fs.readFileSync('chunks.json', 'utf8'));
const USER = Array.from(Buffer.from('33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68', 'hex'));
const args = [
  { kind: 'bytes', value: Array.from(Buffer.from(CH.programHash, 'hex')) },
  { kind: 'bytes', value: USER },
  { kind: 'int', value: 100000000 },
  { kind: 'int', value: 500 },
  { kind: 'int', value: 4 },
  { kind: 'bytes', value: prefix },
  { kind: 'bytes', value: suffix },
  { kind: 'bytes', value: hash }
];
fs.writeFileSync('factory-args-v7.json', JSON.stringify(args));
console.log('wrote factory-args-v7.json | mints_left 4 | price 1 KAS | royalty 500 bips');
