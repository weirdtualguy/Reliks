const fs = require('fs');
const E = require('./data/edition-abi-v9.json');
const e = E.contracts[Object.keys(E.contracts)[0]];
const bc = Buffer.from(e.compiled.bytecode);
const off = e.compiled.state_span.offset, len = e.compiled.state_span.len;
const prefix = bc.subarray(0, off), suffix = bc.subarray(off + len);
const hash = Buffer.from(e.compiled.template_hash);
const [ph, price, roy, mints] = process.argv.slice(2, 6);
if (!ph || !price || !roy || !mints) { console.error('usage: node gen-series-args-v9.js <program_hash hex> <price sompi> <royalty_bips> <mints_left>'); process.exit(1); }
const ARTIST = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const args = [
  { kind: 'bytes', value: Array.from(Buffer.from(ph, 'hex')) },
  { kind: 'bytes', value: Array.from(Buffer.from(ARTIST, 'hex')) },
  { kind: 'int', value: parseInt(price, 10) },
  { kind: 'int', value: parseInt(roy, 10) },
  { kind: 'int', value: parseInt(mints, 10) },
  { kind: 'bytes', value: Array.from(prefix) },
  { kind: 'bytes', value: Array.from(suffix) },
  { kind: 'bytes', value: Array.from(hash) }
];
fs.writeFileSync('./data/minter-args-v9.json', JSON.stringify(args));
console.log('series args | price', price, '| roy', roy, '| mints', mints, '| tpl', hash.toString('hex').slice(0, 16) + '...');
