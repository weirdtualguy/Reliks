const fs = require('fs');
const E = require('./data/edition-abi-v9.json');
const c = E.contracts[Object.keys(E.contracts)[0]];
const bc = Array.isArray(c.compiled.bytecode) ? Buffer.from(c.compiled.bytecode) : Buffer.from(c.compiled.bytecode, 'hex');
const off = c.compiled.state_span.offset, len = c.compiled.state_span.len;
const prefix = bc.subarray(0, off), suffix = bc.subarray(off + len);
const hash = Array.isArray(c.compiled.template_hash) ? Buffer.from(c.compiled.template_hash) : Buffer.from(c.compiled.template_hash, 'hex');
const args = [
  { kind: 'bytes', value: Array.from(Buffer.alloc(32)) },
  { kind: 'bytes', value: Array.from(Buffer.alloc(32)) },
  { kind: 'int', value: 0 },
  { kind: 'int', value: 0 },
  { kind: 'int', value: 0 },
  { kind: 'bytes', value: Array.from(prefix) },
  { kind: 'bytes', value: Array.from(suffix) },
  { kind: 'bytes', value: Array.from(hash) }
];
fs.writeFileSync('./data/minter-args-v9.json', JSON.stringify(args));
console.log('prefix', prefix.length, '| suffix', suffix.length, '| hash', hash.toString('hex'));
