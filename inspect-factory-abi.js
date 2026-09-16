const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('factory-abi.json', 'utf8'));
const c = abi.contracts['SeriesFactory'];

console.log('=== state fields ===');
c.runtime_state.fields.forEach(f => {
  const t = f.type.kind === 'fixed_bytes' ? `byte[${f.type.len}]` : f.type.kind;
  console.log(`  ${f.name.padEnd(22)} ${t}`);
});

console.log('\n=== entrypoints ===');
for (const [name, e] of Object.entries(c.entries)) {
  console.log(`  ${name.padEnd(45)} tag=${e.dispatch_tag}`);
  if (e.params.length) {
    console.log(`    params: ${e.params.map(p => p.name + ':' + (p.type.kind === 'fixed_bytes' ? 'byte[' + p.type.len + ']' : p.type.kind)).join(', ')}`);
  }
}

console.log('\n=== compiled ===');
console.log('  bytecode_len:', c.compiled.bytecode.length);
console.log('  state_span:', JSON.stringify(c.compiled.state_span));
console.log('  template_hash:', Buffer.from(c.compiled.template_hash).toString('hex'));

// Verify state span math
const bc = Buffer.from(c.compiled.bytecode);
const { offset, len } = c.compiled.state_span;
console.log('\n=== state span verification ===');
console.log('  prefix bytes:', bc.subarray(0, offset).toString('hex'));
console.log('  state bytes:', len);
console.log('  suffix bytes:', bc.length - offset - len);
