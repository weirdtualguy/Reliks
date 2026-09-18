const fs = require('fs');
const tpl = JSON.parse(fs.readFileSync('token-template.json', 'utf8'));
const USER = '33fe25d181460cec565e08ceef80761c2cb990d595f43193a0c76237b0d9cc68';
const args = [
  { kind: 'bytes', value: Array.from(Buffer.from(USER, 'hex')) },
  { kind: 'bytes', value: new Array(32).fill(0) },
  { kind: 'int', value: 1000000 },
  { kind: 'bool', value: false },
  { kind: 'int', value: tpl.prefixLen },
  { kind: 'int', value: tpl.suffixLen },
  { kind: 'bytes', value: Array.from(Buffer.from(tpl.hash, 'hex')) }
];
fs.writeFileSync('pixel-minter-args.json', JSON.stringify(args));
console.log('wrote pixel-minter-args.json (allowance 1,000,000 PCRT, uninitialized)');
