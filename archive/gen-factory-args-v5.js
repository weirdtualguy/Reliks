const fs = require('fs');
const B = Buffer;
const hexToArr = h => Array.from(B.from(h, 'hex'));
const toArr = v => Array.isArray(v) ? v : hexToArr(v);

const eAbi = JSON.parse(fs.readFileSync('edition-abi-v3.json', 'utf8'));
const eC = eAbi.contracts[Object.keys(eAbi.contracts)[0]];
const bc = Array.isArray(eC.compiled.bytecode) ? eC.compiled.bytecode : Array.from(B.from(eC.compiled.bytecode, 'hex'));
const off = eC.compiled.state_span.offset;
const len = eC.compiled.state_span.len;
const prefix = bc.slice(0, off);
const suffix = bc.slice(off + len);
const tplHash = toArr(eC.compiled.template_hash);

const chunks = JSON.parse(fs.readFileSync('chunks.json', 'utf8'));
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';

const args = [
  { kind: 'bytes', value: hexToArr(chunks.programHash) },
  { kind: 'bytes', value: hexToArr(USER) },
  { kind: 'int', value: 100000000 },
  { kind: 'int', value: 500 },
  { kind: 'int', value: 64 },
  { kind: 'int', value: 0 },
  { kind: 'bytes', value: prefix },
  { kind: 'bytes', value: suffix },
  { kind: 'bytes', value: tplHash }
];
fs.writeFileSync('factory-args-v5.json', JSON.stringify(args));
console.log('wrote factory-args-v5.json');
console.log('edition template prefix:', prefix.length, 'bytes | suffix:', suffix.length, 'bytes');
console.log('expected_template_hash:', B.from(tplHash).toString('hex'));
