const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('art-edition.abi.json', 'utf8'));
const c = abi.contracts['ArtEdition'];
const hex = b => Buffer.from(b).toString('hex');
console.log('=== ArtEdition template metadata ===');
console.log('template_hash :', hex(c.compiled.template_hash));
console.log('state_span    :', JSON.stringify(c.compiled.state_span));
console.log('bytecode_len  :', c.compiled.bytecode.length);
console.log('');
console.log('=== state fields (declaration order) ===');
c.runtime_state.fields.forEach(f => {
  const t = f.type.kind === 'fixed_bytes' ? `byte[${f.type.len}]` : f.type.kind;
  console.log('  ' + f.name.padEnd(18) + t);
});
console.log('');
console.log('=== entrypoints ===');
for (const [name, e] of Object.entries(c.entries)) {
  console.log('  ' + name.padEnd(40) + 'tag=' + e.dispatch_tag);
}
console.log('');
console.log('=== values the factory needs ===');
const span = c.compiled.state_span;
const bcLen = c.compiled.bytecode.length;
console.log('templatePrefixLen :', span.offset);
console.log('templateSuffixLen :', bcLen - span.offset - span.len);
console.log('expectedTemplateHash (hex):', hex(c.compiled.template_hash));
fs.writeFileSync('edition-template.json', JSON.stringify({
  templatePrefixLen: span.offset,
  templateSuffixLen: bcLen - span.offset - span.len,
  expectedTemplateHash: hex(c.compiled.template_hash),
  stateSpan: span,
  bytecodeLen: bcLen
}, null, 2));
console.log('\nsaved edition-template.json');
