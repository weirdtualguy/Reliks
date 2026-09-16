const fs = require('fs');

// 1. Restore and patch Series.sil
const p = process.env.HOME + '/opt/silverscript/contracts/Series.sil';
const vault = 'vault/01-contracts/Series.v3.sil';
if (fs.existsSync(vault)) fs.copyFileSync(vault, p);
let s = fs.readFileSync(p, 'utf8');
s = s.replace(/byte\[568\] program_slot/g, 'byte[2048] art');
s = s.replace(/byte\[568\] slot = program_slot;/g, 'byte[2048] art = art;');
s = s.replace(/\.slot\b/g, '.art');
s = s.replace(/\bslot:/g, 'art:');
fs.writeFileSync(p, s);
console.log('✅ Series.sil: slot -> art, byte[2048]');

// 2. Patch bridge3.ts
let c = fs.readFileSync('src/bridge3.ts', 'utf8');
c = c.replace(/slot: string/g, 'art: string');
c = c.replace(/hx\(st\.slot\)/g, 'hx(st.art)');
fs.writeFileSync('src/bridge3.ts', c);
console.log('✅ bridge3.ts: slot -> art');

// 3. Patch series-v4.ts
c = fs.readFileSync('src/series-v4.ts', 'utf8');
c = c.replace(/slot: slotHex/g, 'art: slotHex');
if (c.indexOf('Buffer.alloc(568)') >= 0) c = c.split('Buffer.alloc(568)').join('Buffer.alloc(2048)');
fs.writeFileSync('src/series-v4.ts', c);
console.log('✅ series-v4.ts: slot -> art, alloc 2048');

// 4. Patch mint-v2.ts
c = fs.readFileSync('src/mint-v2.ts', 'utf8');
c = c.replace(/slot: F\.slotHex/g, 'art: F.slotHex');
c = c.replace(/slot: S\.slotHex/g, 'art: S.slotHex');
fs.writeFileSync('src/mint-v2.ts', c);
console.log('✅ mint-v2.ts: slot -> art');

// 5. Patch edition-run.ts
c = fs.readFileSync('src/edition-run.ts', 'utf8');
c = c.replace(/slot: F\.slotHex/g, 'art: F.slotHex');
fs.writeFileSync('src/edition-run.ts', c);
console.log('✅ edition-run.ts: slot -> art');

// 6. Patch series-js.ts if exists
if (fs.existsSync('src/series-js.ts')) {
  c = fs.readFileSync('src/series-js.ts', 'utf8');
  c = c.replace(/slot: slotHex/g, 'art: slotHex');
  fs.writeFileSync('src/series-js.ts', c);
  console.log('✅ series-js.ts: slot -> art');
}
