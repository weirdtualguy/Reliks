const fs = require('fs');

const KNOWN = {
  mint:  'b8a2310c',
  list:  '5703f99d',
  buy:   '9909be01',
  sell:  '951976a2',
  spend: '2b00e75d',
};

const raw = fs.readFileSync('series-abi4.json', 'utf8');
const abi = JSON.parse(raw);

// Find the contract (there should be exactly one: "Series")
const names = Object.keys(abi.contracts);
if (names.length === 0) { console.log('❌ no contracts in artifact'); process.exit(1); }
const cname = names[0];
const contract = abi.contracts[cname];

console.log('═══════════════════════════════════════════════');
console.log('  SilverScript ABI Verification');
console.log('  Contract: ' + cname);
console.log('  Schema:   ' + abi.schema_version);
console.log('  Compiler: ' + (abi.compiler_version || 'n/a'));
console.log('═══════════════════════════════════════════════');

// Runtime state fields (shows the State shape)
console.log('\n── Runtime State Fields ──');
if (contract.runtime_state && contract.runtime_state.fields) {
  contract.runtime_state.fields.forEach(f => {
    const ty = f.type.kind === 'fixed_bytes' ? 'byte[' + f.type.len + ']' : f.type.kind;
    console.log('  ' + f.name.padEnd(20) + ' ' + ty);
  });
}

// Dispatch tags
console.log('\n── Dispatch Tags ──');
let allPass = true;
const entries = contract.entries || {};
for (const [name, entry] of Object.entries(entries)) {
  const tag = entry.dispatch_tag;
  const expected = KNOWN[name];
  let verdict;
  if (expected) {
    verdict = tag === expected ? '✅ MATCH' : '❌ MISMATCH (expected ' + expected + ')';
    if (tag !== expected) allPass = false;
  } else {
    verdict = '❓ unknown entry (no reference)';
  }
  console.log('  ' + name.padEnd(10) + ' ' + tag + '  ' + verdict);
}

// Check for missing known entries
for (const [name, expected] of Object.entries(KNOWN)) {
  if (!entries[name]) {
    console.log('  ' + name.padEnd(10) + ' MISSING  ❌');
    allPass = false;
  }
}

// Bytecode + template hash summary
console.log('\n── Compiled Artifact ──');
if (contract.compiled) {
  const bc = contract.compiled.bytecode;
  console.log('  bytecode:      ' + bc.length + ' bytes');
  if (contract.compiled.template_hash) {
    console.log('  template_hash: ' + contract.compiled.template_hash.map(b => b.toString(16).padStart(2,'0')).join(''));
  }
  if (contract.compiled.state_span) {
    console.log('  state_span:    offset=' + contract.compiled.state_span.offset + ' len=' + contract.compiled.state_span.len);
  }
}

console.log('\n═══════════════════════════════════════════════');
console.log(allPass ? '  ✅ ALL TAGS VERIFIED' : '  ❌ VERIFICATION FAILED');
console.log('═══════════════════════════════════════════════');
process.exit(allPass ? 0 : 1);
