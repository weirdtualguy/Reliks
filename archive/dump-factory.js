const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('factory-abi.json', 'utf8'));
const name = Object.keys(abi.contracts)[0];
const c = abi.contracts[name];
const hex = (arr) => Buffer.from(arr).toString('hex');
console.log('contract:      ', name);
console.log('template_hash: ', hex(c.compiled.template_hash));
console.log('state_span:    ', JSON.stringify(c.compiled.state_span));
console.log('bytecode_len:  ', c.compiled.bytecode.length);
console.log('runtime_state fields:');
c.runtime_state.fields.forEach(f => console.log('  ' + f.name.padEnd(18) + ' ' + (f.type.kind === 'fixed_bytes' ? 'byte[' + f.type.len + ']' : f.type.kind)));
console.log('entries:');
for (const [en, e] of Object.entries(c.entries)) {
  console.log('  ' + en + ' = ' + e.dispatch_tag);
  console.log('     params: ' + e.params.map(p => p.name + ':' + (p.type.kind === 'fixed_bytes' ? 'byte[' + p.type.len + ']' : p.type.kind)).join(', '));
}
