const fs = require('fs');
const abi = JSON.parse(fs.readFileSync('edition-abi.json', 'utf8'));
const c = abi.contracts[Object.keys(abi.contracts)[0]];
function tn(t) {
  switch (t.kind) {
    case 'int': case 'temporal': return 'int';
    case 'byte': return 'byte';
    case 'bool': return 'bool';
    case 'fixed_bytes': return 'byte[' + t.len + ']';
    case 'pubkey': return 'pubkey';
    case 'sig': return 'sig';
    case 'datasig': return 'datasig';
    case 'bytes': return 'byte[]';
    default: return t.kind;
  }
}
console.log('struct EditionState {');
for (const f of c.runtime_state.fields) {
  console.log('    ' + tn(f.type) + ' ' + f.name + ';');
}
console.log('}');
