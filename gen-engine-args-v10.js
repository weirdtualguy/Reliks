const fs = require('fs');
const E = require('./reliks-engine-v10.js');
const [price, roy, mints, artist] = process.argv.slice(2, 6);
if (!price || !roy || !mints || !artist) { console.error('usage: node gen-engine-args-v10.js <price> <royalty_bips> <mints_left> <artist hex>'); process.exit(1); }
const A = require('./data/edition-abi-v5.json');
const c = A.contracts[Object.keys(A.contracts)[0]];
const bc = Array.isArray(c.compiled.bytecode) ? Buffer.from(c.compiled.bytecode) : Buffer.from(c.compiled.bytecode, 'hex');
const off = c.compiled.state_span.offset, len = c.compiled.state_span.len;
const prefix = bc.subarray(0, off), suffix = bc.subarray(off + len);
const hash = Array.isArray(c.compiled.template_hash) ? Buffer.from(c.compiled.template_hash) : Buffer.from(c.compiled.template_hash, 'hex');
const args = [
  { kind: 'bytes', value: Array.from(Buffer.from(E.engineHashHex, 'hex')) },
  { kind: 'bytes', value: Array.from(Buffer.from(artist, 'hex')) },
  { kind: 'int', value: parseInt(price, 10) },
  { kind: 'int', value: parseInt(roy, 10) },
  { kind: 'int', value: parseInt(mints, 10) },
  { kind: 'bytes', value: Array.from(Buffer.from(E.ENGINE_SRC, 'utf8')) },
  { kind: 'int', value: 0 },
  { kind: 'bytes', value: Array.from(Buffer.from(E.renderHashHex, 'hex')) },
  { kind: 'bytes', value: Array.from(prefix) },
  { kind: 'bytes', value: Array.from(suffix) },
  { kind: 'bytes', value: Array.from(hash) }
];
fs.writeFileSync('./data/factory-args-v10.json', JSON.stringify(args));
console.log('args written | engine_hash', E.engineHashHex.slice(0, 16) + '... | render_hash', E.renderHashHex.slice(0, 16) + '... | engine_bytes', Buffer.byteLength(E.ENGINE_SRC));
