const fs = require('fs');
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
const vault = 'vault/01-contracts/Series.v3.sil';
if (!fs.existsSync(vault)) { console.log('❌ vault backup missing'); process.exit(1); }
fs.copyFileSync(vault, p);
let s = fs.readFileSync(p, 'utf8');
const a = 'byte[568] program_slot', a2 = 'byte[2048] program_art';
const b = 'byte[568] slot = program_slot;', b2 = 'byte[2048] art = program_art;';
if (s.indexOf(a) < 0 || s.indexOf(b) < 0) { console.log('❌ v3 declarations not found'); process.exit(1); }
s = s.split(a).join(a2).split(b).join(b2);
s = s.replace(/\.slot\b/g, '.art');
s = s.replace(/\bslot:/g, 'art:');
fs.writeFileSync(p, s);
console.log('✅ Series.sil: ctor param program_art(2048) → field art(2048); body uses .art / art:');
