const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('contracts/art-edition.abi.json', 'utf8'));
const names = Object.keys(abi.contracts);
console.log('contracts found:', names);
const c = abi.contracts[names[0]];
const bc = Buffer.from(c.compiled.bytecode);
const { offset, len } = c.compiled.state_span;
const prefix = bc.subarray(0, offset);
const suffix = bc.subarray(offset + len);
console.log('prefix len:', prefix.length, 'hex:', prefix.toString('hex'));
console.log('suffix len:', suffix.length);
console.log('template_hash:', Buffer.from(c.compiled.template_hash).toString('hex'));
fs.writeFileSync('edition-template-parts.json', JSON.stringify({
  prefix: Array.from(prefix),
  suffix: Array.from(suffix),
  hash: Array.from(c.compiled.template_hash)
}));
console.log('✅ saved edition-template-parts.json');
