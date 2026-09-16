const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('series-v5-abi.json', 'utf8'));
const c = abi.contracts.Series;
console.log('=== State fields ===');
c.runtime_state.fields.forEach(f => {
  const t = f.type.kind === 'fixed_bytes' ? `byte[${f.type.len}]` : f.type.kind;
  console.log(`  ${f.name.padEnd(18)} ${t}`);
});
console.log('\n=== Dispatch tags ===');
for (const [name, entry] of Object.entries(c.entries)) {
  console.log(`  ${name.padEnd(45)} ${entry.dispatch_tag}`);
}
console.log('\n=== cov_decl_to_abi ===');
for (const [src, abiName] of Object.entries(c.cov_decl_to_abi || {})) {
  console.log(`  ${src} → ${abiName}`);
}
console.log('\n=== Template ===');
console.log('  hash:', Buffer.from(c.compiled.template_hash).toString('hex'));
console.log('  state_span:', JSON.stringify(c.compiled.state_span));
console.log('  bytecode_len:', c.compiled.bytecode.length);
