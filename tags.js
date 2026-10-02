// tags.js — KCC-01 dispatch-tag derivation test + template-hash check
const { blake3 } = require('@noble/hashes/blake3');
const fs = require('fs');
const tag = s => Buffer.from(blake3(Buffer.from(s, 'utf8'))).subarray(0, 4).toString('hex');
const ser8 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const thash = (pre, suf) => Buffer.from(blake3(Buffer.concat([ser8(pre.length), pre, ser8(suf.length), suf]))).toString('hex');

function typeName(t) {
  switch (t.kind) {
    case 'int': return 'int'; case 'temporal': return 'temporal';
    case 'bool': return 'bool'; case 'byte': return 'byte';
    case 'bytes': return 'byte[]'; case 'string': return 'string';
    case 'pubkey': return 'pubkey'; case 'sig': return 'sig'; case 'datasig': return 'datasig';
    case 'fixed_bytes': return 'byte[' + t.len + ']';
    case 'fixed_array': return typeName(t.item) + '[' + t.len + ']';
    case 'dynamic_array': return typeName(t.item) + '[]';
    case 'struct': return t.name;
    default: return '?' + JSON.stringify(t);
  }
}
let fails = 0;
const check = (label, sig, want) => {
  const got = tag(sig), ok = got === want; if (!ok) fails++;
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + label + '  ' + JSON.stringify(sig) + ' -> ' + got + (ok ? '' : '  (want ' + want + ')'));
};
const info = (label, sig, want) => {
  const got = tag(sig);
  console.log((got === want ? 'PASS' : 'info') + '  ' + label + '  ' + JSON.stringify(sig) + ' -> ' + got + (got === want ? '' : '  (recorded ' + want + ')'));
};

// Group 1 — HANDOFF-recorded tags (runs with no arguments at all)
check('v4 list', 'list(sig,int)', '58838fa1');
check('v5+ list', 'list(int,sig)', '674a8ea4');
check('spend', 'spend(sig)', 'bf4a1660');
check('delegate', '__delegate()', '7f28fad6');
info('KCC20 leader', '__leader_transfer(State[],sig[],byte[])', '43997099');

// Groups 2+3 — artifact sweeps
for (const path of process.argv.slice(2)) {
  if (!fs.existsSync(path)) { console.log('SKIP  ' + path + ' (not found)'); continue; }
  const a = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (a.schema_version === undefined) {
    // OLD format (pre-#232 silverc): { contract_name, bytecode, abi, state_layout }
    console.log('\n' + path + '  [old format: ' + (a.contract_name || '?') + ']');
    for (const e of (a.abi || []))
      console.log('   derive  ' + e.name + '(' + e.inputs.map(i => i.type_name).join(',') + ')  ->  ' + tag(e.name + '(' + e.inputs.map(i => i.type_name).join(',') + ')'));
    if (a.state_layout && Array.isArray(a.bytecode)) {
      const bc = Buffer.from(a.bytecode), sl = a.state_layout;
      console.log('   template_hash(derived) = ' + thash(bc.subarray(0, sl.start), bc.subarray(sl.start + sl.len)));
    }
    continue;
  }
  // NEW format (master, post-#232): stored tags + state spans get VERIFIED
  console.log('\n' + path);
  for (const [cn, c] of Object.entries(a.contracts)) {
    for (const [en, e] of Object.entries(c.entries))
      check(cn + '::' + en, en + '(' + e.params.map(p => typeName(p.type)).join(',') + ')', e.dispatch_tag);
    const bc = Buffer.from(c.compiled.bytecode), sp = c.compiled.state_span;
    const th = thash(bc.subarray(0, sp.offset), bc.subarray(sp.offset + sp.len));
    const want = Buffer.from(c.compiled.template_hash).toString('hex');
    const ok = th === want; if (!ok) fails++;
    console.log((ok ? 'PASS' : 'FAIL') + '  ' + cn + ' template_hash  ' + th.slice(0, 16) + '...');
  }
}
console.log(fails ? '\n' + fails + ' FAILURE(S)' : '\nALL PASS');
process.exit(fails ? 1 : 0);
