const fs = require('fs');
const e = JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8'));
const c = e.contracts[Object.keys(e.contracts)[0]];
const bc = Array.isArray(c.compiled.bytecode) ? c.compiled.bytecode : Array.from(Buffer.from(c.compiled.bytecode, 'hex'));
const off = c.compiled.state_span.offset;
const len = c.compiled.state_span.len;
const prefixLen = off;
const suffixLen = bc.length - off - len;
const hash = Array.isArray(c.compiled.template_hash) ? c.compiled.template_hash : Array.from(Buffer.from(c.compiled.template_hash, 'hex'));
const args = [
  { kind: 'bytes', value: new Array(32).fill(0) },
  { kind: 'int', value: 0 },
  { kind: 'bytes', value: new Array(32).fill(0) },
  { kind: 'int', value: 0 },
  { kind: 'int', value: prefixLen },
  { kind: 'int', value: suffixLen },
  { kind: 'bytes', value: hash }
];
fs.writeFileSync('offer-args.json', JSON.stringify(args));
console.log('wrote offer-args.json | edition prefixLen', prefixLen, 'suffixLen', suffixLen);
