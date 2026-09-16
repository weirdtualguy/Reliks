const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('art-factory.abi.json', 'utf8'));
const c = abi.contracts['ArtFactory'];
console.log('=== state fields ===');
c.runtime_state.fields.forEach(f => {
  const t = f.type.kind === 'fixed_bytes' ? `byte[${f.type.len}]` : f.type.kind;
  console.log(`  ${f.name.padEnd(20)} ${t}`);
});
console.log('\n=== entrypoints ===');
for (const [name, e] of Object.entries(c.entries)) {
  console.log(`  ${name.padEnd(45)} tag=${e.dispatch_tag}`);
}
console.log('\n=== compiled ===');
console.log('  bytecode_len:', c.compiled.bytecode.length);
console.log('  state_span:', JSON.stringify(c.compiled.state_span));
console.log('  template_hash:', Buffer.from(c.compiled.template_hash).toString('hex'));
