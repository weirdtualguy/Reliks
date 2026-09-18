const fs = require('fs');
const { blake3 } = require('@noble/hashes/blake3');

// adjust these two paths if your filenames differ
const ED_ABI  = 'art-edition.abi.json';
const FAC_ABI = 'factory-abi.json';

const toBuf = x => Array.isArray(x) ? Buffer.from(x) : Buffer.from(x, 'hex');

const ed  = JSON.parse(fs.readFileSync(ED_ABI,  'utf8'));
const fac = JSON.parse(fs.readFileSync(FAC_ABI, 'utf8'));

const edName  = Object.keys(ed.contracts)[0];
const facName = Object.keys(fac.contracts)[0];
const edC  = ed.contracts[edName];
const facC = fac.contracts[facName];

// --- extract ArtEdition template parts ---
const bc  = toBuf(edC.compiled.bytecode);
const { offset, len } = edC.compiled.state_span;
const prefix = bc.subarray(0, offset);
const suffix = bc.subarray(offset + len);

const encLen = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n), 0); return b; };
const h = blake3.create();
h.update(encLen(prefix.length)); h.update(prefix);
h.update(encLen(suffix.length)); h.update(suffix);
const computed = Buffer.from(h.digest());
const stated   = toBuf(edC.compiled.template_hash);

console.log(`${edName} template:`);
console.log('  prefix len:', prefix.length, '| suffix len:', suffix.length);
console.log('  computed hash:', computed.toString('hex'));
console.log('  stated   hash:', stated.toString('hex'));
console.log('  self-consistent:', computed.equals(stated) ? 'YES' : 'NO');

// --- does the factory embed that hash? ---
const facBc = toBuf(facC.compiled.bytecode);
const embedded = facBc.includes(stated);
console.log(`\n${facName} embeds ${edName} template_hash:`, embedded ? 'YES' : 'NO');
if (!embedded) {
  console.log('  WARNING: factory bytecode does NOT contain the edition template hash.');
  console.log('  -> mints will fail at validateOutputStateWithTemplate.');
  console.log('  -> recompile the factory with the current edition template metadata.');
}
