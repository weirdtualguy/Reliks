const fs = require('fs');
const ed = JSON.parse(fs.readFileSync('data/edition-abi-v5.json', 'utf8'));
const c = ed.contracts[Object.keys(ed.contracts)[0]];
const bc = Buffer.from(c.compiled.bytecode);
const off = c.compiled.state_span.offset, len = c.compiled.state_span.len;
const prefix = bc.subarray(0, off);
const suffix = bc.subarray(off + len);
const hash = Buffer.from(c.compiled.template_hash);
console.log('new prefix/suffix/hash lens:', prefix.length, suffix.length, hash.length, hash.toString('hex'));
const args = JSON.parse(fs.readFileSync('data/factory-args-v10.json', 'utf8'));
if (![8, 9, 10].every(i => args[i] && args[i].kind === 'bytes' && Array.isArray(args[i].value))) { console.error('args[8..10] are not bytes arrays — inspect manually'); process.exit(1); }
console.log('old lens:', args[8].value.length, args[9].value.length, args[10].value.length);
if (args[8].value.length !== prefix.length) { console.error('prefix length changed unexpectedly'); process.exit(1); }
args[8].value = Array.from(prefix);
args[9].value = Array.from(suffix);
args[10].value = Array.from(hash);
fs.writeFileSync('data/factory-args-v10.json', JSON.stringify(args, null, 2));
console.log('factory-args-v10.json updated: edition template parts + expected_template_hash');
