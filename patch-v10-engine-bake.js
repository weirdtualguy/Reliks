const fs = require('fs');
const p = 'sil/SeriesFactory-v10.sil';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('blake2b(engine_code)')) { console.log('already patched'); process.exit(0); }
const anchor = '        require(mints_left > 0);\n';
if (!s.includes(anchor)) { console.error('anchor not found'); process.exit(1); }
s = s.split(anchor).join(anchor + '        // Bake-force: commit the engine to the template so the live P2SH\n        // spk authenticates engine bytes + claimed state in one check.\n        require(blake2b(engine_code) == program_hash);\n        require(engine_lang >= 0 && engine_lang <= 1);\n');
fs.writeFileSync(p, s);
console.log('patched: mint now commits to the baked engine');
